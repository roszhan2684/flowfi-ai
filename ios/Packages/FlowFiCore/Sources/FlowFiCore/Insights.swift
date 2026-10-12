// Spending change, FlowScore and alerts — deterministic rules over the snapshot.

public struct SpendingChange: Sendable, Codable, Equatable {
    public struct Category: Sendable, Codable, Equatable { public let category: String; public let currentMinor: Minor; public let previousMinor: Minor; public let deltaMinor: Minor }
    public struct Largest: Sendable, Codable, Equatable { public let id: String; public let merchant: String; public let amountMinor: Minor; public let date: ISODate }
    public let currentMinor: Minor
    public let previousMinor: Minor
    public let changePct: Double
    public let byCategory: [Category]
    public let largest: [Largest]
}

public enum Spending {
    public static func change(_ txns: [Transaction], streams: [RecurringStream], asOf: ISODate, window: Int = 30) -> SpendingChange {
        let recurring = Set(streams.flatMap(\.transactionIds))
        let disc = txns.filter { $0.kind == .expense && $0.amountMinor < 0 && !$0.pending && !recurring.contains($0.id) }
        let curFrom = Dates.addDays(asOf, -window), prevFrom = Dates.addDays(asOf, -2 * window)
        let cur = disc.filter { $0.occurredAt >= curFrom && $0.occurredAt < asOf }
        let prev = disc.filter { $0.occurredAt >= prevFrom && $0.occurredAt < curFrom }
        let c = -Money.sum(cur.map(\.amountMinor)), p = -Money.sum(prev.map(\.amountMinor))
        var cats: [String: (Minor, Minor)] = [:]
        var order: [String] = []
        for t in cur { if cats[t.category] == nil { order.append(t.category) }; cats[t.category, default: (0, 0)].0 -= t.amountMinor }
        for t in prev { if cats[t.category] == nil { order.append(t.category) }; cats[t.category, default: (0, 0)].1 -= t.amountMinor }
        let byCat = order.enumerated().map { i, k in (i, SpendingChange.Category(category: k, currentMinor: cats[k]!.0, previousMinor: cats[k]!.1, deltaMinor: cats[k]!.0 - cats[k]!.1)) }
            .sorted { $0.1.deltaMinor != $1.1.deltaMinor ? $0.1.deltaMinor > $1.1.deltaMinor : $0.0 < $1.0 }.map(\.1)
        let largest = cur.enumerated().sorted { $0.element.amountMinor != $1.element.amountMinor ? $0.element.amountMinor < $1.element.amountMinor : $0.offset < $1.offset }
            .prefix(3).map { SpendingChange.Largest(id: $0.element.id, merchant: $0.element.merchantName, amountMinor: -$0.element.amountMinor, date: $0.element.occurredAt) }
        let pct = p == 0 ? 0 : (Double(c - p) / Double(p) * 1000).rounded() / 10
        return SpendingChange(currentMinor: c, previousMinor: p, changePct: pct, byCategory: byCat, largest: Array(largest))
    }
}

public struct FlowScoreFactor: Sendable, Codable, Identifiable, Equatable {
    public var id: String { key }
    public let key: String
    public let label: String
    public let points: Int
    public let max: Int
    public let value: String
    public let detail: String
    public var positive: Bool { Double(points) >= Double(max) * 0.6 }
}

public struct FlowScore: Sendable, Codable, Equatable {
    public let score: Int
    public let band: String
    public let factors: [FlowScoreFactor]
    public static let disclaimer = "Not a credit score. It summarizes current FlowFi signals only."
}

public enum FlowScoring {
    static func lerp01(_ x: Double, _ zero: Double, _ full: Double) -> Double { min(1, max(0, (x - zero) / (full - zero))) }
    static func r(_ x: Double) -> Int { Int(x.rounded(.toNearestOrAwayFromZero)) }

