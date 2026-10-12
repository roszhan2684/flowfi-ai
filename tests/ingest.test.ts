import { describe, expect, it } from "vitest";
import { runFaultLab } from "@/lib/core/faultlab";
import { backoffDelay } from "@/lib/core/ingest";

describe("fault lab (spec §6.2)", async () => {
  const { results } = await runFaultLab();
  for (const r of results) {
    it(`${r.title}: ${r.expected}`, () => {
      expect(r.pass, r.observed).toBe(true);
    });
  }
  it("covers every required failure case", () => {
    expect(results.map((r) => r.id)).toEqual(
      expect.arrayContaining(["duplicate_webhook", "concurrent_webhook", "rate_limit", "provider_5xx", "worker_crash", "pending_posted", "malformed", "expired_item"]),
    );
  });
});

describe("backoff", () => {
  it("is capped exponential with full jitter", () => {
    const p = { baseMs: 250, capMs: 4000, random: () => 1 };
    expect([0, 1, 2, 3, 4, 5].map((a) => backoffDelay(a, p))).toEqual([250, 500, 1000, 2000, 4000, 4000]);
    expect(backoffDelay(3, { ...p, random: () => 0 })).toBe(0);
  });
});
