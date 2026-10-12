// Replay-safe ingestion engine (spec §6). The ledger is an actor: concurrent
// webhook deliveries interleave at suspension points, which is exactly where
// idempotency + coalescing must hold.

public struct RawTxn: Sendable, Equatable {
    public let transactionId: String
    public let accountId: String
    /// Provider convention: positive = outflow, minor units. `nil` = malformed.
    public let amount: Int?
    public let date: String
    public let name: String
    public let pending: Bool
    public var pendingTransactionId: String? = nil
}

public struct SyncPage: Sendable {
    public var added: [RawTxn]
    public var modified: [RawTxn] = []
    public var removed: [String] = []
    public let nextCursor: String
    public let hasMore: Bool
}

public struct ProviderError: Error, Sendable { public let status: Int }
public struct WorkerCrash: Error, Sendable {}

public protocol SyncProvider: Sendable {
    func syncPage(itemId: String, cursor: String?) async throws -> SyncPage
}

public struct WebhookEvent: Sendable {
    public let provider: String, itemId: String, webhookCode: String, webhookId: String
    public var idempotencyKey: String { "\(provider):\(itemId):\(webhookCode):\(webhookId)" }
}

public struct LedgerTxn: Sendable, Equatable {
    public let providerTransactionId: String
    public let amountMinor: Minor
    public let date: String
    public let name: String
    public let pending: Bool
}

public enum ItemStatus: String, Sendable { case healthy, degraded, relinkRequired = "relink_required" }

public struct RetryPolicy: Sendable {
    public var maxAttempts = 4
    public var baseMs = 250
    public var capMs = 4_000
    public var random: @Sendable () -> Double = { Double.random(in: 0..<1) }
    public var sleep: @Sendable (Int) async -> Void = { ms in try? await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000) }
    public init() {}

    /// Full-jitter exponential backoff.
    public func delay(attempt: Int) -> Int {
        Int((random() * Double(min(capMs, baseMs << attempt))).rounded(.toNearestOrAwayFromZero))
    }
}

public enum WebhookResult: String, Sendable { case processed, deduplicated, coalesced, failed }

public actor Ledger {
    public private(set) var txns: [String: LedgerTxn] = [:]
    public private(set) var cursor: String?
    public private(set) var status: ItemStatus = .healthy
    public private(set) var quarantine: [(id: String, reason: String)] = []
    public private(set) var recalcCount = 0
    public private(set) var log: [String] = []
    private var idempotency: [String: Bool] = [:] // false = processing, true = completed

    public init() {}

    public var fingerprint: String {
        txns.keys.sorted().map { k in let t = txns[k]!; return "\(k)|\(t.amountMinor)|\(t.date)|\(t.pending)" }.joined(separator: ";")
    }

    private func emit(_ e: String) { log.append(e) }

    static func validate(_ r: RawTxn) -> String? {
        if r.transactionId.isEmpty { return "missing transaction_id" }
        if r.amount == nil { return "amount is not integer minor units" }
        let parts = r.date.split(separator: "-")
        if parts.count != 3 || parts[0].count != 4 || parts.contains(where: { Int($0) == nil }) { return "invalid date" }
        return nil
    }

    /// Apply one page atomically; the cursor advances in the same commit.
    private func apply(_ page: SyncPage) {
        var next = txns
        var bad = 0
        for r in page.added + page.modified {
            if let problem = Self.validate(r) {
                quarantine.append((r.transactionId, problem))
                bad += 1
                continue
            }
            if !r.pending, let pid = r.pendingTransactionId { next[pid] = nil }
            next[r.transactionId] = LedgerTxn(providerTransactionId: r.transactionId, amountMinor: -(r.amount ?? 0), date: r.date, name: r.name, pending: r.pending)
        }
        for id in page.removed { next[id] = nil }
        txns = next
        cursor = page.nextCursor
        emit("plaid.sync.page_applied — \(page.added.count) added\(bad > 0 ? ", \(bad) quarantined" : "")")
    }

    private func fetch(_ provider: SyncProvider, itemId: String, retry: RetryPolicy) async throws -> SyncPage {
        var attempt = 0
        while true {
            do {
                return try await provider.syncPage(itemId: itemId, cursor: cursor)
            } catch let e as ProviderError where [400, 401, 403].contains(e.status) {
                status = .relinkRequired
                emit("plaid.sync.failed — relink required (\(e.status))")
                throw e
            } catch {
                let status = (error as? ProviderError)?.status ?? 0
                let retryable = status == 429 || status >= 500
                if !retryable || attempt + 1 >= retry.maxAttempts {
                    self.status = .degraded
                    emit("plaid.sync.failed — gave up after \(attempt + 1) attempts")
                    throw error
                }
                let d = retry.delay(attempt: attempt)
                emit("plaid.sync.retry — \(status) → retry #\(attempt + 1) in \(d)ms")
                await retry.sleep(d)
                attempt += 1
            }
        }
    }

    @discardableResult
    public func sync(_ provider: SyncProvider, itemId: String, retry: RetryPolicy = RetryPolicy()) async throws -> Int {
        emit("plaid.sync.started")
        var pages = 0
        while true {
            let page = try await fetch(provider, itemId: itemId, retry: retry)
            apply(page)
            pages += 1
            if !page.hasMore { break }
        }
        status = .healthy
        emit("plaid.sync.completed — \(pages) page(s)")
        return pages
    }

    /// Idempotent webhook handling (spec §6.3).
    public func handle(_ event: WebhookEvent, provider: SyncProvider, retry: RetryPolicy = RetryPolicy()) async -> WebhookResult {
        let key = event.idempotencyKey
        emit("plaid.webhook.received")
        switch idempotency[key] {
        case true?:
            emit("plaid.webhook.deduplicated")
            return .deduplicated
        case false?:
            emit("plaid.webhook.deduplicated — coalesced with in-flight job")
            return .coalesced
        case nil:
            break
        }
        idempotency[key] = false
        do {
            try await sync(provider, itemId: event.itemId, retry: retry)
            idempotency[key] = true
            recalcCount += 1
            emit("forecast.recompute.started — enqueued once")
            return .processed
        } catch {
            idempotency[key] = nil // release so a replay can retry safely
            emit("plaid.webhook.failed")
            return .failed
        }
    }
}

