import { addDays, formatShortDate } from "./dates";
import { formatMoney, type Minor } from "./money";
import type { Forecast } from "./forecast";
import { isAtRisk } from "./invoices";
import type { Invoice, NormalizedTransaction, RecurringStream } from "./types";

export type AlertType =
  | "cash_threshold"
  | "invoice_risk"
  | "subscription_increase"
  | "unusual_spending"
  | "tax_reserve_gap"
  | "sync_stale";

export type Alert = {
  id: string;
  type: AlertType;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  recommendedAction: string;
  evidence: Array<{ type: string; id: string; label: string }>;
};

const UNUSUAL_MIN_MINOR = 100_000;
const SUBSCRIPTION_JUMP = 0.2;

export function buildAlerts(args: {
  forecast: Forecast;
  invoices: readonly Invoice[];
  streams: readonly RecurringStream[];
  txns: readonly NormalizedTransaction[];
  reserveMinor: Minor;
  reserveTargetMinor: Minor;
  freshness: { stale: boolean; ageHours: number };
}): Alert[] {
  const { forecast: f, invoices, streams, txns, reserveMinor, reserveTargetMinor, freshness } = args;
  const alerts: Alert[] = [];

  if (freshness.stale) {
    alerts.push({
      id: "al_sync_stale",
      type: "sync_stale",
      severity: "high",
      title: "Bank data is out of date",
      detail: `Last successful sync was ${freshness.ageHours} hours ago. Showing last good state.`,
      recommendedAction: "Retry sync",
      evidence: [{ type: "integration", id: "item_demo", label: "Demo provider item" }],
    });
  }

  if (f.breach) {
    alerts.push({
      id: "al_cash_threshold",
      type: "cash_threshold",
      severity: "high",
      title: `Cash may dip below ${formatMoney(f.floorMinor, { cents: false })} on ${formatShortDate(f.breach.firstDate)}`,
      detail: `Projected low ${formatMoney(f.breach.minBalanceMinor)} on ${formatShortDate(f.breach.minDate)} — ${formatMoney(f.breach.shortfallMinor)} under your floor.`,
      recommendedAction: "Review drivers",
      evidence: [{ type: "forecast", id: f.id, label: `${f.scenario} forecast` }],
    });
  }

  for (const inv of invoices) {
    if (inv.status === "paid" || !isAtRisk(inv)) continue;
    alerts.push({
      id: `al_invoice_${inv.id}`,
      type: "invoice_risk",
      severity: "medium",
      title: `${inv.number} likely late`,
      detail: `${inv.client} usually pays after the due date. Expected ${formatShortDate(inv.expectedDate!)} vs due ${formatShortDate(inv.dueDate)}.`,
      recommendedAction: "Draft follow-up",
      evidence: [{ type: "invoice", id: inv.id, label: `${inv.number} · ${formatMoney(inv.amountMinor, { cents: false })}` }],
    });
  }

  for (const s of streams) {
    if (s.direction !== "outflow" || s.expectedAmountMinor <= s.previousAmountMinor * (1 + SUBSCRIPTION_JUMP)) continue;
    alerts.push({
      id: `al_sub_${s.key}`,
      type: "subscription_increase",
      severity: "low",
      title: `${s.merchant} went up`,
      detail: `${formatMoney(s.previousAmountMinor)} → ${formatMoney(s.expectedAmountMinor)} per month.`,
      recommendedAction: "Review subscription",
      evidence: [{ type: "recurring", id: s.key, label: `${s.occurrences} charges` }],
    });
  }

  const recurringIds = new Set(streams.flatMap((s) => s.transactionIds));
  for (const t of txns) {
    if (t.kind !== "expense" || recurringIds.has(t.id) || -t.amountMinor < UNUSUAL_MIN_MINOR) continue;
    if (t.occurredAt < addDays(f.asOf, -30)) continue;
    alerts.push({
      id: `al_unusual_${t.id}`,
      type: "unusual_spending",
      severity: "medium",
      title: `Unusual ${t.category.toLowerCase()} purchase`,
      detail: `${t.merchantName} ${formatMoney(-t.amountMinor)} on ${formatShortDate(t.occurredAt)} — classified as ${t.businessUse}.`,
      recommendedAction: "Review & classify",
      evidence: [{ type: "transaction", id: t.id, label: t.merchantName }],
    });
  }

  if (reserveMinor < reserveTargetMinor) {
    alerts.push({
      id: "al_reserve_gap",
      type: "tax_reserve_gap",
      severity: "low",
      title: "Tax reserve below target",
      detail: `${formatMoney(reserveMinor, { cents: false })} of ${formatMoney(reserveTargetMinor, { cents: false })} — ${formatMoney(reserveTargetMinor - reserveMinor, { cents: false })} short.`,
      recommendedAction: "Plan reserve transfer",
      evidence: [{ type: "account", id: "acc_sav", label: "Tax Reserve ••1177" }],
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
