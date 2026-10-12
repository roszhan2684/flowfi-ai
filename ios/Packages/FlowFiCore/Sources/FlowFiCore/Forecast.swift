public enum Scenario: String, Sendable, CaseIterable, Codable, Identifiable {
    case conservative, base, optimistic
    public var id: String { rawValue }
    public var title: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }

    var variableFactor: Double { self == .conservative ? 1.25 : self == .optimistic ? 0.85 : 1 }
    var delayUncertainDays: Int { self == .conservative ? 7 : 0 }
    public var rule: String {
        switch self {
        case .base: return "Expected dates, average spend"
        case .conservative: return "Uncertain receivables +7 days, spend +25%"
        case .optimistic: return "Expected dates, spend −15%"
        }
    }
}

public enum EventType: String, Sendable, Codable { case recurring, invoice, obligation, oneOff }

public struct ForecastEvent: Sendable, Codable, Identifiable, Equatable {
    public var id: String { key }
    public let key: String
    public var date: ISODate
    public let amountMinor: Minor
    public let type: EventType
    public let name: String
    public var confidence: Double
    public let sourceId: String
    public var dueDate: ISODate?
    public var note: String?
}

public enum Assumption: Sendable, Codable, Hashable {
    case invoiceOnDue(invoiceId: String)
    case shiftEvent(eventKey: String, days: Int)
    case removeEvent(eventKey: String)
    case oneOff(id: String, name: String, date: ISODate, amountMinor: Minor)
}

public struct ForecastInput: Sendable, Codable {
    public let asOf: ISODate
    public let dataFreshness: String
    public let horizonDays: Int
    public let startBalanceMinor: Minor
    public let floorMinor: Minor
    public let variableDailyMinor: Minor
    public let events: [ForecastEvent]
}

public struct ForecastPoint: Sendable, Codable, Identifiable, Equatable {
    public var id: String { date }
    public let date: ISODate
    public let balanceMinor: Minor
    public let inflowsMinor: Minor
    public let outflowsMinor: Minor
    public let variableMinor: Minor
    public let events: [ForecastEvent]
}

public struct Driver: Sendable, Codable, Identifiable, Equatable {
    public var id: String { name }
    public let type: String
    public let name: String
    public let impactMinor: Minor
    public let date: ISODate?
}

public struct Breach: Sendable, Codable, Equatable {
    public let firstDate: ISODate
    public let minDate: ISODate
    public let minBalanceMinor: Minor
    public let daysBelow: Int
    public let shortfallMinor: Minor
}

public struct Forecast: Sendable, Codable, Equatable {
    public static let modelVersion = "det-forecast-1.0"
    public let id: String
    public let scenario: Scenario
    public let asOf: ISODate
    public let horizonDays: Int
    public let dataFreshness: String
    public let startBalanceMinor: Minor
    public let endBalanceMinor: Minor
    public let floorMinor: Minor
    public let variableDailyMinor: Minor
    public let points: [ForecastPoint]
    public let minPoint: ForecastPoint
    public let breach: Breach?
    public let drivers: [Driver]
    public let assumptions: [String]
}

public enum ForecastEngine {
    static let uncertainBelow = 0.8
    static let variableWindowDays = 60

    /// Average non-recurring depository spend per day over the trailing window.
    public static func variableDaily(_ txns: [Transaction], streams: [RecurringStream], depositoryIds: Set<String>, asOf: ISODate) -> Minor {
        let recurring = Set(streams.flatMap(\.transactionIds))
        let from = Dates.addDays(asOf, -variableWindowDays)
        let spend = txns.filter {
            depositoryIds.contains($0.accountId) && !$0.pending && $0.kind == .expense && $0.amountMinor < 0
                && !recurring.contains($0.id) && $0.occurredAt >= from && $0.occurredAt < asOf
        }
        return Money.round(Double(-Money.sum(spend.map(\.amountMinor))) / Double(variableWindowDays))
    }

