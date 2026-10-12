"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { ExecuteResult } from "@/lib/agent/actions";
import { sanitizeUntrusted, type ProposedAction } from "@/lib/agent/tools";
import { formatShortDate } from "@/lib/core/dates";
import { formatMoney } from "@/lib/core/money";
import { api, useSnap } from "@/lib/client";
import { useDemo } from "@/lib/store";
import { HoldButton } from "../shared/HoldButton";
import { BottomSheet, EASE, Label, Pill, Segmented, useNav } from "./ui";

export function Sheets() {
  const nav = useNav();
  const s = nav.sheet;
  const close = () => nav.open(null);
  return (
    <>
      <BottomSheet open={s?.kind === "why"} onClose={close} title="Why the balance dips">
        <WhySheet />
      </BottomSheet>
      <BottomSheet open={s?.kind === "tx"} onClose={close} title="Transaction">
        {s?.kind === "tx" && <TxSheet id={s.id} />}
      </BottomSheet>
      <BottomSheet open={s?.kind === "action"} onClose={close} title="Review proposed action">
        {s?.kind === "action" && <ActionSheet messageId={s.messageId} action={s.action} onDone={close} />}
      </BottomSheet>
      <BottomSheet open={s?.kind === "invoice"} onClose={close} title="Invoice">
        {s?.kind === "invoice" && <InvoiceSheet id={s.id} />}
      </BottomSheet>
    </>
  );
}

