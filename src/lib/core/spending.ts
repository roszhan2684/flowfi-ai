import { addDays, type ISODate } from "./dates";
import { sumMinor, type Minor } from "./money";
import type { NormalizedTransaction, RecurringStream } from "./types";

export type SpendingChange = {
  windowDays: number;
  currentMinor: Minor;
  previousMinor: Minor;
  changePct: number;
  byCategory: Array<{ category: string; currentMinor: Minor; previousMinor: Minor; deltaMinor: Minor }>;
  largest: Array<{ id: string; merchant: string; amountMinor: Minor; date: ISODate }>;
};

/** Discretionary (non-recurring) spend: this window vs the window before it. */
export function detectSpendingChange(
  txns: readonly NormalizedTransaction[],
  streams: readonly RecurringStream[],
  asOf: ISODate,
  windowDays = 30,
): SpendingChange {
  const recurringIds = new Set(streams.flatMap((s) => s.transactionIds));
  const discretionary = txns.filter(
    (t) => t.kind === "expense" && t.amountMinor < 0 && !t.pending && !recurringIds.has(t.id),
  );
  const curFrom = addDays(asOf, -windowDays);
  const prevFrom = addDays(asOf, -2 * windowDays);
  const cur = discretionary.filter((t) => t.occurredAt >= curFrom && t.occurredAt < asOf);
  const prev = discretionary.filter((t) => t.occurredAt >= prevFrom && t.occurredAt < curFrom);
  const currentMinor = -sumMinor(cur.map((t) => t.amountMinor));
  const previousMinor = -sumMinor(prev.map((t) => t.amountMinor));

  const cats = new Map<string, { c: Minor; p: Minor }>();
  for (const t of cur) cats.set(t.category, { c: (cats.get(t.category)?.c ?? 0) - t.amountMinor, p: cats.get(t.category)?.p ?? 0 });
  for (const t of prev) cats.set(t.category, { c: cats.get(t.category)?.c ?? 0, p: (cats.get(t.category)?.p ?? 0) - t.amountMinor });

  return {
    windowDays,
    currentMinor,
    previousMinor,
    changePct: previousMinor ? Math.round(((currentMinor - previousMinor) / previousMinor) * 1000) / 10 : 0,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, currentMinor: v.c, previousMinor: v.p, deltaMinor: v.c - v.p }))
      .sort((a, b) => b.deltaMinor - a.deltaMinor),
    largest: [...cur]
      .sort((a, b) => a.amountMinor - b.amountMinor)
      .slice(0, 3)
      .map((t) => ({ id: t.id, merchant: t.merchantName, amountMinor: -t.amountMinor, date: t.occurredAt })),
  };
}
