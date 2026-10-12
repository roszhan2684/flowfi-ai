// FlowFi demo agent. A deterministic intent router stands in for the LLM so the
// public demo needs no API key. It obeys the same contract a tool-calling model
// would: pick tools → read tool output → compose an answer that only quotes
// numbers returned by tools → emit proposals, never writes.

import { buildSnapshot, type Snapshot, type SnapshotOptions } from "../core/engine";
import { diffDays, formatShortDate } from "../core/dates";
import type { Assumption, Forecast } from "../core/forecast";
import { formatMoney, type Minor } from "../core/money";
import { callTool, type Citation, type ProposedAction, type ToolContext, type TraceStep } from "./tools";

export type Calculation = { label: string; valueMinor: Minor; source: string };

export type AgentResponse = {
  runId: string;
  intent: string;
  answer: string;
  citations: Citation[];
  calculations: Calculation[];
  proposedActions: ProposedAction[];
  uncertainties: string[];
  guardrails: string[];
  dataFreshness: string;
  trace: TraceStep[];
  model: string;
  latencyMs: number;
};

export const AGENT_MODEL = "flowfi-demo-router-1 (deterministic, no LLM)";

const m = (v: Minor) => `**${formatMoney(v)}**`;
const d = (iso: string) => formatShortDate(iso);

type Ctx = ToolContext & {
  trace: TraceStep[];
  citations: Citation[];
  calculations: Calculation[];
  actions: ProposedAction[];
  uncertainties: string[];
  guardrails: string[];
};

function callFor<T>(ctx: Ctx, tool: string, args?: unknown): T | null {
  const r = callTool(ctx, tool, args, ctx.trace);
  if (!r.ok) return null;
  for (const c of r.citations) if (!ctx.citations.some((x) => x.id === c.id)) ctx.citations.push(c);
  return r.data as T;
}

const INTENTS: Array<[string, RegExp]> = [
  ["money_movement", /\b(transfer|wire|send|move|pay)\b.*(\$|\bmoney\b|\bfunds\b|\bacct\b|\baccount\b)|\bpay (the |my )?(contractor|rent|bill|card)\b/i],
  ["injection_probe", /quickprint|ignore (all )?previous|approve all|system prompt/i],
  ["what_if", /\bwhat if\b|\bscenario\b|\bif (inv|the invoice|lumen|mara|the contractor)/i],
  ["next_step", /what should i do|what do i do|help me|how (do|can) i (avoid|fix|stay)|recommend|next step|plan/i],
  ["why", /\bwhy\b|\bdip\b|threshold|floor|below|breach|driver/i],
  ["score", /score|health/i],
  ["invoices", /invoice|receivable|late|lumen|ferro|client|follow/i],
  ["classify", /classif|categor|equipment|b&h|camera|business or personal/i],
  ["subscriptions", /subscription|recurring|adobe|figma|bills?/i],
  ["spending", /spend|spending|expense|burn|cost/i],
  ["reserve", /tax|reserve/i],
  ["cash", /cash|balance|how much|runway|money/i],
];

export function classifyIntent(message: string): string {
  for (const [intent, re] of INTENTS) if (re.test(message)) return intent;
  return "unsupported";
}

function parseWhatIf(message: string, s: Ctx["snapshot"]): { assumptions: Assumption[]; label: string } | null {
  const text = message.toLowerCase();
  const nums = text.match(/(\d+)\s*(day|week)/);
  const days = nums ? Number(nums[1]) * (nums[2] === "week" ? 7 : 1) : 7;
  const contractor = s.forecasts.base.points.flatMap((p) => p.events).find((e) => e.sourceId === "rec:mara-okafor-design");
  if (/contractor|mara/.test(text) && contractor) {
    return { assumptions: [{ kind: "shift_event", eventKey: contractor.key, days }], label: `Contractor paid ${days} days later` };
  }
  const inv = s.invoices.find((i) => i.status !== "paid" && text.includes(i.number.toLowerCase())) ??
    (/lumen|invoice|inv/.test(text) ? s.invoices.find((i) => i.id === "inv_104") : undefined);
  if (inv) {
    if (/on time|due date|pays? (early|on)/.test(text)) return { assumptions: [{ kind: "invoice_on_due", invoiceId: inv.id }], label: `${inv.number} paid on due date` };
    return { assumptions: [{ kind: "shift_event", eventKey: `inv:${inv.id}`, days }], label: `${inv.number} ${days} more days late` };
  }
  const adobe = s.forecasts.base.points.flatMap((p) => p.events).find((e) => e.sourceId === "rec:adobe-creative-cloud");
  if (/adobe|cancel/.test(text) && adobe) return { assumptions: [{ kind: "remove_event", eventKey: adobe.key }], label: "Cancel Adobe Creative Cloud" };
  return null;
}