    public static func compute(asOf: ISODate, forecast f: Forecast, streams: [RecurringStream], txns: [Transaction], invoices: [Invoice], spending: SpendingChange, reserveMinor: Minor, reserveTargetMinor: Minor) -> FlowScore {
        var factors: [FlowScoreFactor] = []
        let floor = Money.format(f.floorMinor, cents: false)

        let runway = f.breach.map { Dates.diffDays($0.firstDate, asOf) } ?? f.horizonDays
        factors.append(FlowScoreFactor(key: "runway", label: "Cash runway", points: r(25 * Double(runway) / Double(f.horizonDays)), max: 25,
            value: f.breach == nil ? "\(f.horizonDays)+ days" : "\(runway) days",
            detail: f.breach.map { "Balance crosses the \(floor) floor on \(Dates.short($0.firstDate))" } ?? "Stays above the \(floor) floor for \(f.horizonDays) days"))

        let months = [-3, -2, -1].map { Dates.monthKey(Dates.addMonths(String(asOf.prefix(7)) + "-01", $0)) }
        let inflowIds = Set(streams.filter { $0.direction == .inflow }.flatMap(\.transactionIds))
        let totals = months.map { mk in Double(Money.sum(txns.filter { inflowIds.contains($0.id) && Dates.monthKey($0.occurredAt) == mk }.map(\.amountMinor))) }
        let mean = totals.reduce(0, +) / Double(totals.count)
        let cv = mean == 0 ? 1 : (totals.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(totals.count)).squareRoot() / mean
        factors.append(FlowScoreFactor(key: "income", label: "Income consistency", points: r(20 * (1 - lerp01(cv, 0, 0.5))), max: 20,
            value: "\(streams.filter { $0.direction == .inflow }.count) retainers", detail: "Recurring income varied \(r(cv * 100))% month to month"))

        let g = spending.previousMinor == 0 ? 0 : Double(spending.currentMinor - spending.previousMinor) / Double(spending.previousMinor)
        factors.append(FlowScoreFactor(key: "expense_growth", label: "Expense growth", points: r(15 * (1 - lerp01(g, 0.05, 0.5))), max: 15,
            value: "\(g >= 0 ? "+" : "")\(r(g * 100))%",
            detail: spending.largest.first.map { "Largest: \($0.merchant) \(Money.format($0.amountMinor, cents: false))" } ?? "No discretionary spend"))

        let end = f.points.last!.date
        let expectedIn = Money.sum(f.points.map(\.inflowsMinor))
        let risky = invoices.filter { InvoiceRisk.isAtRisk($0) && $0.dueDate <= end }
        let ratio = expectedIn == 0 ? 0 : min(1, Double(Money.sum(risky.map(\.amountMinor))) / Double(expectedIn))
        factors.append(FlowScoreFactor(key: "receivables", label: "Receivables risk", points: r(15 * (1 - ratio)), max: 15,
            value: "\(r(ratio * 100))% at risk", detail: risky.isEmpty ? "No invoices at risk" : "\(risky.map(\.number).joined(separator: ", ")) likely late"))

        let fixedOut = Money.sum(streams.filter { $0.direction == .outflow }.map(\.expectedAmountMinor))
        let fixedIn = Money.sum(streams.filter { $0.direction == .inflow }.map(\.expectedAmountMinor))
        let load = fixedIn == 0 ? 2 : Double(fixedOut) / Double(fixedIn)
        factors.append(FlowScoreFactor(key: "obligations", label: "Recurring obligations", points: r(15 * (1 - lerp01(load, 0.5, 1.2))), max: 15,
            value: "\(r(load * 100))% of retainers", detail: "\(Money.format(fixedOut, cents: false))/mo fixed vs \(Money.format(fixedIn, cents: false))/mo recurring income"))

        let cover = reserveTargetMinor == 0 ? 1 : Double(reserveMinor) / Double(reserveTargetMinor)
        factors.append(FlowScoreFactor(key: "reserve", label: "Reserve coverage", points: r(10 * min(1, cover)), max: 10,
            value: "\(r(cover * 100))%", detail: "\(Money.format(reserveMinor, cents: false)) of \(Money.format(reserveTargetMinor, cents: false)) target"))

        let score = factors.map(\.points).reduce(0, +)
        return FlowScore(score: score, band: score >= 75 ? "Strong" : score >= 60 ? "Stable" : score >= 40 ? "Watch" : "At risk", factors: factors)
    }
}

