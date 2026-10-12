// Human approval boundary (spec §3.5). The only path from a proposal to an
// application write. Requires an explicit approval proof and a valid payload.

import type { ProposedAction } from "./tools";

export type Approval = { method: "hold_to_confirm" | "biometric"; confirmedAt: string };

export type AuditEvent = {
  id: string;
  at: string;
  actor: "user" | "copilot" | "system";
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, string | number | boolean>;
};

export type ActionEffect =
  | { kind: "followup"; invoiceId: string; draftId: string; subject: string; body: string }
  | { kind: "override"; transactionId: string; field: "businessUse"; newValue: string; oldValue: string }
  | { kind: "reserve_plan"; amountMinor: number; plannedDate: string };

export type ExecuteResult = { ok: true; effect: ActionEffect; audit: AuditEvent[] } | { ok: false; error: string; audit: AuditEvent[] };

const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length < 2000;

function validatePayload(a: ProposedAction): string | null {
  const p = a.payload ?? {};
  switch (a.type) {
    case "invoice_followup_draft":
      return str(p.invoiceId) && str(p.subject) && str(p.body) ? null : "follow-up payload requires invoiceId, subject, body";
    case "classify_transaction":
      return str(p.transactionId) && p.field === "businessUse" && ["business", "personal", "mixed"].includes(String(p.newValue))
        ? null
        : "classification payload invalid";
    case "reserve_plan":
      return Number.isSafeInteger(p.amountMinor) && Number(p.amountMinor) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(p.plannedDate))
        ? null
        : "reserve plan payload invalid";
    default:
      return `unknown action type "${(a as { type: string }).type}"`;
  }
}

let n = 0;
const auditId = () => `aud_${Date.now().toString(36)}${(n++).toString(36)}`;

export function executeAction(action: ProposedAction, approval: Approval | null | undefined, now = new Date().toISOString()): ExecuteResult {
  const base = { at: now, entityType: "proposed_action", entityId: action?.id ?? "unknown" };
  if (!approval || !["hold_to_confirm", "biometric"].includes(approval.method) || !approval.confirmedAt) {
    return { ok: false, error: "explicit approval required", audit: [{ id: auditId(), actor: "system", action: "action.rejected_unapproved", metadata: { type: action?.type ?? "unknown" }, ...base }] };
  }
  if (!action || action.status !== "proposed") {
    return { ok: false, error: "action is not in proposed state", audit: [{ id: auditId(), actor: "system", action: "action.failed", metadata: { reason: "bad state" }, ...base }] };
  }
  const invalid = validatePayload(action);
  if (invalid) {
    return { ok: false, error: invalid, audit: [{ id: auditId(), actor: "system", action: "action.failed", metadata: { reason: invalid }, ...base }] };
  }

  const p = action.payload;
  const effect: ActionEffect =
    action.type === "invoice_followup_draft"
      ? { kind: "followup", invoiceId: String(p.invoiceId), draftId: `draft_${action.id}`, subject: String(p.subject), body: String(p.body) }
      : action.type === "classify_transaction"
        ? { kind: "override", transactionId: String(p.transactionId), field: "businessUse", newValue: String(p.newValue), oldValue: String(p.oldValue) }
        : { kind: "reserve_plan", amountMinor: Number(p.amountMinor), plannedDate: String(p.plannedDate) };

  return {
    ok: true,
    effect,
    audit: [
      { id: auditId(), actor: "user", action: "action.approved", metadata: { type: action.type, method: approval.method, title: action.title }, ...base },
      { id: auditId(), actor: "system", action: "action.executed", metadata: { type: action.type, effect: effect.kind, sent: false }, ...base },
    ],
  };
}
