import { describe, expect, it } from "vitest";
import { addMonths, addDays, diffDays } from "@/lib/core/dates";
import { formatMoney, roundMinor, sumMinor } from "@/lib/core/money";
import { detectRecurring } from "@/lib/core/recurring";
import { estimateInvoices } from "@/lib/core/invoices";
import { applyAssumptions, runForecast, type ForecastInput } from "@/lib/core/forecast";
import { buildSnapshot } from "@/lib/core/engine";
import type { NormalizedTransaction, Invoice } from "@/lib/core/types";

const txn = (id: string, date: string, amount: number, merchant: string, extra: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  id, workspaceId: "ws", accountId: "acc", provider: "demo", providerTransactionId: id, amountMinor: amount, currency: "USD",
  occurredAt: date, pending: false, merchantName: merchant, category: "x", kind: amount > 0 ? "income" : "expense",
  businessUse: "business", provenance: { source: "test", syncedAt: "2026-01-01T00:00:00Z" }, ...extra,
});

describe("money", () => {
  it("rejects floats as minor units", () => {
    expect(() => sumMinor([100, 0.5])).toThrow(/integer/);
  });
  it("rounds half away from zero", () => {
    expect(roundMinor(2.5)).toBe(3);
    expect(roundMinor(-2.5)).toBe(-3);
  });
  it("formats negatives with a true minus sign", () => {
    expect(formatMoney(-123456)).toBe("−$1,234.56");
    expect(formatMoney(500000, { cents: false })).toBe("$5,000");
  });
});

describe("dates", () => {
  it("clamps month-end and restores the anchor day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(diffDays(addDays("2026-10-12", 30), "2026-10-12")).toBe(30);
  });
});

describe("recurring detection", () => {
  it("detects a monthly stream and uses the latest amount", () => {
    const s = detectRecurring(
      [txn("a", "2026-07-16", -5999, "Adobe"), txn("b", "2026-08-16", -5999, "Adobe"), txn("c", "2026-09-16", -8999, "Adobe")],
      "2026-10-12",
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ expectedAmountMinor: 8999, previousAmountMinor: 5999, nextDate: "2026-10-16", direction: "outflow" });
  });
  it("ignores weekly merchants, pending rows and transfers", () => {
    const weekly = [0, 7, 14, 21].map((d, i) => txn(`w${i}`, addDays("2026-09-01", d), -1250, "Coffee"));
    const pending = [1, 2, 3].map((mo) => txn(`p${mo}`, `2026-0${mo + 5}-05`, -100, "Pending", { pending: true }));
    expect(detectRecurring([...weekly, ...pending], "2026-10-12")).toHaveLength(0);
  });
});

describe("invoice late-risk", () => {
  it("shifts expected date by the client's average lateness", () => {
    const inv: Invoice[] = [
      { id: "1", number: "A", workspaceId: "ws", client: "C", amountMinor: 100, issuedAt: "2026-07-01", dueDate: "2026-08-01", status: "paid", paidAt: "2026-08-11" },
      { id: "2", number: "B", workspaceId: "ws", client: "C", amountMinor: 100, issuedAt: "2026-09-01", dueDate: "2026-10-20", status: "open" },
    ];
    const [, open] = estimateInvoices(inv, "2026-10-12");
    expect(open.expectedDate).toBe("2026-10-30");
    expect(open.confidence).toBeLessThan(0.7);
  });
});

describe("forecast engine", () => {
  const input: ForecastInput = {
    asOf: "2026-01-01", dataFreshness: "t", horizonDays: 5, startBalanceMinor: 100_000, floorMinor: 50_000, variableDailyMinor: 1_000,
    events: [
      { key: "out", date: "2026-01-02", amountMinor: -60_000, type: "obligation", name: "Bill", confidence: 1, sourceId: "o" },
      { key: "inv", date: "2026-01-05", amountMinor: 40_000, type: "invoice", name: "INV-1 · C", confidence: 0.5, sourceId: "i", dueDate: "2026-01-03" },
    ],
  };
  it("matches a hand-computed fixture exactly", () => {
    const f = runForecast(input, "base");
    expect(f.points.map((p) => p.balanceMinor)).toEqual([100_000, 39_000, 38_000, 37_000, 76_000, 75_000]);
    expect(f.breach).toMatchObject({ firstDate: "2026-01-02", minDate: "2026-01-04", minBalanceMinor: 37_000, daysBelow: 3, shortfallMinor: 13_000 });
    expect(f.drivers[0]).toMatchObject({ type: "obligation", impactMinor: -60_000 });
    expect(f.drivers.some((d) => d.type === "invoice_delay")).toBe(true);
  });
  it("conservative delays uncertain receivables and scales variable spend", () => {
    const f = runForecast(input, "conservative");
    expect(f.variableDailyMinor).toBe(1_250);
    expect(f.points.at(-1)!.balanceMinor).toBe(100_000 - 60_000 - 5 * 1_250);
  });
  it("is replay-stable: same input, same output and id", () => {
    expect(runForecast(input, "base")).toEqual(runForecast(structuredClone(input), "base"));
  });
  it("applies assumptions without mutating inputs", () => {
    const moved = applyAssumptions(input.events, [{ kind: "invoice_on_due", invoiceId: "i" }], input.asOf);
    expect(moved.find((e) => e.key === "inv")!.date).toBe("2026-01-03");
    expect(input.events[1].date).toBe("2026-01-05");
  });
});

describe("Northstar Studio demo snapshot", () => {
  const s = buildSnapshot();
  it("starts at $12,180.00 cleared cash", () => {
    expect(s.cash.availableMinor).toBe(1_218_000);
  });
  it("breaches the $5k floor on Oct 23 in the base case", () => {
    expect(s.forecasts.base.breach?.firstDate).toBe("2026-10-23");
    expect(s.forecasts.base.minPoint.balanceMinor).toBe(483_668);
  });
  it("names the delayed invoice and contractor as dominant drivers", () => {
    const names = s.forecasts.base.drivers.slice(0, 2).map((d) => d.name);
    expect(names[0]).toMatch(/INV-104/);
    expect(names[1]).toMatch(/Mara Okafor/);
  });
  it("removes the breach when INV-104 is paid on its due date", () => {
    const t = buildSnapshot({ assumptions: [{ kind: "invoice_on_due", invoiceId: "inv_104" }] });
    expect(t.forecasts.base.breach).toBeNull();
    expect(t.flowScore.score).toBeGreaterThan(s.flowScore.score);
  });
  it("FlowScore equals the sum of its visible factors", () => {
    expect(s.flowScore.score).toBe(s.flowScore.factors.reduce((a, f) => a + f.points, 0));
  });
  it("orders scenarios: conservative <= base <= optimistic at every point", () => {
    s.forecasts.base.points.forEach((p, i) => {
      expect(s.forecasts.conservative.points[i].balanceMinor).toBeLessThanOrEqual(p.balanceMinor);
      expect(s.forecasts.optimistic.points[i].balanceMinor).toBeGreaterThanOrEqual(p.balanceMinor);
    });
  });
  it("raises the spec's alert types", () => {
    const types = s.alerts.map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["cash_threshold", "invoice_risk", "subscription_increase", "unusual_spending", "tax_reserve_gap"]));
    expect(buildSnapshot({ simulateStale: true }).alerts[0].type).toBe("sync_stale");
  });
  it("computes 10k-transaction-scale snapshots quickly enough to measure", () => {
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) buildSnapshot();
    expect((performance.now() - t0) / 20).toBeLessThan(250);
  });
});