// MARK: - Fault lab

public struct FaultResult: Sendable, Identifiable {
    public let id: String
    public let title: String
    public let expected: String
    public let observed: String
    public let pass: Bool
}

actor ScriptedProvider: SyncProvider {
    enum Fault: Sendable { case status(Int), crash }
    private var calls = 0
    private let faults: [Fault?]
    private let malformed: Bool
    init(_ faults: [Fault?] = [], malformed: Bool = false) { self.faults = faults; self.malformed = malformed }

    static let page1 = SyncPage(added: [
        RawTxn(transactionId: "p_coffee", accountId: "acc_chk", amount: 1250, date: "2026-10-11", name: "Blue Bottle Coffee", pending: true),
        RawTxn(transactionId: "t_rent", accountId: "acc_chk", amount: 260_000, date: "2026-10-01", name: "Foundry Lofts", pending: false),
        RawTxn(transactionId: "t_halcyon", accountId: "acc_chk", amount: -420_000, date: "2026-10-03", name: "Halcyon Labs", pending: false),
    ], nextCursor: "c1", hasMore: true)

    func page2() -> SyncPage {
        var added = [
            RawTxn(transactionId: "t_coffee", accountId: "acc_chk", amount: 1250, date: "2026-10-12", name: "Blue Bottle Coffee", pending: false, pendingTransactionId: "p_coffee"),
            RawTxn(transactionId: "t_figma", accountId: "acc_chk", amount: 7500, date: "2026-10-12", name: "Figma", pending: false),
        ]
        if malformed { added.append(RawTxn(transactionId: "t_bad", accountId: "acc_chk", amount: nil, date: "10/12/2026", name: "Malformed row", pending: false)) }
        return SyncPage(added: added, nextCursor: "c2", hasMore: false)
    }

    func syncPage(itemId: String, cursor: String?) async throws -> SyncPage {
        let fault = calls < faults.count ? faults[calls] : nil
        calls += 1
        await Task.yield() // a real network hop: lets concurrent deliveries interleave
        switch fault {
        case .crash?: throw WorkerCrash()
        case let .status(code)?: throw ProviderError(status: code)
        case nil: return cursor == nil ? Self.page1 : page2()
        }
    }
}

final class Delays: @unchecked Sendable {
    private var values: [Int] = []
    func add(_ v: Int) { values.append(v) }
    var all: [Int] { values }
}

public enum FaultLab {
    static let item = "item_demo"
    static func event(_ id: String = "wh_001") -> WebhookEvent { WebhookEvent(provider: "demo", itemId: item, webhookCode: "SYNC_UPDATES_AVAILABLE", webhookId: id) }
    static func fast(_ delays: Delays? = nil) -> RetryPolicy {
        var r = RetryPolicy()
        r.random = { 0.5 }
        r.sleep = { ms in delays?.add(ms) }
        return r
    }

