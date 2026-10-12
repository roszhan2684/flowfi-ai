import { addMonths, diffDays, formatShortDate, monthKey, type ISODate } from "./dates";
import { formatMoney, sumMinor, type Minor } from "./money";
import type { Forecast } from "./forecast";
import { isAtRisk } from "./invoices";
import type { SpendingChange } from "./spending";
import type { Invoice, NormalizedTransaction, RecurringStream } from "./types";

export type FlowScoreFactor = {
  key: "runway" | "income" | "expense_growth" | "receivables" | "obligations" | "reserve";
  label: string;
  points: number;
  max: number;
  direction: "positive" | "negative";
  value: string;
  detail: string;
};

export type FlowScore = {
  score: number;
  band: "Strong" | "Stable" | "Watch" | "At risk";
  factors: FlowScoreFactor[];
  asOf: ISODate;
  disclaimer: string;
};

const lerp01 = (x: number, zeroAt: number, fullAt: number) =>
  Math.min(1, Math.max(0, (x - zeroAt) / (fullAt - zeroAt)));

export function computeFlowScore(args: {
  asOf: ISODate;
  forecast: Forecast;
  streams: readonly RecurringStream[];
  txns: readonly NormalizedTransaction[];
  invoices: readonly Invoice[];
  spending: SpendingChange;
  reserveMinor: Minor;
  reserveTargetMinor: Minor;
}): FlowScore {
  const { asOf, forecast, streams, txns, invoices, spending, reserveMinor, reserveTargetMinor } = args;
  const factors: Omit<FlowScoreFactor, "direction">[] = [];

  // 1. Cash runway — days before the projected balance reaches the floor.
  const runwayDays = forecast.breach ? diffDays(forecast.breach.firstDate, asOf) : forecast.horizonDays;
  factors.push({
    key: "runway",
    label: "Cash runway",
    max: 25,
    points: Math.round((25 * runwayDays) / forecast.horizonDays),
    value: forecast.breach ? `${runwayDays} days` : `${forecast.horizonDays}+ days`,
    detail: forecast.breach
      ? `Balance crosses the ${formatMoney(forecast.floorMinor, { cents: false })} floor on ${formatShortDate(forecast.breach.firstDate)}`
      : `Stays above the ${formatMoney(forecast.floorMinor, { cents: false })} floor for ${forecast.horizonDays} days`,
  });

  // 2. Income consistency — variation of recurring income over 3 full months.
  const months = [-3, -2, -1].map((m) => monthKey(addMonths(`${asOf.slice(0, 7)}-01`, m)));
  const inflowIds = new Set(streams.filter((s) => s.direction === "inflow").flatMap((s) => s.transactionIds));
  const totals = months.map((mk) =>
    sumMinor(txns.filter((t) => inflowIds.has(t.id) && monthKey(t.occurredAt) === mk).map((t) => t.amountMinor)),
  );
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const cv = mean ? Math.sqrt(totals.reduce((a, t) => a + (t - mean) ** 2, 0) / totals.length) / mean : 1;
  factors.push({
    key: "income",
    label: "Income consistency",
    max: 20,
    points: Math.round(20 * (1 - lerp01(cv, 0, 0.5))),
    value: `${streams.filter((s) => s.direction === "inflow").length} retainers`,
    detail: `Recurring income varied ${Math.round(cv * 100)}% month to month`,
  });

  // 3. Expense growth — discretionary spend, last 30 days vs the 30 before.
  const g = spending.previousMinor ? (spending.currentMinor - spending.previousMinor) / spending.previousMinor : 0;
  const top = spending.largest[0];
  factors.push({
    key: "expense_growth",
    label: "Expense growth",
    max: 15,
    points: Math.round(15 * (1 - lerp01(g, 0.05, 0.5))),
    value: `${g >= 0 ? "+" : ""}${Math.round(g * 100)}%`,
    detail: top ? `Largest: ${top.merchant} ${formatMoney(top.amountMinor, { cents: false })}` : "No discretionary spend",
  });

  // 4. Receivables risk — at-risk invoices relative to expected inflows.
  const end = forecast.points[forecast.points.length - 1].date;
  const expectedIn = sumMinor(forecast.points.map((p) => p.inflowsMinor));
  const risky = invoices.filter((i) => isAtRisk(i) && i.dueDate <= end);
  const riskyMinor = sumMinor(risky.map((i) => i.amountMinor));
  const ratio = expectedIn ? Math.min(1, riskyMinor / expectedIn) : 0;
  factors.push({
    key: "receivables",
    label: "Receivables risk",
    max: 15,
    points: Math.round(15 * (1 - ratio)),
    value: `${Math.round(ratio * 100)}% at risk`,
    detail: risky.length ? `${risky.map((i) => i.number).join(", ")} likely late` : "No invoices at risk",
  });

  // 5. Recurring obligations — fixed outflows vs recurring income.
  const fixedOut = sumMinor(streams.filter((s) => s.direction === "outflow").map((s) => s.expectedAmountMinor));
  const fixedIn = sumMinor(streams.filter((s) => s.direction === "inflow").map((s) => s.expectedAmountMinor));
  const load = fixedIn ? fixedOut / fixedIn : 2;
  factors.push({
    key: "obligations",
    label: "Recurring obligations",
    max: 15,
    points: Math.round(15 * (1 - lerp01(load, 0.5, 1.2))),
    value: `${Math.round(load * 100)}% of retainers`,
    detail: `${formatMoney(fixedOut, { cents: false })}/mo fixed vs ${formatMoney(fixedIn, { cents: false })}/mo recurring income`,
  });

  // 6. Reserve coverage — tax reserve vs configured target.
  const cover = reserveTargetMinor ? reserveMinor / reserveTargetMinor : 1;
  factors.push({
    key: "reserve",
    label: "Reserve coverage",
    max: 10,
    points: Math.round(10 * Math.min(1, cover)),
    value: `${Math.round(cover * 100)}%`,
    detail: `${formatMoney(reserveMinor, { cents: false })} of ${formatMoney(reserveTargetMinor, { cents: false })} target`,
  });

  const withDir: FlowScoreFactor[] = factors.map((f) => ({ ...f, direction: f.points >= f.max * 0.6 ? "positive" : "negative" }));
  const score = withDir.reduce((a, f) => a + f.points, 0);
  return {
    score,
    band: score >= 75 ? "Strong" : score >= 60 ? "Stable" : score >= 40 ? "Watch" : "At risk",
    factors: withDir,
    asOf,
    disclaimer: "Not a credit score. It summarizes current FlowFi signals only.",
  };
}
