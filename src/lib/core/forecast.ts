import { addDays, addMonths, diffDays, formatShortDate, type ISODate } from "./dates";
import { formatMoney, scaleMinor, sumMinor, type Minor } from "./money";
import type { CashObligation, Invoice, NormalizedTransaction, RecurringStream } from "./types";

export const MODEL_VERSION = "det-forecast-1.0";
export const SCENARIOS = ["base", "conservative", "optimistic"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_RULES: Record<Scenario, { variableFactor: number; delayUncertainDays: number; label: string }> = {
  base: { variableFactor: 1, delayUncertainDays: 0, label: "Expected dates, average spend" },
  conservative: { variableFactor: 1.25, delayUncertainDays: 7, label: "Uncertain receivables +7 days, spend +25%" },
  optimistic: { variableFactor: 0.85, delayUncertainDays: 0, label: "Expected dates, spend −15%" },
};
const UNCERTAIN_BELOW = 0.8;
const VARIABLE_WINDOW_DAYS = 60;

export type EventType = "recurring" | "invoice" | "obligation" | "one_off";

export type ForecastEvent = {
  key: string;
  date: ISODate;
  amountMinor: Minor;
  type: EventType;
  name: string;
  confidence: number;
  sourceId: string;
  dueDate?: ISODate;
  note?: string;
};

export type Assumption =
  | { kind: "invoice_on_due"; invoiceId: string }
  | { kind: "shift_event"; eventKey: string; days: number }
  | { kind: "remove_event"; eventKey: string }
  | { kind: "one_off"; id: string; name: string; date: ISODate; amountMinor: Minor };

export type ForecastInput = {
  asOf: ISODate;
  dataFreshness: string;
  horizonDays: number;
  startBalanceMinor: Minor;
  floorMinor: Minor;
  variableDailyMinor: Minor;
  events: ForecastEvent[];
};

export type ForecastPoint = {
  date: ISODate;
  balanceMinor: Minor;
  inflowsMinor: Minor;
  outflowsMinor: Minor;
  variableMinor: Minor;
  events: ForecastEvent[];
};

export type Driver = { type: string; name: string; impactMinor: Minor; date?: ISODate };

export type Breach = {
  firstDate: ISODate;
  minDate: ISODate;
  minBalanceMinor: Minor;
  daysBelow: number;
  shortfallMinor: Minor;
};

export type Forecast = {
  id: string;
  modelVersion: string;
  scenario: Scenario;
  asOf: ISODate;
  horizonDays: number;
  dataFreshness: string;
  startBalanceMinor: Minor;
  endBalanceMinor: Minor;
  floorMinor: Minor;
  variableDailyMinor: Minor;
  points: ForecastPoint[];
  minPoint: { date: ISODate; balanceMinor: Minor };
  breach: Breach | null;
  drivers: Driver[];
  assumptions: string[];
};

/** Average non-recurring depository spend per day over the trailing window. */
export function estimateVariableDaily(
  txns: readonly NormalizedTransaction[],
  recurring: readonly RecurringStream[],
  depositoryIds: ReadonlySet<string>,
  asOf: ISODate,
): Minor {
  const recurringIds = new Set(recurring.flatMap((s) => s.transactionIds));
  const from = addDays(asOf, -VARIABLE_WINDOW_DAYS);
  const spend = txns.filter(
    (t) =>
      depositoryIds.has(t.accountId) &&
      !t.pending &&
      t.kind === "expense" &&
      t.amountMinor < 0 &&
      !recurringIds.has(t.id) &&
      t.occurredAt >= from &&
      t.occurredAt < asOf,
  );
  return Math.round(-sumMinor(spend.map((t) => t.amountMinor)) / VARIABLE_WINDOW_DAYS);
}

export function buildEvents(args: {
  asOf: ISODate;
  horizonDays: number;
  streams: readonly RecurringStream[];
  invoices: readonly Invoice[];
  obligations: readonly CashObligation[];
}): ForecastEvent[] {
  const { asOf, horizonDays, streams, invoices, obligations } = args;
  const end = addDays(asOf, horizonDays);
  const events: ForecastEvent[] = [];
  for (const s of streams) {
    let date = s.nextDate;
    for (let n = 0; date <= end; n++) {
      events.push({
        key: `${s.key}#${n}`,
        date,
        amountMinor: s.direction === "inflow" ? s.expectedAmountMinor : -s.expectedAmountMinor,
        type: "recurring",
        name: s.merchant,
        confidence: s.confidence,
        sourceId: s.key,
      });
      date = addMonths(date, 1, s.anchorDay);
    }
  }
  for (const inv of invoices) {
    if (inv.status === "paid" || !inv.expectedDate) continue;
    events.push({
      key: `inv:${inv.id}`,
      date: inv.expectedDate,
      amountMinor: inv.amountMinor,
      type: "invoice",
      name: `${inv.number} · ${inv.client}`,
      confidence: inv.confidence ?? 0.5,
      sourceId: inv.id,
      dueDate: inv.dueDate,
    });
  }
  for (const o of obligations) {
    events.push({
      key: `obl:${o.id}`,
      date: o.expectedDate,
      amountMinor: -o.amountMinor,
      type: "obligation",
      name: o.name,
      confidence: 0.99,
      sourceId: o.id,
      note: o.note,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export function applyAssumptions(
  events: readonly ForecastEvent[],
  assumptions: readonly Assumption[],
  asOf: ISODate,
): ForecastEvent[] {
  let out = events.map((e) => ({ ...e }));
  for (const a of assumptions) {
    switch (a.kind) {
      case "invoice_on_due":
        out = out.map((e) =>
          e.type === "invoice" && e.sourceId === a.invoiceId && e.dueDate
            ? { ...e, date: e.dueDate > asOf ? e.dueDate : addDays(asOf, 1), confidence: 0.9, note: "Assumed paid on due date" }
            : e,
        );
        break;
      case "shift_event":
        out = out.map((e) =>
          e.key === a.eventKey ? { ...e, date: addDays(e.date, a.days), note: `Shifted ${a.days > 0 ? "+" : ""}${a.days} days` } : e,
        );
        break;
      case "remove_event":
        out = out.filter((e) => e.key !== a.eventKey);
        break;
      case "one_off":
        out.push({ key: `one:${a.id}`, date: a.date, amountMinor: a.amountMinor, type: "one_off", name: a.name, confidence: 1, sourceId: a.id });
        break;
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.key.localeCompare(y.key));
}

function applyScenario(events: readonly ForecastEvent[], scenario: Scenario): ForecastEvent[] {
  const { delayUncertainDays } = SCENARIO_RULES[scenario];
  if (!delayUncertainDays) return [...events];
  return events.map((e) =>
    e.amountMinor > 0 && e.confidence < UNCERTAIN_BELOW
      ? { ...e, date: addDays(e.date, delayUncertainDays), note: `Delayed ${delayUncertainDays} days (conservative)` }
      : e,
  );
}

export function runForecast(input: ForecastInput, scenario: Scenario = "base"): Forecast {
  const { asOf, horizonDays, startBalanceMinor, floorMinor } = input;
  const rule = SCENARIO_RULES[scenario];
  const variable = scaleMinor(input.variableDailyMinor, rule.variableFactor);
  const events = applyScenario(input.events, scenario);
  const byDate = new Map<ISODate, ForecastEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  const points: ForecastPoint[] = [
    { date: asOf, balanceMinor: startBalanceMinor, inflowsMinor: 0, outflowsMinor: 0, variableMinor: 0, events: [] },
  ];
  let balance = startBalanceMinor;
  for (let d = 1; d <= horizonDays; d++) {
    const date = addDays(asOf, d);
    const todays = byDate.get(date) ?? [];
    const inflows = sumMinor(todays.filter((e) => e.amountMinor > 0).map((e) => e.amountMinor));
    const outflows = -sumMinor(todays.filter((e) => e.amountMinor < 0).map((e) => e.amountMinor));
    balance = balance + inflows - outflows - variable;
    points.push({ date, balanceMinor: balance, inflowsMinor: inflows, outflowsMinor: outflows, variableMinor: variable, events: todays });
  }

  const minPoint = points.reduce((m, p) => (p.balanceMinor < m.balanceMinor ? p : m), points[0]);
  const below = points.filter((p) => p.balanceMinor < floorMinor);
  const breach: Breach | null = below.length
    ? {
        firstDate: below[0].date,
        minDate: minPoint.date,
        minBalanceMinor: minPoint.balanceMinor,
        daysBelow: below.length,
        shortfallMinor: floorMinor - minPoint.balanceMinor,
      }
    : null;

  const drivers = explainWindow(points, events, minPoint.date, asOf, variable);
  const assumptions = describeAssumptions(events, variable, scenario, horizonDays, asOf);

  const forecast: Omit<Forecast, "id"> = {
    modelVersion: MODEL_VERSION,
    scenario,
    asOf,
    horizonDays,
    dataFreshness: input.dataFreshness,
    startBalanceMinor,
    endBalanceMinor: balance,
    floorMinor,
    variableDailyMinor: variable,
    points,
    minPoint: { date: minPoint.date, balanceMinor: minPoint.balanceMinor },
    breach,
    drivers,
    assumptions,
  };
  return { id: `fc_${hash(JSON.stringify({ input, scenario }))}`, ...forecast };
}

/** Dominant drivers of the balance between today and `until` (the low point). */
function explainWindow(
  points: readonly ForecastPoint[],
  events: readonly ForecastEvent[],
  until: ISODate,
  asOf: ISODate,
  variable: Minor,
): Driver[] {
  const drivers: Driver[] = [];
  for (const p of points) {
    if (p.date > until) break;
    for (const e of p.events) if (e.amountMinor < 0) drivers.push({ type: e.type, name: e.name, impactMinor: e.amountMinor, date: e.date });
  }
  // Receivables that were due before the low point but are expected after it.
  for (const e of events) {
    if (e.type === "invoice" && e.dueDate && e.dueDate <= until && e.date > until) {
      drivers.push({
        type: "invoice_delay",
        name: `${e.name.split(" · ")[0]} expected ${formatShortDate(e.date)}, due ${formatShortDate(e.dueDate)}`,
        impactMinor: -e.amountMinor,
        date: e.dueDate,
      });
    }
  }
  const days = diffDays(until, asOf);
  if (days > 0 && variable > 0) drivers.push({ type: "variable", name: `Day-to-day spend (${days} days)`, impactMinor: -variable * days });
  return drivers.sort((a, b) => a.impactMinor - b.impactMinor).slice(0, 4);
}

function describeAssumptions(events: readonly ForecastEvent[], variable: Minor, scenario: Scenario, horizon: number, asOf: ISODate): string[] {
  const end = addDays(asOf, horizon);
  const lines = [`Day-to-day spend ${formatMoney(variable)}/day (60-day average${scenario === "base" ? "" : `, ${scenario}`})`];
  for (const e of events) {
    if (e.type === "invoice") {
      const lateBy = e.dueDate ? diffDays(e.date, e.dueDate) : 0;
      const when = e.date > end ? "after this horizon" : formatShortDate(e.date);
      lines.push(`${e.name.split(" · ")[0]} pays ${when}${lateBy > 0 ? ` (${lateBy} days after due)` : ""} · ${Math.round(e.confidence * 100)}% confidence`);
    } else if (e.note && e.type !== "obligation") {
      lines.push(`${e.name}: ${e.note.toLowerCase()}`);
    } else if (e.type === "obligation") {
      lines.push(`${e.name} ${formatMoney(-e.amountMinor)} paid ${formatShortDate(e.date)}`);
    }
  }
  return lines;
}

/** Explainability payload for one projected day (spec §7.4). */
export function explainDate(f: Forecast, date: ISODate) {
  const p = f.points.find((x) => x.date === date);
  if (!p) return null;
  return {
    date,
    projectedBalance: p.balanceMinor,
    currency: "USD" as const,
    drivers: [
      ...p.events.map((e) => ({ type: e.type, name: e.name, impact: e.amountMinor })),
      ...(p.variableMinor ? [{ type: "variable", name: "Day-to-day spend", impact: -p.variableMinor }] : []),
    ],
    assumptions: p.events.filter((e) => e.note).map((e) => `${e.name}: ${e.note}`),
    dataFreshness: f.dataFreshness,
  };
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