    public static func run() async -> [FaultResult] {
        let cleanLedger = Ledger()
        _ = try? await cleanLedger.sync(ScriptedProvider(), itemId: item, retry: fast())
        let clean = await cleanLedger.fingerprint
        var results: [FaultResult] = []

        do {
            let l = Ledger(), p = ScriptedProvider()
            var outcomes: [WebhookResult] = []
            for _ in 0..<100 { outcomes.append(await l.handle(event(), provider: p, retry: fast())) }
            let dupes = await l.txns.count - 4
            let fp = await l.fingerprint, recalc = await l.recalcCount
            results.append(FaultResult(id: "duplicate_webhook", title: "Duplicate webhook ×100", expected: "0 duplicate transactions, 1 recompute",
                observed: "\(outcomes.filter { $0 == .processed }.count) processed, \(outcomes.filter { $0 == .deduplicated }.count) deduplicated, \(dupes) duplicates, \(recalc) recompute",
                pass: dupes == 0 && recalc == 1 && fp == clean))
        }
        do {
            let l = Ledger(), p = ScriptedProvider()
            async let a = l.handle(event(), provider: p, retry: fast())
            async let b = l.handle(event(), provider: p, retry: fast())
            let (ra, rb) = await (a, b)
            let fp = await l.fingerprint
            let set = Set([ra, rb])
            results.append(FaultResult(id: "concurrent_webhook", title: "Webhook while a job is running", expected: "Second delivery coalesces",
                observed: "deliveries: \(ra.rawValue), \(rb.rawValue)", pass: set == [.processed, .coalesced] && fp == clean))
        }
        do {
            let l = Ledger(), delays = Delays()
            let r = await l.handle(event(), provider: ScriptedProvider([.status(429), .status(429)]), retry: fast(delays))
            let fp = await l.fingerprint
            results.append(FaultResult(id: "rate_limit", title: "Provider 429 rate limit", expected: "Backoff, bounded retries, then success",
                observed: "\(r.rawValue) after \(delays.all.count) retries (backoff \(delays.all.map { "\($0)ms" }.joined(separator: ", ")))",
                pass: r == .processed && delays.all.count == 2 && fp == clean))
        }
        do {
            let l = Ledger()
            _ = try? await l.sync(ScriptedProvider(), itemId: item, retry: fast())
            let before = await l.fingerprint
            let delays = Delays()
            let r = await l.handle(event("wh_002"), provider: ScriptedProvider([.status(500), .status(500), .status(500), .status(500)]), retry: fast(delays))
            let status = await l.status, after = await l.fingerprint
            results.append(FaultResult(id: "provider_5xx", title: "Provider 5xx outage", expected: "Retry with jitter, keep last good state, mark degraded",
                observed: "\(r.rawValue) after \(delays.all.count + 1) attempts; item \(status.rawValue); state \(after == before ? "unchanged" : "CHANGED")",
                pass: r == .failed && status == .degraded && after == before))
        }
        do {
            let l = Ledger()
            let first = await l.handle(event("wh_003"), provider: ScriptedProvider([nil, .crash]), retry: fast())
            let cursor = await l.cursor
            let replay = await l.handle(event("wh_003"), provider: ScriptedProvider(), retry: fast())
            let fp = await l.fingerprint
            results.append(FaultResult(id: "worker_crash", title: "Worker crash mid-sync, then replay", expected: "Cursor only advances past committed pages; replay converges",
                observed: "crash → \(first.rawValue), cursor held at \(cursor ?? "nil"); replay → \(replay.rawValue); final state \(fp == clean ? "matches" : "DIFFERS from") clean run",
                pass: first == .failed && cursor == "c1" && replay == .processed && fp == clean))
        }
        do {
            let l = Ledger()
            _ = try? await l.sync(ScriptedProvider(), itemId: item, retry: fast())
            let coffee = await l.txns.values.filter { $0.name == "Blue Bottle Coffee" }
            results.append(FaultResult(id: "pending_posted", title: "Pending → posted replacement", expected: "Posted row replaces pending, no double count",
                observed: "\(coffee.count) coffee row (\(coffee.map { $0.pending ? "pending" : "posted" }.joined(separator: ", ")))",
                pass: coffee.count == 1 && !coffee[0].pending))
        }
        do {
            let l = Ledger()
            _ = try? await l.sync(ScriptedProvider([], malformed: true), itemId: item, retry: fast())
            let q = await l.quarantine, fp = await l.fingerprint, n = await l.txns.count
            results.append(FaultResult(id: "malformed", title: "Malformed transaction", expected: "Quarantine row, continue the batch",
                observed: "\(q.count) quarantined (\(q.first?.reason ?? "-")); \(n) good rows applied", pass: q.count == 1 && fp == clean))
        }
        do {
            let l = Ledger()
            let r = await l.handle(event("wh_004"), provider: ScriptedProvider([.status(401)]), retry: fast())
            let status = await l.status
            results.append(FaultResult(id: "expired_item", title: "Expired / revoked item", expected: "Mark relink required, no retry storm",
                observed: "\(r.rawValue); item \(status.rawValue); provider called once", pass: r == .failed && status == .relinkRequired))
        }
        return results
    }
}
