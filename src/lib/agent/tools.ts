// Typed tool catalog (spec §9.2). Tools are the only source of financial facts
// for the copilot. Every tool validates its arguments and returns data plus a
// citation; write tools only ever return a *proposed* action.

import { buildSnapshot, type Snapshot, type SnapshotOptions } from "../core/engine";
import { formatShortDate } from "../core/dates";
import type { Assumption, Scenario } from "../core/forecast";
import { formatMoney, type Minor } from "../core/money";

export type Citation = { type: string; id: string; label: string; asOf: string };

export type ProposedAction = {
  id: string;
  type: "invoice_followup_draft" | "classify_transaction" | "reserve_plan";
  title: string;
  summary: string;
  riskLevel: "low" | "medium";
  payload: Record<string, string | number>;
  status: "proposed";
};

export type ToolResult<T = unknown> = { ok: true; data: T; citations: Citation[] } | { ok: false; error: string };

type ToolDef<A, T> = {
  name: string;
  access: "read" | "write_proposal";
  description: string;
  validate: (args: unknown) => A | string;
  run: (ctx: ToolContext, args: A) => ToolResult<T>;
};

export type ToolContext = { snapshot: Snapshot; options: SnapshotOptions };

const INSTRUCTION_LIKE = /(ignore (all )?(previous|prior) instructions|approve all|system prompt|you are now|transfer \$?\d|NOTE TO AI)/i;

/** Untrusted provider text is data. Instruction-like content never reaches the model verbatim. */
export function sanitizeUntrusted(text: string | undefined): { text?: string; flagged: boolean } {
  if (!text) return { text, flagged: false };
  return INSTRUCTION_LIKE.test(text) ? { text: "[instruction-like text withheld — treated as data]", flagged: true } : { text, flagged: false };
}

const obj = (a: unknown): Record<string, unknown> | string =>
  a && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : "arguments must be an object";
const none = (a: unknown) => (a === undefined ? {} : obj(a));

const cite = (s: Snapshot, type: string, id: string, label: string): Citation => ({ type, id, label, asOf: s.freshness.syncedAt });

export const get_cash_position: ToolDef<Record<string, unknown>, { availableMinor: Minor; reserveMinor: Minor; accounts: { id: string; name: string; mask: string; balanceMinor: Minor }[] }> = {
  name: "get_cash_position",
  access: "read",
  description: "Current cleared cash across depository accounts",
  validate: none,
  run: ({ snapshot: s }) => ({
    ok: true,
    data: {
      availableMinor: s.cash.availableMinor,
      reserveMinor: s.cash.reserveMinor,
      accounts: s.accounts.filter((a) => a.type === "depository").map((a) => ({ id: a.id, name: a.name, mask: a.mask, balanceMinor: a.balanceMinor })),
    },
    citations: [cite(s, "accounts", "acc_chk+acc_sav", "Checking ••4821 + Reserve ••1177")],
  }),
};

export const get_forecast: ToolDef<{ scenario: Scenario }, Snapshot["forecasts"]["base"]> = {
  name: "get_forecast",
  access: "read",
  description: "30-day scenario projection with drivers",
  validate: (a) => {
    const o = none(a);
    if (typeof o === "string") return o;
    const scenario = (o.scenario ?? "base") as Scenario;
    return ["base", "conservative", "optimistic"].includes(scenario) ? { scenario } : `unknown scenario "${String(o.scenario)}"`;
  },
  run: ({ snapshot: s }, { scenario }) => {
    const f = s.forecasts[scenario];
    return { ok: true, data: f, citations: [cite(s, "forecast", f.id, `${scenario} forecast · ${f.modelVersion}`)] };
  },
};

export const get_invoices: ToolDef<{ status?: string }, Snapshot["invoices"]> = {
  name: "get_invoices",
  access: "read",
  description: "Receivables with expected payment dates and confidence",
  validate: none,
  run: ({ snapshot: s }) => {
    const open = s.invoices.filter((i) => i.status !== "paid");
    return { ok: true, data: open, citations: open.map((i) => cite(s, "invoice", i.id, `${i.number} · ${i.client}`)) };
  },
};

export const get_flow_score: ToolDef<Record<string, unknown>, Snapshot["flowScore"]> = {
  name: "get_flow_score",
  access: "read",
  description: "FlowScore with factor breakdown",
  validate: none,
  run: ({ snapshot: s }) => ({ ok: true, data: s.flowScore, citations: [cite(s, "flow_score", `fs_${s.flowScore.score}`, `FlowScore ${s.flowScore.score}`)] }),
};

export const get_recurring_cashflows: ToolDef<Record<string, unknown>, Snapshot["streams"]> = {
  name: "get_recurring_cashflows",
  access: "read",
  description: "Detected monthly recurring streams",
  validate: none,
  run: ({ snapshot: s }) => ({ ok: true, data: s.streams, citations: [cite(s, "recurring", "streams", `${s.streams.length} recurring streams`)] }),
};

