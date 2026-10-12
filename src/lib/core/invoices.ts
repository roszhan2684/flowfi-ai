import { addDays, diffDays, type ISODate } from "./dates";
import type { Invoice } from "./types";

export type ClientPaymentHistory = {
  client: string;
  paidCount: number;
  avgDaysLate: number;
};

export function clientHistory(invoices: readonly Invoice[], client: string): ClientPaymentHistory {
  const paid = invoices.filter((i) => i.client === client && i.status === "paid" && i.paidAt);
  const late = paid.map((i) => Math.max(0, diffDays(i.paidAt!, i.dueDate)));
  const avg = late.length ? late.reduce((a, b) => a + b, 0) / late.length : 0;
  return { client, paidCount: paid.length, avgDaysLate: Math.round(avg) };
}

/**
 * Late-risk heuristic: expected payment date = due date + the client's average
 * historical lateness. Confidence drops with lateness and with thin history.
 */
export function estimateInvoices(invoices: readonly Invoice[], asOf: ISODate): Invoice[] {
  return invoices.map((inv) => {
    if (inv.status === "paid") return inv;
    const h = clientHistory(invoices, inv.client);
    let expectedDate = addDays(inv.dueDate, h.avgDaysLate);
    if (expectedDate <= asOf) expectedDate = addDays(asOf, 1);
    let confidence = h.paidCount === 0 ? 0.7 : 0.92;
    if (h.avgDaysLate > 0) confidence -= Math.min(0.45, h.avgDaysLate * 0.035);
    if (inv.dueDate < asOf) confidence -= 0.1;
    confidence = Math.round(Math.max(0.2, confidence) * 100) / 100;
    const status = inv.status === "open" && inv.dueDate < asOf ? "late" : inv.status;
    return { ...inv, status, expectedDate, confidence };
  });
}

export const isAtRisk = (inv: Invoice) =>
  inv.status !== "paid" && ((inv.confidence ?? 1) < 0.7 || (inv.expectedDate ?? inv.dueDate) > inv.dueDate);
