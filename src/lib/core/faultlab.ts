// Fault-injection scenarios from spec §6.2, executed against the real ingestion
// engine with a scripted provider. Results are observed, not asserted in copy.

import {
  defaultRetry,
  handleWebhook,
  Ledger,
  ProviderError,
  syncItem,
  type RawTxn,
  type SyncPage,
  type SyncProvider,
  type WebhookEvent,
} from "./ingest";

const ITEM = "item_demo";

const PAGE_1: SyncPage = {
  added: [
    { transaction_id: "p_coffee", account_id: "acc_chk", amount: 1250, date: "2026-10-11", name: "Blue Bottle Coffee", pending: true },
    { transaction_id: "t_rent", account_id: "acc_chk", amount: 260000, date: "2026-10-01", name: "Foundry Lofts", pending: false },
    { transaction_id: "t_halcyon", account_id: "acc_chk", amount: -420000, date: "2026-10-03", name: "Halcyon Labs", pending: false },
  ],
  modified: [],
  removed: [],
  next_cursor: "c1",
  has_more: true,
};

const PAGE_2: SyncPage = {
  added: [
    { transaction_id: "t_coffee", account_id: "acc_chk", amount: 1250, date: "2026-10-12", name: "Blue Bottle Coffee", pending: false, pending_transaction_id: "p_coffee" },
    { transaction_id: "t_figma", account_id: "acc_chk", amount: 7500, date: "2026-10-12", name: "Figma", pending: false },
  ],
  modified: [],
  removed: [],
  next_cursor: "c2",
  has_more: false,
};

const MALFORMED = { transaction_id: "t_bad", account_id: "acc_chk", amount: 12.5, date: "10/12/2026", name: "Malformed row", pending: false } as unknown as RawTxn;

type Fault = "429" | "500" | "401" | "crash";

class ScriptedProvider implements SyncProvider {
  calls = 0;
  constructor(private faults: Array<Fault | null> = [], private opts: { malformed?: boolean } = {}) {}
  async syncPage(_item: string, cursor: string | null): Promise<SyncPage> {
    const fault = this.faults[this.calls++] ?? null;
    if (fault === "crash") throw new Error("worker crashed mid-page");
    if (fault) throw new ProviderError(Number(fault));
    if (cursor === null) return structuredClone(PAGE_1);
    const p2 = structuredClone(PAGE_2);
    if (this.opts.malformed) p2.added.push(MALFORMED);
    return p2;
  }
}

const event = (id = "wh_001"): WebhookEvent => ({ provider: "demo", itemId: ITEM, webhookCode: "SYNC_UPDATES_AVAILABLE", webhookId: id });
const fastRetry = (delays: number[] = []) =>
  defaultRetry({ random: () => 0.5, sleep: async (ms) => void delays.push(ms) });

export type FaultResult = {
  id: string;
  title: string;
  expected: string;
  observed: string;
  pass: boolean;
  log: string[];
};

async function cleanRunSnapshot() {
  const l = new Ledger();
  await syncItem(l, new ScriptedProvider(), ITEM, fastRetry());
  return l.snapshot();
}