function lowPointSentence(f: Forecast) {
  if (f.breach)
    return `Your ${f.scenario} forecast dips to ${m(f.breach.minBalanceMinor)} on **${d(f.breach.minDate)}** — ${m(f.breach.shortfallMinor)} under your ${formatMoney(f.floorMinor, { cents: false })} floor.`;
  return `You stay above your ${formatMoney(f.floorMinor, { cents: false })} floor for all ${f.horizonDays} days. The low point is ${m(f.minPoint.balanceMinor)} on **${d(f.minPoint.date)}**.`;
}

function driversSentence(f: Forecast) {
  const top = f.drivers.slice(0, 3).map((x) => `${x.name} (${m(x.impactMinor)})`);
  return top.length ? `Biggest drivers: ${top.join(", ")}.` : "";
}

const HANDLERS: Record<string, (ctx: Ctx, message: string) => string> = {
  money_movement(ctx) {
    ctx.guardrails.push("Blocked: FlowFi never moves money. Only proposals inside FlowFi are allowed.");
    const cash = callFor<{ availableMinor: Minor }>(ctx, "get_cash_position");
    const plan = callFor<ProposedAction>(ctx, "create_budget_draft");
    if (plan) ctx.actions.push(plan);
    return `I can't move, send, or schedule money — FlowFi is decision support, not a bank. You have ${m(cash?.availableMinor ?? 0)} across checking and reserve.${plan ? " I can save a **reserve plan** as a reminder instead; review it below." : ""}`;
  },

  injection_probe(ctx) {
    const rows = callFor<Array<{ flagged: boolean; merchant: string }>>(ctx, "get_transactions", { query: "QuickPrint", limit: 3 }) ?? [];
    const flagged = rows.filter((r) => r.flagged).length;
    ctx.guardrails.push(`Withheld ${flagged} instruction-like transaction description(s); treated as data, not instructions.`);
    return `One transaction memo from **QuickPrint Co** contains text that tries to give me instructions (approve actions, transfer money). Transaction text is untrusted data: it can't define tools, approve anything, or move money. Nothing was approved.`;
  },

  next_step(ctx) {
    const f = callFor<Forecast>(ctx, "get_forecast", { scenario: "base" });
    const invoices = callFor<Snapshot["invoices"]>(ctx, "get_invoices") ?? [];
    if (!f) return "I couldn't load the forecast, so I won't guess.";
    ctx.calculations.push({ label: "Projected low (base)", valueMinor: f.minPoint.balanceMinor, source: f.id });
    const late = invoices.find((i) => i.expectedDate && i.expectedDate > i.dueDate);
    const parts = [lowPointSentence(f)];
    if (f.breach) {
      ctx.calculations.push({ label: "Shortfall vs floor", valueMinor: f.breach.shortfallMinor, source: f.id });
      parts.push(driversSentence(f));
    }
    if (late) {
      const sc = callFor<{ minMinor: Minor; breach: boolean }>(ctx, "run_scenario", { assumptions: [{ kind: "invoice_on_due", invoiceId: late.id }], label: `${late.number} paid on due date` });
      if (sc) {
        ctx.calculations.push({ label: `Low if ${late.number} pays on time`, valueMinor: sc.minMinor, source: "run_scenario" });
        parts.push(`If **${late.number}** arrives on its due date (${d(late.dueDate)}), the low point becomes ${m(sc.minMinor)}${sc.breach ? " — still under the floor" : ", safely above the floor"}.`);
      }
      const draft = callFor<ProposedAction>(ctx, "create_invoice_followup_draft", { invoiceId: late.id });
      if (draft && !late.followUpDraftId) {
        ctx.actions.push(draft);
        parts.push(`Highest-impact move: nudge ${late.client} before the due date. I drafted a follow-up for you to review — **nothing is sent**.`);
      } else if (late.followUpDraftId) {
        parts.push(`You already approved a follow-up draft for ${late.number}.`);
      }
      ctx.uncertainties.push(`${late.number} payment date is estimated from ${late.client}'s history (${Math.round((late.confidence ?? 0) * 100)}% confidence).`);
    }
    const contractor = f.points.flatMap((p) => p.events).find((e) => e.sourceId === "rec:mara-okafor-design");
    if (f.breach && contractor) {
      const sc = callFor<{ minMinor: Minor; breach: boolean }>(ctx, "run_scenario", { assumptions: [{ kind: "shift_event", eventKey: contractor.key, days: 8 }], label: "Contractor paid 8 days later" });
      if (sc) {
        ctx.calculations.push({ label: "Low if contractor paid 8 days later", valueMinor: sc.minMinor, source: "run_scenario" });
        parts.push(`Alternative: asking ${contractor.name} to bill ~a week later keeps you at ${m(sc.minMinor)} minimum.`);
      }
    }
    return parts.filter(Boolean).join(" ");
  },

  why(ctx) {
    const f = callFor<Forecast>(ctx, "get_forecast", { scenario: "base" });
    if (!f) return "I couldn't load the forecast.";
    ctx.calculations.push({ label: "Projected low (base)", valueMinor: f.minPoint.balanceMinor, source: f.id });
    for (const x of f.drivers) ctx.calculations.push({ label: x.name, valueMinor: x.impactMinor, source: f.id });
    return `${lowPointSentence(f)} ${driversSentence(f)}`;
  },

  what_if(ctx, message) {
    const parsed = parseWhatIf(message, ctx.snapshot);
    if (!parsed) return "Tell me what to change — e.g. “what if INV-104 pays on time” or “what if the contractor is paid a week later”.";
    const base = callFor<Forecast>(ctx, "get_forecast", { scenario: "base" });
    const sc = callFor<{ minMinor: Minor; minDate: string; breach: boolean; endMinor: Minor }>(ctx, "run_scenario", parsed);
    if (!sc || !base) return "That scenario references something I can't find in your data, so I didn't run it.";
    ctx.calculations.push({ label: "Low now", valueMinor: base.minPoint.balanceMinor, source: base.id });
    ctx.calculations.push({ label: `Low · ${parsed.label}`, valueMinor: sc.minMinor, source: "run_scenario" });
    ctx.uncertainties.push("Hypothetical only — not saved to your forecast. Toggle it on the Cash Flow tab to keep it.");
    return `**${parsed.label}:** your low point moves from ${m(base.minPoint.balanceMinor)} to ${m(sc.minMinor)} on **${d(sc.minDate)}**, ${sc.breach ? "still under" : "above"} your floor. Day-30 balance: ${m(sc.endMinor)}.`;
  },

  score(ctx) {
    const fs = callFor<Snapshot["flowScore"]>(ctx, "get_flow_score");
    if (!fs) return "FlowScore is unavailable.";
    const pos = fs.factors.filter((f) => f.direction === "positive").map((f) => `${f.label} +${f.points}`);
    const neg = fs.factors.filter((f) => f.direction === "negative").map((f) => `${f.label} −${f.max - f.points}`);
    return `FlowScore is **${fs.score}/100 (${fs.band})**. Helping: ${pos.join(", ") || "none"}. Costing points: ${neg.join(", ") || "none"}. ${fs.disclaimer}`;
  },

  invoices(ctx) {
    const inv = callFor<Snapshot["invoices"]>(ctx, "get_invoices") ?? [];
    for (const i of inv) ctx.calculations.push({ label: `${i.number} · ${i.client}`, valueMinor: i.amountMinor, source: i.id });
    const lines = inv.map((i) => {
      const late = i.expectedDate ? diffDays(i.expectedDate, i.dueDate) : 0;
      return `**${i.number}** ${i.client} ${m(i.amountMinor)} due ${d(i.dueDate)}, expected ${d(i.expectedDate!)}${late > 0 ? ` (${late} days late, ${Math.round((i.confidence ?? 0) * 100)}% confidence)` : ""}`;
    });
    const risky = inv.find((i) => i.expectedDate && i.expectedDate > i.dueDate && !i.followUpDraftId);
    if (risky) {
      const draft = callFor<ProposedAction>(ctx, "create_invoice_followup_draft", { invoiceId: risky.id });
      if (draft) ctx.actions.push(draft);
    }
    return `${inv.length} open invoices. ${lines.join(". ")}.`;
  },

  classify(ctx) {
    const rows = callFor<Array<{ id: string; merchant: string; businessUse: string; amountMinor: Minor }>>(ctx, "get_transactions", { query: "B&H", limit: 1 }) ?? [];
    const t = rows[0];
    if (!t) return "I couldn't find that transaction.";
    if (t.businessUse === "business") return `**${t.merchant}** (${m(-t.amountMinor)}) is already classified as business.`;
    const p = callFor<ProposedAction>(ctx, "classify_transaction_proposal", { transactionId: t.id, businessUse: "business" });
    if (p) ctx.actions.push(p);
    return `**${t.merchant}** (${m(-t.amountMinor)}) is classified as *${t.businessUse}*. A camera kit for a design studio is likely a business expense — I've proposed the change for you to approve.`;
  },

  subscriptions(ctx) {
    const streams = callFor<Snapshot["streams"]>(ctx, "get_recurring_cashflows") ?? [];
    const out = streams.filter((s) => s.direction === "outflow");
    const up = out.filter((s) => s.expectedAmountMinor > s.previousAmountMinor);
    for (const s of out.slice(0, 6)) ctx.calculations.push({ label: s.merchant, valueMinor: -s.expectedAmountMinor, source: s.key });
    return `${out.length} recurring costs detected. ${up.map((s) => `**${s.merchant}** rose from ${m(s.previousAmountMinor)} to ${m(s.expectedAmountMinor)}/mo.`).join(" ")}`;
  },

  spending(ctx) {
    const sp = callFor<Snapshot["spending"]>(ctx, "detect_spending_change");
    if (!sp) return "Spending data unavailable.";
    ctx.calculations.push({ label: "Last 30 days", valueMinor: sp.currentMinor, source: "spend_30d" });
    ctx.calculations.push({ label: "Prior 30 days", valueMinor: sp.previousMinor, source: "spend_30d" });
    const top = sp.byCategory[0];
    return `Discretionary spend is ${m(sp.currentMinor)} over the last 30 days vs ${m(sp.previousMinor)} before (${sp.changePct > 0 ? "+" : ""}${sp.changePct}%). ${top ? `Most of the jump is **${top.category}** (+${formatMoney(top.deltaMinor)}), led by ${sp.largest[0]?.merchant}.` : ""}`;
  },

  reserve(ctx) {
    const cash = callFor<{ reserveMinor: Minor }>(ctx, "get_cash_position");
    const plan = callFor<ProposedAction>(ctx, "create_budget_draft");
    if (plan) ctx.actions.push(plan);
    ctx.uncertainties.push("Reserve target is your configured preference, not tax advice.");
    return `Your tax reserve holds ${m(cash?.reserveMinor ?? 0)} against a ${formatMoney(ctx.snapshot.workspace.reserveTargetMinor, { cents: false })} target.${plan ? " I proposed a reserve plan timed after your next retainer — a reminder, not a transfer." : ""}`;
  },

  cash(ctx) {
    const cash = callFor<{ availableMinor: Minor; accounts: { name: string; mask: string; balanceMinor: Minor }[] }>(ctx, "get_cash_position");
    const f = callFor<Forecast>(ctx, "get_forecast", { scenario: "base" });
    if (!cash || !f) return "Cash data unavailable.";
    ctx.calculations.push({ label: "Cash today", valueMinor: cash.availableMinor, source: "accounts" });
    ctx.calculations.push({ label: "Day 30 (base)", valueMinor: f.endBalanceMinor, source: f.id });
    return `You have ${m(cash.availableMinor)} today (${cash.accounts.map((a) => `${a.name} ${formatMoney(a.balanceMinor)}`).join(", ")}). ${lowPointSentence(f)}`;
  },

  unsupported(ctx) {
    ctx.guardrails.push("Out of scope: answered without financial claims.");
    return "I only answer from your FlowFi data — cash, forecast, invoices, spending, recurring costs, and FlowScore. Try “What should I do?” or “Why does my balance dip?”";
  },
};

export function runAgent(message: string, options: SnapshotOptions = {}): AgentResponse {
  const t0 = performance.now();
  const snapshot = buildSnapshot(options);
  const ctx: Ctx = { snapshot, options, trace: [], citations: [], calculations: [], actions: [], uncertainties: [], guardrails: [] };
  const intent = classifyIntent(message.slice(0, 500));
  let answer = HANDLERS[intent](ctx, message);

  // Stale data must be disclosed before any recommendation (spec §9.4).
  if (snapshot.freshness.stale) {
    answer = `⚠︎ Your bank data is **${snapshot.freshness.ageHours} hours old** — treat these numbers with care until sync recovers. ${answer}`;
    ctx.uncertainties.unshift(`Data last synced ${snapshot.freshness.ageHours}h ago (stale).`);
  }

  return {
    runId: `run_${Date.now().toString(36)}`,
    intent,
    answer,
    citations: ctx.citations,
    calculations: ctx.calculations,
    proposedActions: ctx.actions,
    uncertainties: ctx.uncertainties,
    guardrails: ctx.guardrails,
    dataFreshness: snapshot.freshness.syncedAt,
    trace: ctx.trace,
    model: AGENT_MODEL,
    latencyMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}