    public static func buildEvents(asOf: ISODate, horizonDays: Int, streams: [RecurringStream], invoices: [Invoice], obligations: [CashObligation]) -> [ForecastEvent] {
        let end = Dates.addDays(asOf, horizonDays)
        var events: [ForecastEvent] = []
        for s in streams {
            var date = s.nextDate
            var n = 0
            while date <= end {
                events.append(ForecastEvent(key: "\(s.key)#\(n)", date: date, amountMinor: s.direction == .inflow ? s.expectedAmountMinor : -s.expectedAmountMinor, type: .recurring, name: s.merchant, confidence: s.confidence, sourceId: s.key))
                date = Dates.addMonths(date, 1, anchorDay: s.anchorDay)
                n += 1
            }
        }
        for inv in invoices where inv.status != .paid {
            guard let expected = inv.expectedDate else { continue }
            events.append(ForecastEvent(key: "inv:\(inv.id)", date: expected, amountMinor: inv.amountMinor, type: .invoice, name: "\(inv.number) · \(inv.client)", confidence: inv.confidence ?? 0.5, sourceId: inv.id, dueDate: inv.dueDate))
        }
        for o in obligations {
            events.append(ForecastEvent(key: "obl:\(o.id)", date: o.expectedDate, amountMinor: -o.amountMinor, type: .obligation, name: o.name, confidence: 0.99, sourceId: o.id, note: o.note))
        }
        return sortEvents(events)
    }

    static func sortEvents(_ e: [ForecastEvent]) -> [ForecastEvent] {
        e.sorted { $0.date != $1.date ? $0.date < $1.date : $0.key < $1.key }
    }

    public static func apply(_ events: [ForecastEvent], assumptions: [Assumption], asOf: ISODate) -> [ForecastEvent] {
        var out = events
        for a in assumptions {
            switch a {
            case let .invoiceOnDue(invoiceId):
                out = out.map { e in
                    guard e.type == .invoice, e.sourceId == invoiceId, let due = e.dueDate else { return e }
                    var c = e
                    c.date = due > asOf ? due : Dates.addDays(asOf, 1)
                    c.confidence = 0.9
                    c.note = "Assumed paid on due date"
                    return c
                }
            case let .shiftEvent(key, days):
                out = out.map { e in
                    guard e.key == key else { return e }
                    var c = e
                    c.date = Dates.addDays(e.date, days)
                    c.note = "Shifted \(days > 0 ? "+" : "")\(days) days"
                    return c
                }
            case let .removeEvent(key):
                out.removeAll { $0.key == key }
            case let .oneOff(id, name, date, amount):
                out.append(ForecastEvent(key: "one:\(id)", date: date, amountMinor: amount, type: .oneOff, name: name, confidence: 1, sourceId: id))
            }
        }
        return sortEvents(out)
    }

    static func applyScenario(_ events: [ForecastEvent], _ scenario: Scenario) -> [ForecastEvent] {
        let delay = scenario.delayUncertainDays
        guard delay > 0 else { return events }
        return events.map { e in
            guard e.amountMinor > 0, e.confidence < uncertainBelow else { return e }
            var c = e
            c.date = Dates.addDays(e.date, delay)
            c.note = "Delayed \(delay) days (conservative)"
            return c
        }
    }