public struct Alert: Sendable, Codable, Identifiable, Equatable {
    public enum Kind: String, Sendable, Codable { case cashThreshold, invoiceRisk, subscriptionIncrease, unusualSpending, taxReserveGap, syncStale }
    public enum Severity: String, Sendable, Codable { case high, medium, low }
    public let id: String
    public let kind: Kind
    public let severity: Severity
    public let title: String
    public let detail: String
    public let recommendedAction: String
    public let evidenceId: String
    public let evidenceLabel: String
}

public enum Alerts {
    public static func build(forecast f: Forecast, invoices: [Invoice], streams: [RecurringStream], txns: [Transaction], reserveMinor: Minor, reserveTargetMinor: Minor, stale: Bool, ageHours: Int) -> [Alert] {
        var out: [Alert] = []
        if stale {
            out.append(Alert(id: "al_sync_stale", kind: .syncStale, severity: .high, title: "Bank data is out of date", detail: "Last successful sync was \(ageHours) hours ago. Showing last good state.", recommendedAction: "Retry sync", evidenceId: "item_demo", evidenceLabel: "Demo provider item"))
        }
        if let b = f.breach {
            out.append(Alert(id: "al_cash_threshold", kind: .cashThreshold, severity: .high, title: "Cash may dip below \(Money.format(f.floorMinor, cents: false)) on \(Dates.short(b.firstDate))", detail: "Projected low \(Money.format(b.minBalanceMinor)) on \(Dates.short(b.minDate)) — \(Money.format(b.shortfallMinor)) under your floor.", recommendedAction: "Review drivers", evidenceId: f.id, evidenceLabel: "\(f.scenario.rawValue) forecast"))
        }
        for inv in invoices where inv.status != .paid && InvoiceRisk.isAtRisk(inv) {
            out.append(Alert(id: "al_invoice_\(inv.id)", kind: .invoiceRisk, severity: .medium, title: "\(inv.number) likely late", detail: "\(inv.client) usually pays after the due date. Expected \(Dates.short(inv.expectedDate!)) vs due \(Dates.short(inv.dueDate)).", recommendedAction: "Draft follow-up", evidenceId: inv.id, evidenceLabel: "\(inv.number) · \(Money.format(inv.amountMinor, cents: false))"))
        }
        for s in streams where s.direction == .outflow && Double(s.expectedAmountMinor) > Double(s.previousAmountMinor) * 1.2 {
            out.append(Alert(id: "al_sub_\(s.key)", kind: .subscriptionIncrease, severity: .low, title: "\(s.merchant) went up", detail: "\(Money.format(s.previousAmountMinor)) → \(Money.format(s.expectedAmountMinor)) per month.", recommendedAction: "Review subscription", evidenceId: s.key, evidenceLabel: "\(s.occurrences) charges"))
        }
        let recurring = Set(streams.flatMap(\.transactionIds))
        for t in txns where t.kind == .expense && !recurring.contains(t.id) && -t.amountMinor >= 100_000 && t.occurredAt >= Dates.addDays(f.asOf, -30) {
            out.append(Alert(id: "al_unusual_\(t.id)", kind: .unusualSpending, severity: .medium, title: "Unusual \(t.category.lowercased()) purchase", detail: "\(t.merchantName) \(Money.format(-t.amountMinor)) on \(Dates.short(t.occurredAt)) — classified as \(t.businessUse.rawValue).", recommendedAction: "Review & classify", evidenceId: t.id, evidenceLabel: t.merchantName))
        }
        if reserveMinor < reserveTargetMinor {
            out.append(Alert(id: "al_reserve_gap", kind: .taxReserveGap, severity: .low, title: "Tax reserve below target", detail: "\(Money.format(reserveMinor, cents: false)) of \(Money.format(reserveTargetMinor, cents: false)) — \(Money.format(reserveTargetMinor - reserveMinor, cents: false)) short.", recommendedAction: "Plan reserve transfer", evidenceId: "acc_sav", evidenceLabel: "Tax Reserve ••1177"))
        }
        let rank: [Alert.Severity: Int] = [.high: 0, .medium: 1, .low: 2]
        return out.enumerated().sorted { rank[$0.element.severity]! != rank[$1.element.severity]! ? rank[$0.element.severity]! < rank[$1.element.severity]! : $0.offset < $1.offset }.map(\.element)
    }
}
