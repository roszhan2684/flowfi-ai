// Assembles a full deterministic snapshot of the workspace from fixture data
// plus the caller's assumptions and approved overrides. Pure: same options in,
// same snapshot out.

import { buildAlerts } from "./alerts";
import { demoData, type DemoData } from "./dataset";
import {
  applyAssumptions,
  buildEvents,
  estimateVariableDaily,
  runForecast,
  SCENARIOS,
  type Assumption,
  type Forecast,
  type ForecastInput,
  type Scenario,
} from "./forecast";
import { computeFlowScore } from "./flowscore";
import { estimateInvoices } from "./invoices";
import { sumMinor } from "./money";
import { detectRecurring } from "./recurring";
import { detectSpendingChange } from "./spending";
import type { BusinessUse, NormalizedTransaction } from "./types";

export type TransactionOverride = {
  transactionId: string;
  field: "businessUse" | "category";
  newValue: string;
};

export type SnapshotOptions = {
  assumptions?: Assumption[];
  overrides?: TransactionOverride[];
  followUps?: Record<string, string>;
  simulateStale?: boolean;
  horizonDays?: number;
};

export const STALE_AFTER_HOURS = 24;

export function applyOverrides(txns: readonly NormalizedTransaction[], overrides: readonly TransactionOverride[]) {
  if (!overrides.length) return [...txns];
  const byId = new Map(overrides.map((o) => [`${o.transactionId}:${o.field}`, o.newValue]));
  return txns.map((t) => {
    const use = byId.get(`${t.id}:businessUse`);
    const cat = byId.get(`${t.id}:category`);
    return use || cat ? { ...t, businessUse: (use as BusinessUse) ?? t.businessUse, category: cat ?? t.category } : t;
  });
}

export function buildSnapshot(opts: SnapshotOptions = {}, data: DemoData = demoData) {
  const { workspace, accounts, obligations } = data;
  const asOf = workspace.asOf;
  const horizonDays = opts.horizonDays ?? 30;
  const txns = applyOverrides(data.transactions, opts.overrides ?? []);
  const streams = detectRecurring(txns, asOf);
  const invoices = estimateInvoices(data.invoices, asOf).map((i) =>
    opts.followUps?.[i.id] ? { ...i, followUpDraftId: opts.followUps[i.id] } : i,
  );

  const depository = accounts.filter((a) => a.type === "depository");
  const depositoryIds = new Set(depository.map((a) => a.id));
  const startBalanceMinor = sumMinor(depository.map((a) => a.balanceMinor));
  const reserveMinor = sumMinor(depository.filter((a) => a.role === "reserve").map((a) => a.balanceMinor));

  const ageHours = opts.simulateStale ? 52 : 0;
  const freshness = {
    syncedAt: opts.simulateStale ? "2026-10-10T11:42:00Z" : workspace.syncedAt,
    ageHours,
    stale: ageHours > STALE_AFTER_HOURS,
  };

  const events = applyAssumptions(
    buildEvents({ asOf, horizonDays, streams, invoices, obligations }),
    opts.assumptions ?? [],
    asOf,
  );
  const input: ForecastInput = {
    asOf,
    dataFreshness: freshness.syncedAt,
    horizonDays,
    startBalanceMinor,
    floorMinor: workspace.safetyFloorMinor,
    variableDailyMinor: estimateVariableDaily(txns, streams, depositoryIds, asOf),
    events,
  };
  const forecasts = Object.fromEntries(SCENARIOS.map((s) => [s, runForecast(input, s)])) as Record<Scenario, Forecast>;

  const band = forecasts.base.points.map((p, i) => {
    const vals = SCENARIOS.map((s) => forecasts[s].points[i].balanceMinor);
    return { date: p.date, lowerMinor: Math.min(...vals), upperMinor: Math.max(...vals) };
  });

  const spending = detectSpendingChange(txns, streams, asOf);
  const flowScore = computeFlowScore({
    asOf,
    forecast: forecasts.base,
    streams,
    txns,
    invoices,
    spending,
    reserveMinor,
    reserveTargetMinor: workspace.reserveTargetMinor,
  });
  const alerts = buildAlerts({
    forecast: forecasts.base,
    invoices,
    streams,
    txns,
    reserveMinor,
    reserveTargetMinor: workspace.reserveTargetMinor,
    freshness,
  });

  return {
    workspace,
    accounts,
    cash: { availableMinor: startBalanceMinor, reserveMinor, asOf, syncedAt: freshness.syncedAt },
    freshness,
    transactions: txns,
    streams,
    invoices,
    obligations,
    forecasts,
    band,
    spending,
    flowScore,
    alerts,
  };
}

export type Snapshot = ReturnType<typeof buildSnapshot>;
