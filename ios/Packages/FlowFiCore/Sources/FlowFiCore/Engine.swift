// Assembles a full deterministic snapshot from fixture data plus the user's
// assumptions and approved overrides. Pure: same options in, same snapshot out.

public struct TransactionOverride: Sendable, Codable, Hashable {
    public let transactionId: String
    public let newValue: BusinessUse
    public init(transactionId: String, newValue: BusinessUse) { self.transactionId = transactionId; self.newValue = newValue }
}

public struct SnapshotOptions: Sendable, Codable, Hashable {
    public var assumptions: [Assumption]
    public var overrides: [TransactionOverride]
    public var followUps: [String: String]
    public var simulateStale: Bool
    public var horizonDays: Int
    public init(assumptions: [Assumption] = [], overrides: [TransactionOverride] = [], followUps: [String: String] = [:], simulateStale: Bool = false, horizonDays: Int = 30) {
        self.assumptions = assumptions; self.overrides = overrides; self.followUps = followUps; self.simulateStale = simulateStale; self.horizonDays = horizonDays
    }
}

public struct BandPoint: Sendable, Codable, Equatable { public let date: ISODate; public let lowerMinor: Minor; public let upperMinor: Minor }

public struct Freshness: Sendable, Codable, Equatable { public let syncedAt: String; public let ageHours: Int; public let stale: Bool }

public struct Snapshot: Sendable {
    public let workspace: Workspace
    public let accounts: [FinancialAccount]
    public let availableMinor: Minor
    public let reserveMinor: Minor
    public let freshness: Freshness
    public let transactions: [Transaction]
    public let streams: [RecurringStream]
    public let invoices: [Invoice]
    public let forecasts: [Scenario: Forecast]
    public let band: [BandPoint]
    public let spending: SpendingChange
    public let flowScore: FlowScore
    public let alerts: [Alert]
    public var base: Forecast { forecasts[.base]! }
}

public enum Engine {
    public static let staleAfterHours = 24

    public static func snapshot(_ opts: SnapshotOptions = SnapshotOptions(), data: DemoData = DemoDataset.shared) -> Snapshot {
        let ws = data.workspace
        let asOf = ws.asOf
        let overrides = Dictionary(opts.overrides.map { ($0.transactionId, $0.newValue) }, uniquingKeysWith: { _, b in b })
        let txns = overrides.isEmpty ? data.transactions : data.transactions.map { t in
            guard let use = overrides[t.id] else { return t }
            var c = t
            c.businessUse = use
            return c
        }
        let streams = Recurring.detect(txns, asOf: asOf)
        let invoices = InvoiceRisk.estimate(data.invoices, asOf: asOf).map { inv in
            guard let draft = opts.followUps[inv.id] else { return inv }
            var c = inv
            c.followUpDraftId = draft
            return c
        }
        let depository = data.accounts.filter { $0.type == .depository }
        let start = Money.sum(depository.map(\.balanceMinor))
        let reserve = Money.sum(depository.filter { $0.role == .reserve }.map(\.balanceMinor))
        let age = opts.simulateStale ? 52 : 0
        let freshness = Freshness(syncedAt: opts.simulateStale ? "2026-10-10T11:42:00Z" : ws.syncedAt, ageHours: age, stale: age > staleAfterHours)

        let events = ForecastEngine.apply(ForecastEngine.buildEvents(asOf: asOf, horizonDays: opts.horizonDays, streams: streams, invoices: invoices, obligations: data.obligations), assumptions: opts.assumptions, asOf: asOf)
        let input = ForecastInput(asOf: asOf, dataFreshness: freshness.syncedAt, horizonDays: opts.horizonDays, startBalanceMinor: start, floorMinor: ws.safetyFloorMinor,
                                  variableDailyMinor: ForecastEngine.variableDaily(txns, streams: streams, depositoryIds: Set(depository.map(\.id)), asOf: asOf), events: events)
        var forecasts: [Scenario: Forecast] = [:]
        for s in Scenario.allCases { forecasts[s] = ForecastEngine.run(input, scenario: s) }
        let base = forecasts[.base]!
        let band = base.points.indices.map { i in
            let vals = Scenario.allCases.map { forecasts[$0]!.points[i].balanceMinor }
            return BandPoint(date: base.points[i].date, lowerMinor: vals.min()!, upperMinor: vals.max()!)
        }
        let spending = Spending.change(txns, streams: streams, asOf: asOf)
        let score = FlowScoring.compute(asOf: asOf, forecast: base, streams: streams, txns: txns, invoices: invoices, spending: spending, reserveMinor: reserve, reserveTargetMinor: ws.reserveTargetMinor)
        let alerts = Alerts.build(forecast: base, invoices: invoices, streams: streams, txns: txns, reserveMinor: reserve, reserveTargetMinor: ws.reserveTargetMinor, stale: freshness.stale, ageHours: age)

        return Snapshot(workspace: ws, accounts: data.accounts, availableMinor: start, reserveMinor: reserve, freshness: freshness, transactions: txns, streams: streams,
                        invoices: invoices, forecasts: forecasts, band: band, spending: spending, flowScore: score, alerts: alerts)
    }
}