function WhySheet() {
  const { data } = useSnap();
  const nav = useNav();
  const completeTour = useDemo((s) => s.completeTour);
  useEffect(() => completeTour("why", "drivers"), [completeTour]);
  if (!data) return null;
  const f = data.forecasts.base;
  const max = Math.max(...f.drivers.map((d) => Math.abs(d.impactMinor)), 1);
  return (
    <div>
      <Label>Why {formatShortDate(f.minPoint.date)} is the low point</Label>
      <div className="tnum mt-1 text-[30px] font-semibold tracking-tight">{formatMoney(f.minPoint.balanceMinor)}</div>
      <div className="text-[12px] text-app-muted">
        Starting from {formatMoney(f.startBalanceMinor)} today. Dominant drivers between now and then:
      </div>
      <ul className="mt-5 space-y-4" data-tour="drivers">
        {f.drivers.map((d, i) => (
          <li key={d.name}>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="font-medium">
                {d.name}
                {d.type === "invoice_delay" && <span className="ml-1.5"><Pill tone="risk">Delayed receivable</Pill></span>}
              </span>
              <span className="tnum shrink-0 text-app-muted">{formatMoney(d.impactMinor)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-app-line">
              <motion.div className={`h-full rounded-full ${i < 2 ? "bg-app-risk" : "bg-app-ink/60"}`} initial={{ width: 0 }} animate={{ width: `${(Math.abs(d.impactMinor) / max) * 100}%` }} transition={{ delay: 0.15 + i * 0.1, duration: 0.7, ease: EASE }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 rounded-2xl bg-app-card p-3 text-[12px] leading-relaxed text-app-muted">
        A delayed receivable counts as a driver because it was due before the low point but is expected after it. Data as of {new Date(f.dataFreshness).toUTCString().slice(5, 22)} UTC.
      </div>
      <button onClick={() => nav.ask("What should I do?")} className="mt-4 w-full rounded-full bg-app-ink py-3 text-[14px] font-medium text-white">
        Ask FlowFi what to do
      </button>
    </div>
  );
}

function TxSheet({ id }: { id: string }) {
  const { data } = useSnap();
  const addOverride = useDemo((s) => s.addOverride);
  const [raw, setRaw] = useState(false);
  const t = data?.transactions.find((x) => x.id === id);
  if (!t || !data) return null;
  const acct = data.accounts.find((a) => a.id === t.accountId);
  const memo = sanitizeUntrusted(t.description);
  return (
    <div>
      <div className="flex items-center gap-2">
        {t.pending ? <Pill>Pending</Pill> : <Pill tone="accent">Posted</Pill>}
        <span className="text-[11px] text-app-muted">{t.category}</span>
      </div>
      <div className={`tnum mt-2 text-[34px] font-semibold tracking-tight ${t.amountMinor > 0 ? "text-app-accent" : ""}`}>{formatMoney(t.amountMinor, { sign: true })}</div>
      <div className="text-[15px] font-medium">{t.merchantName}</div>
      <div className="text-[12px] text-app-muted">
        {formatShortDate(t.occurredAt)} · {acct?.name} ••{acct?.mask}
      </div>

      {t.description && (
        <div className={`mt-4 rounded-2xl p-3 text-[12px] ${memo.flagged ? "bg-app-neg-soft" : "bg-app-card"}`}>
          <div className="flex items-center justify-between">
            <Label>{memo.flagged ? "⛨ Untrusted memo" : "Memo"}</Label>
            {memo.flagged && (
              <button onClick={() => setRaw((v) => !v)} className="text-[11px] font-medium text-app-neg">
                {raw ? "Hide raw" : "Show raw"}
              </button>
            )}
          </div>
          <div className="mt-1 leading-snug">{raw ? t.description : memo.text}</div>
          {memo.flagged && <div className="mt-1.5 text-[11px] text-app-muted">Contains instruction-like text. The copilot treats it as data and can’t be steered by it.</div>}
        </div>
      )}

      <div className="mt-4">
        <Label className="mb-2">Business use · manual override</Label>
        <Segmented
          id={`use-${t.id}`}
          value={t.businessUse === "unknown" ? ("unknown" as string) : t.businessUse}
          onChange={(v) => v !== t.businessUse && v !== "unknown" && addOverride(t.id, v, t.businessUse)}
          options={[
            ["business", "Business"],
            ["personal", "Personal"],
            ["mixed", "Mixed"],
            ...(t.businessUse === "unknown" ? [["unknown", "Unknown"] as [string, string]] : []),
          ]}
        />
        <div className="mt-1.5 text-[11px] text-app-muted">Changes are recorded in the audit trail.</div>
      </div>

      <div className="mt-4 rounded-2xl bg-app-card p-3 font-mono text-[10.5px] leading-5 text-app-muted">
        <div>provider: {t.provider} · {t.provenance.source}</div>
        <div className="truncate">provider_txn_id: {t.providerTransactionId}</div>
        <div>synced_at: {t.provenance.syncedAt}</div>
        <div>id: {t.id}</div>
      </div>
    </div>
  );
}

function ActionSheet({ messageId, action, onDone }: { messageId: string; action: ProposedAction; onDone: () => void }) {
  const applyEffect = useDemo((s) => s.applyEffect);
  const pushAudit = useDemo((s) => s.pushAudit);
  const setStatus = useDemo((s) => s.setActionStatus);
  const completeTour = useDemo((s) => s.completeTour);
  const [error, setError] = useState<string | null>(null);
  const p = action.payload;

  const approve = async () => {
    const { data } = await api<ExecuteResult>("/api/actions/approve", { action, approval: { method: "hold_to_confirm", confirmedAt: new Date().toISOString() } }, "approve");
    pushAudit(...data.audit);
    if (!data.ok) {
      setError(data.error);
      return;
    }
    applyEffect(data.effect);
    setStatus(messageId, action.id, "approved");
    completeTour("hold");
    setTimeout(onDone, 900);
  };

  const reject = () => {
    pushAudit({ id: `aud_rj_${Date.now()}`, at: new Date().toISOString(), actor: "user", action: "action.rejected", entityType: "proposed_action", entityId: action.id, metadata: { type: action.type } });
    setStatus(messageId, action.id, "rejected");
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Pill tone="ink">Proposed by copilot</Pill>
        <Pill tone={action.riskLevel === "low" ? "accent" : "risk"}>{action.riskLevel} risk</Pill>
      </div>
      <div className="mt-2 text-[20px] leading-tight font-semibold">{action.title}</div>

      <div className="mt-4 rounded-2xl bg-app-card p-4 text-[13px] leading-relaxed">
        {action.type === "invoice_followup_draft" && (
          <>
            <div className="text-[11px] text-app-muted">To {String(p.client)} · subject: {String(p.subject)}</div>
            <p className="mt-2">{String(p.body)}</p>
          </>
        )}
        {action.type === "classify_transaction" && (
          <div>
            Business use: <span className="text-app-muted line-through">{String(p.oldValue)}</span> → <strong>{String(p.newValue)}</strong>
          </div>
        )}
        {action.type === "reserve_plan" && (
          <div>
            Reminder to move <strong className="tnum">{formatMoney(Number(p.amountMinor))}</strong> to Tax Reserve on {formatShortDate(String(p.plannedDate))}.
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-[12px] text-app-muted">
        <li>✓ Saved inside FlowFi only</li>
        <li>✓ Nothing is sent, paid or transferred</li>
        <li>✓ Approval and execution are written to the audit trail</li>
      </ul>

      {error && <div className="mt-3 rounded-xl bg-app-neg-soft p-2.5 text-[12px] text-app-neg">Rejected by server: {error}</div>}

      <div className="mt-6 flex flex-col items-center gap-4" data-tour="hold">
        <HoldButton onConfirm={approve} />
        <button onClick={reject} className="text-[13px] font-medium text-app-muted">
          Reject
        </button>
      </div>
    </div>
  );
}

function InvoiceSheet({ id }: { id: string }) {
  const { data } = useSnap();
  const drafts = useDemo((s) => s.drafts);
  const inv = data?.invoices.find((i) => i.id === id);
  if (!inv) return null;
  const draft = drafts.find((d) => d.invoiceId === id);
  return (
    <div>
      <Label>{inv.client}</Label>
      <div className="mt-1 text-[22px] font-semibold">{inv.number}</div>
      <div className="tnum text-[30px] font-semibold tracking-tight">{formatMoney(inv.amountMinor)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl bg-app-card p-2.5">
          <div className="text-app-muted">Due</div>
          <div className="font-medium">{formatShortDate(inv.dueDate)}</div>
        </div>
        <div className="rounded-xl bg-app-card p-2.5">
          <div className="text-app-muted">{inv.status === "paid" ? "Paid" : "Expected"}</div>
          <div className="font-medium">{formatShortDate(inv.paidAt ?? inv.expectedDate!)}</div>
        </div>
      </div>
      {draft ? (
        <div className="mt-4 rounded-2xl bg-app-card p-3 text-[13px] leading-relaxed">
          <Label>Follow-up draft · not sent</Label>
          <div className="mt-1 text-[11px] text-app-muted">{draft.subject}</div>
          <p className="mt-1">{draft.body}</p>
        </div>
      ) : (
        inv.status !== "paid" && <div className="mt-4 text-[12px] text-app-muted">No follow-up yet. Ask the copilot “What should I do?” to draft one.</div>
      )}
    </div>
  );
}