    public static func run(_ input: ForecastInput, scenario: Scenario = .base) -> Forecast {
        let variable = Money.scale(input.variableDailyMinor, scenario.variableFactor)
        let events = applyScenario(input.events, scenario)
        let byDate = Dictionary(grouping: events, by: \.date)

        var points = [ForecastPoint(date: input.asOf, balanceMinor: input.startBalanceMinor, inflowsMinor: 0, outflowsMinor: 0, variableMinor: 0, events: [])]
        var balance = input.startBalanceMinor
        for d in 1...input.horizonDays {
            let date = Dates.addDays(input.asOf, d)
            let todays = byDate[date] ?? []
            let inflows = Money.sum(todays.filter { $0.amountMinor > 0 }.map(\.amountMinor))
            let outflows = -Money.sum(todays.filter { $0.amountMinor < 0 }.map(\.amountMinor))
            balance = balance + inflows - outflows - variable
            points.append(ForecastPoint(date: date, balanceMinor: balance, inflowsMinor: inflows, outflowsMinor: outflows, variableMinor: variable, events: todays))
        }

        var minPoint = points[0]
        for p in points where p.balanceMinor < minPoint.balanceMinor { minPoint = p }
        let below = points.filter { $0.balanceMinor < input.floorMinor }
        let breach = below.isEmpty ? nil : Breach(firstDate: below[0].date, minDate: minPoint.date, minBalanceMinor: minPoint.balanceMinor, daysBelow: below.count, shortfallMinor: input.floorMinor - minPoint.balanceMinor)

        return Forecast(
            id: "fc_\(hash("\(input.asOf)|\(input.startBalanceMinor)|\(input.variableDailyMinor)|\(events.map { "\($0.key)@\($0.date)" }.joined(separator: ","))|\(scenario.rawValue)"))",
            scenario: scenario, asOf: input.asOf, horizonDays: input.horizonDays, dataFreshness: input.dataFreshness,
            startBalanceMinor: input.startBalanceMinor, endBalanceMinor: balance, floorMinor: input.floorMinor,
            variableDailyMinor: variable, points: points, minPoint: minPoint, breach: breach,
            drivers: explain(points, events, until: minPoint.date, asOf: input.asOf, variable: variable),
            assumptions: describe(events, variable: variable, scenario: scenario, horizon: input.horizonDays, asOf: input.asOf))
    }

    /// Dominant drivers between today and the low point.
    static func explain(_ points: [ForecastPoint], _ events: [ForecastEvent], until: ISODate, asOf: ISODate, variable: Minor) -> [Driver] {
        var drivers: [Driver] = []
        for p in points where p.date <= until {
            for e in p.events where e.amountMinor < 0 {
                drivers.append(Driver(type: e.type.rawValue, name: e.name, impactMinor: e.amountMinor, date: e.date))
            }
        }
        // Receivables due before the low point but expected after it.
        for e in events where e.type == .invoice {
            if let due = e.dueDate, due <= until, e.date > until {
                let number = String(e.name.split(separator: " · ").first ?? Substring(e.name))
                drivers.append(Driver(type: "invoice_delay", name: "\(number) expected \(Dates.short(e.date)), due \(Dates.short(due))", impactMinor: -e.amountMinor, date: due))
            }
        }
        let days = Dates.diffDays(until, asOf)
        if days > 0 && variable > 0 {
            drivers.append(Driver(type: "variable", name: "Day-to-day spend (\(days) days)", impactMinor: -variable * days, date: nil))
        }
        return Array(drivers.enumerated().sorted { $0.element.impactMinor != $1.element.impactMinor ? $0.element.impactMinor < $1.element.impactMinor : $0.offset < $1.offset }.map(\.element).prefix(4))
    }

    static func describe(_ events: [ForecastEvent], variable: Minor, scenario: Scenario, horizon: Int, asOf: ISODate) -> [String] {
        let end = Dates.addDays(asOf, horizon)
        var lines = ["Day-to-day spend \(Money.format(variable))/day (60-day average\(scenario == .base ? "" : ", \(scenario.rawValue)"))"]
        for e in events {
            if e.type == .invoice {
                let late = e.dueDate.map { Dates.diffDays(e.date, $0) } ?? 0
                let when = e.date > end ? "after this horizon" : Dates.short(e.date)
                lines.append("\(String(e.name.split(separator: " · ").first ?? Substring(e.name))) pays \(when)\(late > 0 ? " (\(late) days after due)" : "") · \(Int((e.confidence * 100).rounded()))% confidence")
            } else if e.type == .obligation {
                lines.append("\(e.name) \(Money.format(-e.amountMinor)) paid \(Dates.short(e.date))")
            } else if let note = e.note {
                lines.append("\(e.name): \(note.lowercased())")
            }
        }
        return lines
    }

    static func hash(_ s: String) -> String {
        var h: UInt32 = 0x811C_9DC5
        for b in s.utf8 {
            h ^= UInt32(b)
            h = h &* 0x0100_0193
        }
        return String(h, radix: 36)
    }
}
