// Request parsing for the demo backend. The API is stateless: the client sends
// its approved overrides/assumptions and the server recomputes deterministically.

import type { SnapshotOptions, TransactionOverride } from "./core/engine";
import type { Assumption } from "./core/forecast";

const KINDS = new Set(["invoice_on_due", "shift_event", "remove_event", "one_off"]);
const USES = new Set(["business", "personal", "mixed", "unknown"]);

export function parseOptions(raw: unknown): SnapshotOptions | string {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object") return "options must be an object";
  const o = raw as Record<string, unknown>;
  const assumptions = (o.assumptions ?? []) as Assumption[];
  const overrides = (o.overrides ?? []) as TransactionOverride[];
  if (!Array.isArray(assumptions) || assumptions.length > 10) return "assumptions must be an array (max 10)";
  for (const a of assumptions) {
    if (!a || !KINDS.has(a.kind)) return "unknown assumption kind";
    if (a.kind === "shift_event" && (!Number.isInteger(a.days) || Math.abs(a.days) > 60)) return "shift days out of range";
    if (a.kind === "one_off" && !Number.isSafeInteger(a.amountMinor)) return "one_off amount must be integer minor units";
  }
  if (!Array.isArray(overrides) || overrides.length > 50) return "overrides must be an array (max 50)";
  for (const ov of overrides) {
    if (typeof ov?.transactionId !== "string" || ov.field !== "businessUse" || !USES.has(ov.newValue)) return "invalid override";
  }
  const followUps = o.followUps && typeof o.followUps === "object" ? (o.followUps as Record<string, string>) : {};
  return { assumptions, overrides, followUps, simulateStale: o.simulateStale === true };
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, { ...init, headers: { "cache-control": "no-store", "x-flowfi-mode": "demo", ...init.headers } });

export const bad = (error: string, status = 400) => json({ error }, { status });

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > 20_000) return Symbol.for("too_large");
    return text ? JSON.parse(text) : {};
  } catch {
    return Symbol.for("bad_json");
  }
}