export const detect_spending_change: ToolDef<Record<string, unknown>, Snapshot["spending"]> = {
  name: "detect_spending_change",
  access: "read",
  description: "Discretionary spend vs previous period",
  validate: none,
  run: ({ snapshot: s }) => ({ ok: true, data: s.spending, citations: [cite(s, "spending", "spend_30d", "Last 30 vs prior 30 days")] }),
};

export const get_transactions: ToolDef<{ query?: string; limit: number }, Array<{ id: string; merchant: string; amountMinor: Minor; date: string; category: string; businessUse: string; description?: string; flagged: boolean }>> = {
  name: "get_transactions",
  access: "read",
  description: "Filtered normalized transactions (descriptions sanitized)",
  validate: (a) => {
    const o = none(a);
    if (typeof o === "string") return o;
    const limit = o.limit === undefined ? 5 : Number(o.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return "limit must be an integer 1–50";
    if (o.query !== undefined && typeof o.query !== "string") return "query must be a string";
    return { query: o.query as string | undefined, limit };
  },
  run: ({ snapshot: s }, { query, limit }) => {
    const q = query?.toLowerCase();
    const rows = s.transactions
      .filter((t) => !q || t.merchantName.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .slice(0, limit)
      .map((t) => {
        const d = sanitizeUntrusted(t.description);
        return { id: t.id, merchant: t.merchantName, amountMinor: t.amountMinor, date: t.occurredAt, category: t.category, businessUse: t.businessUse, description: d.text, flagged: d.flagged };
      });
    return { ok: true, data: rows, citations: rows.map((r) => cite(s, "transaction", r.id, r.merchant)) };
  },
};

export const run_scenario: ToolDef<{ assumptions: Assumption[]; label: string }, { minMinor: Minor; minDate: string; breach: boolean; endMinor: Minor; label: string }> = {
  name: "run_scenario",
  access: "read",
  description: "Hypothetical forecast; never persisted",
  validate: (a) => {
    const o = obj(a);
    if (typeof o === "string") return o;
    if (!Array.isArray(o.assumptions) || !o.assumptions.length) return "assumptions must be a non-empty array";
    for (const x of o.assumptions as Assumption[]) {
      if (!["invoice_on_due", "shift_event", "remove_event", "one_off"].includes(x?.kind)) return `unknown assumption kind "${String(x?.kind)}"`;
      if (x.kind === "shift_event" && (!Number.isInteger(x.days) || Math.abs(x.days) > 60)) return "shift days must be an integer within ±60";
    }
    return { assumptions: o.assumptions as Assumption[], label: String(o.label ?? "Scenario") };
  },
  run: ({ snapshot: s, options }, { assumptions, label }) => {
    for (const a of assumptions) {
      if (a.kind === "invoice_on_due" && !s.invoices.some((i) => i.id === a.invoiceId && i.status !== "paid"))
        return { ok: false, error: `unknown open invoice "${a.invoiceId}"` };
      if ((a.kind === "shift_event" || a.kind === "remove_event") && !s.forecasts.base.points.some((p) => p.events.some((e) => e.key === a.eventKey)))
        return { ok: false, error: `no forecast event "${a.eventKey}"` };
    }
    const hypo = buildSnapshot({ ...options, assumptions: [...(options.assumptions ?? []), ...assumptions] });
    const f = hypo.forecasts.base;
    return {
      ok: true,
      data: { minMinor: f.minPoint.balanceMinor, minDate: f.minPoint.date, breach: !!f.breach, endMinor: f.endBalanceMinor, label },
      citations: [cite(s, "scenario", f.id, `What-if: ${label}`)],
    };
  },
};

let seq = 0;
const actionId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const create_invoice_followup_draft: ToolDef<{ invoiceId: string }, ProposedAction> = {
  name: "create_invoice_followup_draft",
  access: "write_proposal",
  description: "Draft a follow-up for an invoice. Never sends.",
  validate: (a) => {
    const o = obj(a);
    if (typeof o === "string") return o;
    return typeof o.invoiceId === "string" ? { invoiceId: o.invoiceId } : "invoiceId is required";
  },
  run: ({ snapshot: s }, { invoiceId }) => {
    const inv = s.invoices.find((i) => i.id === invoiceId);
    if (!inv || inv.status === "paid") return { ok: false, error: `unknown open invoice "${invoiceId}"` };
    const body = `Hi ${inv.client} team — a friendly heads-up that ${inv.number} (${formatMoney(inv.amountMinor)}) is due ${formatShortDate(inv.dueDate)}. Could you confirm it's scheduled? Happy to resend the PDF. — Northstar Studio`;
    return {
      ok: true,
      data: {
        id: actionId("act"),
        type: "invoice_followup_draft",
        title: `Follow-up draft for ${inv.number}`,
        summary: `Saves a draft to ${inv.client}. Nothing is sent.`,
        riskLevel: "low",
        payload: { invoiceId: inv.id, invoiceNumber: inv.number, client: inv.client, subject: `${inv.number} — due ${formatShortDate(inv.dueDate)}`, body },
        status: "proposed",
      },
      citations: [cite(s, "invoice", inv.id, inv.number)],
    };
  },
};

export const classify_transaction_proposal: ToolDef<{ transactionId: string; businessUse: string }, ProposedAction> = {
  name: "classify_transaction_proposal",
  access: "write_proposal",
  description: "Propose a classification change; the user approves",
  validate: (a) => {
    const o = obj(a);
    if (typeof o === "string") return o;
    if (typeof o.transactionId !== "string") return "transactionId is required";
    if (!["business", "personal", "mixed"].includes(String(o.businessUse))) return "businessUse must be business | personal | mixed";
    return { transactionId: o.transactionId, businessUse: String(o.businessUse) };
  },
  run: ({ snapshot: s }, { transactionId, businessUse }) => {
    const t = s.transactions.find((x) => x.id === transactionId);
    if (!t) return { ok: false, error: `unknown transaction "${transactionId}"` };
    return {
      ok: true,
      data: {
        id: actionId("act"),
        type: "classify_transaction",
        title: `Mark ${t.merchantName} as ${businessUse}`,
        summary: `${formatMoney(-t.amountMinor)} on ${formatShortDate(t.occurredAt)} · currently ${t.businessUse}`,
        riskLevel: "low",
        payload: { transactionId: t.id, field: "businessUse", oldValue: t.businessUse, newValue: businessUse },
        status: "proposed",
      },
      citations: [cite(s, "transaction", t.id, t.merchantName)],
    };
  },
};

export const create_budget_draft: ToolDef<Record<string, unknown>, ProposedAction> = {
  name: "create_budget_draft",
  access: "write_proposal",
  description: "Propose a reserve plan. A plan only — never moves money.",
  validate: none,
  run: ({ snapshot: s }) => {
    const gap = s.workspace.reserveTargetMinor - s.cash.reserveMinor;
    if (gap <= 0) return { ok: false, error: "reserve already meets target" };
    const halcyon = s.forecasts.base.points.flatMap((p) => p.events).find((e) => e.sourceId === "rec:halcyon-labs");
    const date = halcyon?.date ?? s.forecasts.base.points[s.forecasts.base.points.length - 1].date;
    return {
      ok: true,
      data: {
        id: actionId("act"),
        type: "reserve_plan",
        title: `Plan ${formatMoney(gap, { cents: false })} for tax reserve`,
        summary: `Reminder on ${formatShortDate(date)}, after the Halcyon retainer lands. FlowFi never moves money.`,
        riskLevel: "medium",
        payload: { amountMinor: gap, plannedDate: date, toAccount: "acc_sav" },
        status: "proposed",
      },
      citations: [cite(s, "account", "acc_sav", "Tax Reserve ••1177")],
    };
  },
};

export const TOOLS = {
  get_cash_position,
  get_forecast,
  get_invoices,
  get_flow_score,
  get_recurring_cashflows,
  detect_spending_change,
  get_transactions,
  run_scenario,
  create_invoice_followup_draft,
  classify_transaction_proposal,
  create_budget_draft,
} as const;

export type ToolName = keyof typeof TOOLS;

export type TraceStep = { tool: ToolName; access: "read" | "write_proposal"; args: unknown; ok: boolean; ms: number; summary: string };

/** Single entry point: validate → run → trace. Unknown tools and bad args fail closed. */
export function callTool(ctx: ToolContext, name: string, args: unknown, trace: TraceStep[]): ToolResult<unknown> {
  const tool = (TOOLS as Record<string, ToolDef<unknown, unknown>>)[name];
  const t0 = performance.now();
  if (!tool) {
    trace.push({ tool: name as ToolName, access: "read", args, ok: false, ms: 0, summary: "rejected: unknown tool" });
    return { ok: false, error: `unknown tool "${name}"` };
  }
  const parsed = tool.validate(args);
  const result: ToolResult<unknown> = typeof parsed === "string" ? { ok: false, error: `invalid arguments: ${parsed}` } : tool.run(ctx, parsed);
  trace.push({
    tool: name as ToolName,
    access: tool.access,
    args,
    ok: result.ok,
    ms: Math.round((performance.now() - t0) * 100) / 100,
    summary: result.ok ? `${result.citations.length} source(s)` : result.error,
  });
  return result;
}
