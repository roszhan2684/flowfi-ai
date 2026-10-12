public enum Recurring {
    public static func merchantKey(_ name: String) -> String {
        var out = ""
        var lastDash = false
        for ch in name.lowercased() {
            if ch.isASCII && (ch.isLetter || ch.isNumber) {
                out.append(ch)
                lastDash = false
            } else if !lastDash {
                out.append("-")
                lastDash = true
            }
        }
        while out.hasPrefix("-") { out.removeFirst() }
        while out.hasSuffix("-") { out.removeLast() }
        return out
    }

    /// Monthly streams: >= 3 posted occurrences whose gaps all look monthly.
    /// Confidence falls with day-of-month jitter and amount variation.
    public static func detect(_ txns: [Transaction], asOf: ISODate) -> [RecurringStream] {
        var groups: [String: [Transaction]] = [:]
        var order: [String] = []
        for t in txns where !t.pending && t.kind != .transfer && t.kind != .cardPayment && t.occurredAt <= asOf {
            let key = "\(merchantKey(t.merchantName)):\(t.amountMinor >= 0 ? "in" : "out"):\(t.accountId)"
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(t)
        }

        var streams: [RecurringStream] = []
        for key in order {
            let list = groups[key]!
            guard list.count >= 3 else { continue }
            let sorted = list.sorted { $0.occurredAt < $1.occurredAt }
            let gaps = zip(sorted.dropFirst(), sorted).map { Dates.diffDays($0.occurredAt, $1.occurredAt) }
            guard gaps.allSatisfy({ (26...35).contains($0) }) else { continue }

            let last = sorted[sorted.count - 1], prev = sorted[sorted.count - 2]
            let days = sorted.map { Dates.day($0.occurredAt) }
            let anchor = mode(days)
            let jitter = days.max()! - days.min()!
            let amounts = sorted.map { abs($0.amountMinor) }
            let spread = Double(amounts.max()! - amounts.min()!) / Double(amounts.max()!)
            var next = Dates.addMonths(last.occurredAt, 1, anchorDay: anchor)
            while next <= asOf { next = Dates.addMonths(next, 1, anchorDay: anchor) }
            let conf = min(1, max(0, 0.98 - Double(jitter) * 0.03 - spread * 0.2))

            streams.append(RecurringStream(
                key: "rec:\(merchantKey(last.merchantName))",
                merchant: last.merchantName,
                direction: last.amountMinor >= 0 ? .inflow : .outflow,
                anchorDay: anchor,
                expectedAmountMinor: abs(last.amountMinor),
                previousAmountMinor: abs(prev.amountMinor),
                lastDate: last.occurredAt,
                nextDate: next,
                occurrences: sorted.count,
                confidence: (conf * 100).rounded() / 100,
                category: last.category,
                transactionIds: sorted.map(\.id)))
        }
        // Stable sort by amount, largest first (matches the web engine).
        return streams.enumerated().sorted { a, b in
            a.element.expectedAmountMinor != b.element.expectedAmountMinor ? a.element.expectedAmountMinor > b.element.expectedAmountMinor : a.offset < b.offset
        }.map(\.element)
    }

    static func mode(_ values: [Int]) -> Int {
        var counts: [Int: Int] = [:]
        for v in values { counts[v, default: 0] += 1 }
        return counts.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }[0].key
    }
}

public enum InvoiceRisk {
    public static func averageDaysLate(_ invoices: [Invoice], client: String) -> (paid: Int, avg: Int) {
        let paid = invoices.filter { $0.client == client && $0.status == .paid && $0.paidAt != nil }
        let late = paid.map { max(0, Dates.diffDays($0.paidAt!, $0.dueDate)) }
        let avg = late.isEmpty ? 0 : Int((Double(late.reduce(0, +)) / Double(late.count)).rounded(.toNearestOrAwayFromZero))
        return (paid.count, avg)
    }

    /// Expected date = due + client's average lateness; confidence drops with lateness.
    public static func estimate(_ invoices: [Invoice], asOf: ISODate) -> [Invoice] {
        invoices.map { inv in
            guard inv.status != .paid else { return inv }
            var out = inv
            let h = averageDaysLate(invoices, client: inv.client)
            var expected = Dates.addDays(inv.dueDate, h.avg)
            if expected <= asOf { expected = Dates.addDays(asOf, 1) }
            var c = h.paid == 0 ? 0.7 : 0.92
            if h.avg > 0 { c -= min(0.45, Double(h.avg) * 0.035) }
            if inv.dueDate < asOf { c -= 0.1 }
            out.expectedDate = expected
            out.confidence = (max(0.2, c) * 100).rounded() / 100
            if inv.status == .open && inv.dueDate < asOf { out.status = .late }
            return out
        }
    }

    public static func isAtRisk(_ inv: Invoice) -> Bool {
        inv.status != .paid && ((inv.confidence ?? 1) < 0.7 || (inv.expectedDate ?? inv.dueDate) > inv.dueDate)
    }
}