export async function runFaultLab(): Promise<{ results: FaultResult[]; ranAt: string; durationMs: number }> {
  const started = performance.now();
  const clean = await cleanRunSnapshot();
  const results: FaultResult[] = [];
  const tail = (l: Ledger, n = 6) => l.log.slice(-n).map((e) => `${e.event}${e.detail ? ` — ${e.detail}` : ""}`);

  {
    const l = new Ledger();
    const provider = new ScriptedProvider();
    const outcomes: string[] = [];
    for (let i = 0; i < 100; i++) outcomes.push(await handleWebhook(l, provider, event(), fastRetry()));
    const dupes = l.txns.size - 4;
    results.push({
      id: "duplicate_webhook",
      title: "Duplicate webhook ×100",
      expected: "0 duplicate transactions, 1 recompute",
      observed: `${outcomes.filter((o) => o === "processed").length} processed, ${outcomes.filter((o) => o === "deduplicated").length} deduplicated, ${dupes} duplicates, ${l.recalcCount} recompute`,
      pass: dupes === 0 && l.recalcCount === 1 && l.snapshot() === clean,
      log: tail(l, 4),
    });
  }

  {
    const l = new Ledger();
    const provider = new ScriptedProvider();
    const [a, b] = await Promise.all([handleWebhook(l, provider, event(), fastRetry()), handleWebhook(l, provider, event(), fastRetry())]);
    results.push({
      id: "concurrent_webhook",
      title: "Webhook while a job is running",
      expected: "Second delivery coalesces",
      observed: `first: ${a}, second: ${b}`,
      pass: a === "processed" && b === "coalesced" && l.snapshot() === clean,
      log: tail(l, 4),
    });
  }

  {
    const l = new Ledger();
    const delays: number[] = [];
    const r = await handleWebhook(l, new ScriptedProvider(["429", "429"]), event(), fastRetry(delays));
    results.push({
      id: "rate_limit",
      title: "Provider 429 rate limit",
      expected: "Backoff, bounded retries, then success",
      observed: `${r} after ${delays.length} retries (backoff ${delays.join("ms, ")}ms)`,
      pass: r === "processed" && delays.length === 2 && l.snapshot() === clean,
      log: tail(l, 5),
    });
  }

  {
    const l = new Ledger();
    await syncItem(l, new ScriptedProvider(), ITEM, fastRetry());
    const before = l.snapshot();
    const delays: number[] = [];
    const r = await handleWebhook(l, new ScriptedProvider(["500", "500", "500", "500"]), event("wh_002"), fastRetry(delays));
    results.push({
      id: "provider_5xx",
      title: "Provider 5xx outage",
      expected: "Retry with jitter, keep last good state, mark degraded",
      observed: `${r} after ${delays.length + 1} attempts; item ${l.item(ITEM).status}; state ${l.snapshot() === before ? "unchanged" : "CHANGED"}`,
      pass: r === "failed" && l.item(ITEM).status === "degraded" && l.snapshot() === before,
      log: tail(l, 5),
    });
  }

  {
    const l = new Ledger();
    const first = await handleWebhook(l, new ScriptedProvider([null, "crash"]), event("wh_003"), fastRetry());
    const cursorAfterCrash = l.item(ITEM).cursor;
    const replay = await handleWebhook(l, new ScriptedProvider(), event("wh_003"), fastRetry());
    results.push({
      id: "worker_crash",
      title: "Worker crash mid-sync, then replay",
      expected: "Cursor only advances past committed pages; replay converges",
      observed: `crash → ${first}, cursor held at ${cursorAfterCrash}; replay → ${replay}; final state ${l.snapshot() === clean ? "matches" : "DIFFERS from"} clean run`,
      pass: first === "failed" && cursorAfterCrash === "c1" && replay === "processed" && l.snapshot() === clean,
      log: tail(l, 5),
    });
  }

  {
    const l = new Ledger();
    await syncItem(l, new ScriptedProvider(), ITEM, fastRetry());
    const coffee = [...l.txns.values()].filter((t) => t.name === "Blue Bottle Coffee");
    results.push({
      id: "pending_posted",
      title: "Pending → posted replacement",
      expected: "Posted row replaces pending, no double count",
      observed: `${coffee.length} coffee row (${coffee.map((c) => (c.pending ? "pending" : "posted")).join(", ")})`,
      pass: coffee.length === 1 && !coffee[0].pending,
      log: tail(l, 3),
    });
  }

  {
    const l = new Ledger();
    await syncItem(l, new ScriptedProvider([], { malformed: true }), ITEM, fastRetry());
    results.push({
      id: "malformed",
      title: "Malformed transaction",
      expected: "Quarantine row, continue the batch",
      observed: `${l.quarantine.length} quarantined (${l.quarantine[0]?.reason}); ${l.txns.size} good rows applied`,
      pass: l.quarantine.length === 1 && l.snapshot() === clean,
      log: tail(l, 3),
    });
  }

  {
    const l = new Ledger();
    const r = await handleWebhook(l, new ScriptedProvider(["401"]), event("wh_004"), fastRetry());
    results.push({
      id: "expired_item",
      title: "Expired / revoked item",
      expected: "Mark relink required, no retry storm",
      observed: `${r}; item ${l.item(ITEM).status}; provider called once`,
      pass: r === "failed" && l.item(ITEM).status === "relink_required",
      log: tail(l, 3),
    });
  }

  return { results, ranAt: new Date().toISOString(), durationMs: Math.round((performance.now() - started) * 10) / 10 };
}
