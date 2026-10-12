// Replay-safe ingestion engine (spec §6). Provider-agnostic: the demo fault lab
// drives it with a scripted provider; a Plaid adapter would implement the same
// `SyncProvider` interface.

export type RawTxn = {
  transaction_id: string;
  account_id: string;
  amount: number; // provider convention: positive = outflow, in minor units
  date: string;
  name: string;
  pending: boolean;
  pending_transaction_id?: string | null;
};

export type SyncPage = {
  added: RawTxn[];
  modified: RawTxn[];
  removed: string[];
  next_cursor: string;
  has_more: boolean;
};

export class ProviderError extends Error {
  constructor(public status: number, message = `provider ${status}`) {
    super(message);
  }
}

export interface SyncProvider {
  syncPage(itemId: string, cursor: string | null): Promise<SyncPage>;
}

export type WebhookEvent = {
  provider: string;
  itemId: string;
  webhookCode: string;
  webhookId: string;
};

export type LedgerTxn = {
  providerTransactionId: string;
  accountId: string;
  amountMinor: number;
  date: string;
  name: string;
  pending: boolean;
};

export type IngestLog = { event: string; detail?: string };

export type ItemState = {
  status: "healthy" | "degraded" | "relink_required";
  cursor: string | null;
  lastSyncAt: string | null;
  lastError?: string;
};

export class Ledger {
  txns = new Map<string, LedgerTxn>();
  idempotency = new Map<string, "processing" | "completed">();
  items = new Map<string, ItemState>();
  quarantine: Array<{ raw: unknown; reason: string }> = [];
  recalcCount = 0;
  log: IngestLog[] = [];

  item(itemId: string): ItemState {
    if (!this.items.has(itemId)) this.items.set(itemId, { status: "healthy", cursor: null, lastSyncAt: null });
    return this.items.get(itemId)!;
  }

  emit(event: string, detail?: string) {
    this.log.push({ event, detail });
  }

  snapshot() {
    return JSON.stringify([...this.txns.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

export const idempotencyKey = (e: WebhookEvent) => `${e.provider}:${e.itemId}:${e.webhookCode}:${e.webhookId}`;

export type RetryPolicy = { maxAttempts: number; baseMs: number; capMs: number; random: () => number; sleep: (ms: number) => Promise<void> };

export const defaultRetry = (overrides: Partial<RetryPolicy> = {}): RetryPolicy => ({
  maxAttempts: 4,
  baseMs: 250,
  capMs: 4_000,
  random: Math.random,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  ...overrides,
});

/** Full-jitter exponential backoff: delay = random(0, min(cap, base * 2^attempt)). */
export function backoffDelay(attempt: number, p: Pick<RetryPolicy, "baseMs" | "capMs" | "random">) {
  return Math.round(p.random() * Math.min(p.capMs, p.baseMs * 2 ** attempt));
}

function validate(raw: RawTxn): string | null {
  if (!raw || typeof raw.transaction_id !== "string" || !raw.transaction_id) return "missing transaction_id";
  if (!Number.isSafeInteger(raw.amount)) return "amount is not integer minor units";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? "")) return "invalid date";
  if (typeof raw.account_id !== "string") return "missing account_id";
  return null;
}

const toLedger = (r: RawTxn): LedgerTxn => ({
  providerTransactionId: r.transaction_id,
  accountId: r.account_id,
  amountMinor: -r.amount,
  date: r.date,
  name: r.name,
  pending: r.pending,
});

/**
 * Apply one page atomically: build the next state on a copy and swap it in
 * only when every row has been handled. The cursor advances in the same commit.
 */
function applyPage(ledger: Ledger, itemId: string, page: SyncPage) {
  const next = new Map(ledger.txns);
  let quarantined = 0;
  for (const raw of [...page.added, ...page.modified]) {
    const problem = validate(raw);
    if (problem) {
      ledger.quarantine.push({ raw, reason: problem });
      quarantined++;
      continue;
    }
    // Pending -> posted: the posted row replaces its pending predecessor.
    if (!raw.pending && raw.pending_transaction_id) next.delete(raw.pending_transaction_id);
    next.set(raw.transaction_id, toLedger(raw));
  }
  for (const id of page.removed) next.delete(id);
  ledger.txns = next;
  ledger.item(itemId).cursor = page.next_cursor;
  ledger.emit("plaid.sync.page_applied", `${page.added.length} added, ${page.modified.length} modified, ${page.removed.length} removed${quarantined ? `, ${quarantined} quarantined` : ""}`);
}

async function fetchWithRetry(provider: SyncProvider, ledger: Ledger, itemId: string, retry: RetryPolicy) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.syncPage(itemId, ledger.item(itemId).cursor);
    } catch (err) {
      const status = err instanceof ProviderError ? err.status : 0;
      if (status === 400 || status === 401 || status === 403) {
        Object.assign(ledger.item(itemId), { status: "relink_required", lastError: `item login required (${status})` });
        ledger.emit("plaid.sync.failed", `relink required (${status})`);
        throw err;
      }
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt + 1 >= retry.maxAttempts) {
        Object.assign(ledger.item(itemId), { status: "degraded", lastError: String((err as Error).message) });
        ledger.emit("plaid.sync.failed", `gave up after ${attempt + 1} attempts`);
        throw err;
      }
      const delay = backoffDelay(attempt, retry);
      ledger.emit("plaid.sync.retry", `${status} → retry #${attempt + 1} in ${delay}ms`);
      await retry.sleep(delay);
    }
  }
}

export async function syncItem(ledger: Ledger, provider: SyncProvider, itemId: string, retry = defaultRetry(), now = () => new Date().toISOString()) {
  ledger.emit("plaid.sync.started", itemId);
  let pages = 0;
  for (;;) {
    const page = await fetchWithRetry(provider, ledger, itemId, retry);
    applyPage(ledger, itemId, page);
    pages++;
    if (!page.has_more) break;
  }
  Object.assign(ledger.item(itemId), { status: "healthy", lastSyncAt: now(), lastError: undefined });
  ledger.emit("plaid.sync.completed", `${pages} page(s)`);
  return pages;
}

export type WebhookResult = "processed" | "deduplicated" | "coalesced" | "failed";

/** Idempotent webhook handling (spec §6.3). */
export async function handleWebhook(
  ledger: Ledger,
  provider: SyncProvider,
  event: WebhookEvent,
  retry = defaultRetry(),
): Promise<WebhookResult> {
  const key = idempotencyKey(event);
  ledger.emit("plaid.webhook.received", key);
  const state = ledger.idempotency.get(key);
  if (state === "completed") {
    ledger.emit("plaid.webhook.deduplicated", key);
    return "deduplicated";
  }
  if (state === "processing") {
    ledger.emit("plaid.webhook.deduplicated", `${key} (coalesced with in-flight job)`);
    return "coalesced";
  }
  ledger.idempotency.set(key, "processing");
  try {
    await syncItem(ledger, provider, event.itemId, retry);
    ledger.idempotency.set(key, "completed");
    ledger.recalcCount++;
    ledger.emit("forecast.recompute.started", "enqueued once");
    return "processed";
  } catch {
    // Release the key so a later delivery (or worker replay) can retry safely.
    ledger.idempotency.delete(key);
    ledger.emit("plaid.webhook.failed", key);
    return "failed";
  }
}
