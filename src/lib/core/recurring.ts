import { addMonths, diffDays, type ISODate } from "./dates";
import type { Minor } from "./money";
import type { NormalizedTransaction, RecurringStream } from "./types";

export const merchantKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const MIN_OCCURRENCES = 3;
const MONTHLY_MIN_GAP = 26;
const MONTHLY_MAX_GAP = 35;

/**
 * Detect monthly recurring streams from posted, non-transfer activity.
 * A stream needs >= 3 occurrences whose consecutive gaps all look monthly.
 * Confidence falls with day-of-month jitter and amount variation.
 */
export function detectRecurring(
  txns: readonly NormalizedTransaction[],
  asOf: ISODate,
): RecurringStream[] {
  const groups = new Map<string, NormalizedTransaction[]>();
  for (const t of txns) {
    if (t.pending || t.kind === "transfer" || t.kind === "card_payment") continue;
    if (t.occurredAt > asOf) continue;
    const dir = t.amountMinor >= 0 ? "in" : "out";
    const key = `${merchantKey(t.merchantName)}:${dir}:${t.accountId}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const streams: RecurringStream[] = [];
  for (const [, list] of groups) {
    if (list.length < MIN_OCCURRENCES) continue;
    const sorted = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const gaps = sorted.slice(1).map((t, i) => diffDays(t.occurredAt, sorted[i].occurredAt));
    if (!gaps.every((g) => g >= MONTHLY_MIN_GAP && g <= MONTHLY_MAX_GAP)) continue;

    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const days = sorted.map((t) => Number(t.occurredAt.slice(8, 10)));
    const anchorDay = mode(days);
    const dayJitter = Math.max(...days) - Math.min(...days);
    const amounts = sorted.map((t) => Math.abs(t.amountMinor));
    const amountSpread = (Math.max(...amounts) - Math.min(...amounts)) / Math.max(...amounts);

    let nextDate = addMonths(last.occurredAt, 1, anchorDay);
    while (nextDate <= asOf) nextDate = addMonths(nextDate, 1, anchorDay);

    const confidence = clamp01(0.98 - dayJitter * 0.03 - amountSpread * 0.2);
    streams.push({
      key: `rec:${merchantKey(last.merchantName)}`,
      merchant: last.merchantName,
      direction: last.amountMinor >= 0 ? "inflow" : "outflow",
      cadence: "monthly",
      anchorDay,
      // The latest charge is the best predictor (captures price increases).
      expectedAmountMinor: Math.abs(last.amountMinor) as Minor,
      previousAmountMinor: Math.abs(prev.amountMinor) as Minor,
      lastDate: last.occurredAt,
      nextDate,
      occurrences: sorted.length,
      confidence: Math.round(confidence * 100) / 100,
      category: last.category,
      transactionIds: sorted.map((t) => t.id),
    });
  }
  return streams.sort((a, b) => b.expectedAmountMinor - a.expectedAmountMinor);
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
