// FlowFi copilot. A deterministic intent router stands in for an LLM so the
// demo runs fully on-device with no key. It obeys the same contract a
// tool-calling model would: choose tools → read their output → answer quoting
// only tool numbers → emit proposals, never writes.

public struct Citation: Sendable, Codable, Identifiable, Equatable {
    public var id: String { "\(type):\(sourceId)" }
    public let type: String
    public let sourceId: String
    public let label: String
    public let asOf: String
}

public struct ProposedAction: Sendable, Codable, Identifiable, Equatable {
    public enum Kind: String, Sendable, Codable { case invoiceFollowUp = "invoice_followup_draft", classifyTransaction = "classify_transaction", reservePlan = "reserve_plan" }
    public enum Status: String, Sendable, Codable { case proposed, approved, rejected }
    public let id: String
    public let kind: Kind
    public let title: String
    public let summary: String
    public let riskLevel: String
    public let payload: [String: String]
    public var status: Status = .proposed
}

public struct TraceStep: Sendable, Codable, Identifiable, Equatable {
    public var id: String { "\(index):\(tool)" }
    public let index: Int
    public let tool: String
    public let access: String
    public let ok: Bool
    public let summary: String
}

public struct Calculation: Sendable, Codable, Identifiable, Equatable {
    public var id: String { label }
    public let label: String
    public let valueMinor: Minor
    public let source: String
}

public struct AgentResponse: Sendable, Codable, Identifiable, Equatable {
    public var id: String { runId }
    public let runId: String
    public let intent: String
    public let answer: String
    public let citations: [Citation]
    public let calculations: [Calculation]
    public var proposedActions: [ProposedAction]
    public let uncertainties: [String]
    public let guardrails: [String]
    public let dataFreshness: String
    public let trace: [TraceStep]
    public static let model = "flowfi-demo-router-1 (deterministic, on-device, no LLM)"
}

public enum Sanitizer {
    static let patterns = ["ignore previous instructions", "ignore all previous instructions", "ignore prior instructions", "approve all", "system prompt", "you are now", "note to ai"]
    /// Untrusted provider text is data; instruction-like content never reaches the model verbatim.
    public static func sanitize(_ text: String?) -> (text: String?, flagged: Bool) {
        guard let text else { return (nil, false) }
        let lower = text.lowercased()
        let transfer = lower.contains("transfer ") && lower.contains("$")
        if patterns.contains(where: { lower.contains($0) }) || (transfer && lower.contains("acct")) {
            return ("[instruction-like text withheld — treated as data]", true)
        }
        return (text, false)
    }
}

/// Deterministic id source so tests and previews are reproducible.
public final class IdSource: @unchecked Sendable {
    private var n = 0
    private let prefix: String
    public init(prefix: String = "act") { self.prefix = prefix }
    public func next() -> String { n += 1; return "\(prefix)_\(n)" }
}

// MARK: - Tools

public enum ToolError: Error, Equatable { case unknownTool(String), invalidArguments(String), notFound(String) }

public struct ToolContext {
    public let snapshot: Snapshot
    public let options: SnapshotOptions
    public let ids: IdSource
}

public enum Tools {
    public static let catalog: [String: String] = [
        "get_cash_position": "read", "get_forecast": "read", "get_invoices": "read", "get_flow_score": "read",
        "get_recurring_cashflows": "read", "detect_spending_change": "read", "get_transactions": "read", "run_scenario": "read",
        "create_invoice_followup_draft": "write_proposal", "classify_transaction_proposal": "write_proposal", "create_budget_draft": "write_proposal",
    ]

    public struct ScenarioResult: Sendable { public let minMinor: Minor; public let minDate: ISODate; public let breach: Bool; public let endMinor: Minor }

    public static func forecast(_ ctx: ToolContext, scenario: String) throws -> Forecast {
        guard let s = Scenario(rawValue: scenario) else { throw ToolError.invalidArguments("unknown scenario \"\(scenario)\"") }
        return ctx.snapshot.forecasts[s]!
    }

    public static func runScenario(_ ctx: ToolContext, _ assumptions: [Assumption]) throws -> ScenarioResult {
        guard !assumptions.isEmpty else { throw ToolError.invalidArguments("assumptions must be non-empty") }
        let keys = Set(ctx.snapshot.base.points.flatMap { $0.events.map(\.key) })
        for a in assumptions {
            switch a {
            case let .invoiceOnDue(id):
                guard ctx.snapshot.invoices.contains(where: { $0.id == id && $0.status != .paid }) else { throw ToolError.notFound("unknown open invoice \"\(id)\"") }
            case let .shiftEvent(key, days):
                guard abs(days) <= 60 else { throw ToolError.invalidArguments("shift days must be within ±60") }
                guard keys.contains(key) else { throw ToolError.notFound("no forecast event \"\(key)\"") }
            case let .removeEvent(key):
                guard keys.contains(key) else { throw ToolError.notFound("no forecast event \"\(key)\"") }
            case .oneOff: break
            }
        }
        var o = ctx.options
        o.assumptions += assumptions
        let f = Engine.snapshot(o).base
        return ScenarioResult(minMinor: f.minPoint.balanceMinor, minDate: f.minPoint.date, breach: f.breach != nil, endMinor: f.endBalanceMinor)
    }

    public static func followUpDraft(_ ctx: ToolContext, invoiceId: String) throws -> ProposedAction {
        guard let inv = ctx.snapshot.invoices.first(where: { $0.id == invoiceId && $0.status != .paid }) else { throw ToolError.notFound("unknown open invoice \"\(invoiceId)\"") }
        let body = "Hi \(inv.client) team — a friendly heads-up that \(inv.number) (\(Money.format(inv.amountMinor))) is due \(Dates.short(inv.dueDate)). Could you confirm it’s scheduled? Happy to resend the PDF. — Northstar Studio"
        return ProposedAction(id: ctx.ids.next(), kind: .invoiceFollowUp, title: "Follow-up draft for \(inv.number)", summary: "Saves a draft to \(inv.client). Nothing is sent.", riskLevel: "low",
                              payload: ["invoiceId": inv.id, "invoiceNumber": inv.number, "client": inv.client, "subject": "\(inv.number) — due \(Dates.short(inv.dueDate))", "body": body])
    }

    public static func classifyProposal(_ ctx: ToolContext, transactionId: String, use: BusinessUse) throws -> ProposedAction {
        guard use != .unknown else { throw ToolError.invalidArguments("businessUse must be business | personal | mixed") }
        guard let t = ctx.snapshot.transactions.first(where: { $0.id == transactionId }) else { throw ToolError.notFound("unknown transaction \"\(transactionId)\"") }
        return ProposedAction(id: ctx.ids.next(), kind: .classifyTransaction, title: "Mark \(t.merchantName) as \(use.rawValue)", summary: "\(Money.format(-t.amountMinor)) on \(Dates.short(t.occurredAt)) · currently \(t.businessUse.rawValue)", riskLevel: "low",
                              payload: ["transactionId": t.id, "field": "businessUse", "oldValue": t.businessUse.rawValue, "newValue": use.rawValue])
    }

    public static func reservePlan(_ ctx: ToolContext) throws -> ProposedAction {
        let s = ctx.snapshot
        let gap = s.workspace.reserveTargetMinor - s.reserveMinor
        guard gap > 0 else { throw ToolError.invalidArguments("reserve already meets target") }
        let date = s.base.points.flatMap(\.events).first { $0.sourceId == "rec:halcyon-labs" }?.date ?? s.base.points.last!.date
        return ProposedAction(id: ctx.ids.next(), kind: .reservePlan, title: "Plan \(Money.format(gap, cents: false)) for tax reserve", summary: "Reminder on \(Dates.short(date)), after the Halcyon retainer lands. FlowFi never moves money.", riskLevel: "medium",
                              payload: ["amountMinor": String(gap), "plannedDate": date, "toAccount": "acc_sav"])
    }

    public static func transactions(_ ctx: ToolContext, query: String?, limit: Int) throws -> [(t: Transaction, text: String?, flagged: Bool)] {
        guard (1...50).contains(limit) else { throw ToolError.invalidArguments("limit must be 1–50") }
        let q = query?.lowercased()
        return ctx.snapshot.transactions
            .filter { q == nil || $0.merchantName.lowercased().contains(q!) || $0.category.lowercased().contains(q!) }
            .prefix(limit)
            .map { t in let s = Sanitizer.sanitize(t.description); return (t, s.text, s.flagged) }
    }
}

// MARK: - Router

public enum Copilot {
    static let intents: [(String, @Sendable (String) -> Bool)] = [
        ("money_movement", { m in
            let words = ["transfer", "wire", "send", "move", "pay"]
            let hasVerb = words.contains { w in m.split(whereSeparator: { !$0.isLetter }).contains { $0 == Substring(w) } }
            return hasVerb && (m.contains("$") || m.contains("money") || m.contains("funds") || m.contains("acct") || m.contains("account") || m.contains("pay the") || m.contains("pay my"))
        }),
        ("injection_probe", { $0.contains("quickprint") || $0.contains("ignore previous") || $0.contains("approve all") || $0.contains("system prompt") }),
        ("what_if", { $0.contains("what if") || $0.contains("scenario") }),
        ("next_step", { m in ["what should i do", "what do i do", "help me", "how do i avoid", "how can i avoid", "how do i fix", "recommend", "next step"].contains { m.contains($0) } }),
        ("why", { m in ["why", "dip", "threshold", "floor", "below", "breach", "driver"].contains { m.contains($0) } }),
        ("score", { $0.contains("score") || $0.contains("health") }),
        ("invoices", { m in ["invoice", "receivable", "late", "lumen", "ferro", "client", "follow"].contains { m.contains($0) } }),
        ("classify", { m in ["classif", "categor", "equipment", "b&h", "camera"].contains { m.contains($0) } }),
        ("subscriptions", { m in ["subscription", "recurring", "adobe", "figma", "bill"].contains { m.contains($0) } }),
        ("spending", { m in ["spend", "expense", "burn", "cost"].contains { m.contains($0) } }),
        ("reserve", { $0.contains("tax") || $0.contains("reserve") }),
        ("cash", { m in ["cash", "balance", "how much", "runway", "money"].contains { m.contains($0) } }),
    ]

    public static func intent(_ message: String) -> String {
        let m = String(message.prefix(500)).lowercased()
        return intents.first { $0.1(m) }?.0 ?? "unsupported"
    }

    final class Run {
        let ctx: ToolContext
        var trace: [TraceStep] = []
        var citations: [Citation] = []
        var calcs: [Calculation] = []
        var actions: [ProposedAction] = []
        var uncertainties: [String] = []
        var guardrails: [String] = []
        init(_ ctx: ToolContext) { self.ctx = ctx }

        /// Single entry point for tool use: every call is traced; failures close.
        func call<T>(_ tool: String, cite: [Citation] = [], _ body: () throws -> T) -> T? {
            guard let access = Tools.catalog[tool] else {
                trace.append(TraceStep(index: trace.count, tool: tool, access: "read", ok: false, summary: "rejected: unknown tool"))
                return nil
            }
            do {
                let out = try body()
                trace.append(TraceStep(index: trace.count, tool: tool, access: access, ok: true, summary: "\(max(cite.count, 1)) source(s)"))
                for c in cite where !citations.contains(c) { citations.append(c) }
                return out
            } catch {
                trace.append(TraceStep(index: trace.count, tool: tool, access: access, ok: false, summary: "\(error)"))
                return nil
            }
        }
        func cite(_ type: String, _ id: String, _ label: String) -> Citation { Citation(type: type, sourceId: id, label: label, asOf: ctx.snapshot.freshness.syncedAt) }
    }

    static func m(_ v: Minor) -> String { "**\(Money.format(v))**" }

    static func lowSentence(_ f: Forecast) -> String {
        if let b = f.breach {
            return "Your \(f.scenario.rawValue) forecast dips to \(m(b.minBalanceMinor)) on **\(Dates.short(b.minDate))** — \(m(b.shortfallMinor)) under your \(Money.format(f.floorMinor, cents: false)) floor."
        }
        return "You stay above your \(Money.format(f.floorMinor, cents: false)) floor for all \(f.horizonDays) days. The low point is \(m(f.minPoint.balanceMinor)) on **\(Dates.short(f.minPoint.date))**."
    }

    static func driversSentence(_ f: Forecast) -> String {
        let top = f.drivers.prefix(3).map { "\($0.name) (\(m($0.impactMinor)))" }
        return top.isEmpty ? "" : "Biggest drivers: \(top.joined(separator: ", "))."
    }

    public static func respond(to message: String, options: SnapshotOptions = SnapshotOptions(), ids: IdSource = IdSource(), runId: String = "run_1") -> AgentResponse {
        let snapshot = Engine.snapshot(options)
        let r = Run(ToolContext(snapshot: snapshot, options: options, ids: ids))
        let intent = intent(message)
        var answer = handle(intent, message: message.lowercased(), r)
        var uncertainties = r.uncertainties
        if snapshot.freshness.stale {
            answer = "⚠︎ Your bank data is **\(snapshot.freshness.ageHours) hours old** — treat these numbers with care until sync recovers. " + answer
            uncertainties.insert("Data last synced \(snapshot.freshness.ageHours)h ago (stale).", at: 0)
        }
        return AgentResponse(runId: runId, intent: intent, answer: answer, citations: r.citations, calculations: r.calcs, proposedActions: r.actions,
                             uncertainties: uncertainties, guardrails: r.guardrails, dataFreshness: snapshot.freshness.syncedAt, trace: r.trace)
    }

    static func handle(_ intent: String, message: String, _ r: Run) -> String {
        let s = r.ctx.snapshot
        let base = s.base
        let fcCite = r.cite("forecast", base.id, "base forecast · \(Forecast.modelVersion)")
        func getForecast() -> Forecast? { r.call("get_forecast", cite: [fcCite]) { try Tools.forecast(r.ctx, scenario: "base") } }
        func getInvoices() -> [Invoice] {
            let open = s.invoices.filter { $0.status != .paid }
            return r.call("get_invoices", cite: open.map { r.cite("invoice", $0.id, "\($0.number) · \($0.client)") }) { open } ?? []
        }
        func scenario(_ a: [Assumption], _ label: String) -> Tools.ScenarioResult? {
            r.call("run_scenario", cite: [r.cite("scenario", label, "What-if: \(label)")]) { try Tools.runScenario(r.ctx, a) }
        }
        func cash() -> Minor? { r.call("get_cash_position", cite: [r.cite("accounts", "acc_chk+acc_sav", "Checking ••4821 + Reserve ••1177")]) { s.availableMinor } }

        switch intent {
        case "money_movement":
            r.guardrails.append("Blocked: FlowFi never moves money. Only proposals inside FlowFi are allowed.")
            let c = cash()
            let plan = r.call("create_budget_draft", cite: [r.cite("account", "acc_sav", "Tax Reserve ••1177")]) { try Tools.reservePlan(r.ctx) }
            if let plan { r.actions.append(plan) }
            return "I can’t move, send, or schedule money — FlowFi is decision support, not a bank. You have \(m(c ?? 0)) across checking and reserve.\(plan != nil ? " I can save a **reserve plan** as a reminder instead; review it below." : "")"

        case "injection_probe":
            let rows = r.call("get_transactions", cite: [r.cite("transaction", "quickprint", "QuickPrint Co")]) { try Tools.transactions(r.ctx, query: "QuickPrint", limit: 3) } ?? []
            r.guardrails.append("Withheld \(rows.filter(\.flagged).count) instruction-like transaction description(s); treated as data, not instructions.")
            return "One transaction memo from **QuickPrint Co** contains text that tries to give me instructions (approve actions, transfer money). Transaction text is untrusted data: it can’t define tools, approve anything, or move money. Nothing was approved."

        case "next_step":
            guard let f = getForecast() else { return "I couldn’t load the forecast, so I won’t guess." }
            let invoices = getInvoices()
            r.calcs.append(Calculation(label: "Projected low (base)", valueMinor: f.minPoint.balanceMinor, source: f.id))
            var parts = [lowSentence(f)]
            if let b = f.breach {
                r.calcs.append(Calculation(label: "Shortfall vs floor", valueMinor: b.shortfallMinor, source: f.id))
                parts.append(driversSentence(f))
            }
            if let late = invoices.first(where: { ($0.expectedDate ?? $0.dueDate) > $0.dueDate }) {
                if let sc = scenario([.invoiceOnDue(invoiceId: late.id)], "\(late.number) paid on due date") {
                    r.calcs.append(Calculation(label: "Low if \(late.number) pays on time", valueMinor: sc.minMinor, source: "run_scenario"))
                    parts.append("If **\(late.number)** arrives on its due date (\(Dates.short(late.dueDate))), the low point becomes \(m(sc.minMinor))\(sc.breach ? " — still under the floor" : ", safely above the floor").")
                }
                if late.followUpDraftId != nil {
                    parts.append("You already approved a follow-up draft for \(late.number).")
                } else if let draft = r.call("create_invoice_followup_draft", cite: [r.cite("invoice", late.id, late.number)], { try Tools.followUpDraft(r.ctx, invoiceId: late.id) }) {
                    r.actions.append(draft)
                    parts.append("Highest-impact move: nudge \(late.client) before the due date. I drafted a follow-up for you to review — **nothing is sent**.")
                }
                r.uncertainties.append("\(late.number) payment date is estimated from \(late.client)’s history (\(Int(((late.confidence ?? 0) * 100).rounded()))% confidence).")
            }
            if f.breach != nil, let contractor = f.points.flatMap(\.events).first(where: { $0.sourceId == "rec:mara-okafor-design" }),
               let sc = scenario([.shiftEvent(eventKey: contractor.key, days: 8)], "Contractor paid 8 days later") {
                r.calcs.append(Calculation(label: "Low if contractor paid 8 days later", valueMinor: sc.minMinor, source: "run_scenario"))
                parts.append("Alternative: asking \(contractor.name) to bill ~a week later keeps you at \(m(sc.minMinor)) minimum.")
            }
            return parts.filter { !$0.isEmpty }.joined(separator: " ")

        case "why":
            guard let f = getForecast() else { return "I couldn’t load the forecast." }
            r.calcs.append(Calculation(label: "Projected low (base)", valueMinor: f.minPoint.balanceMinor, source: f.id))
            for d in f.drivers { r.calcs.append(Calculation(label: d.name, valueMinor: d.impactMinor, source: f.id)) }
            return "\(lowSentence(f)) \(driversSentence(f))"

        case "what_if":
            let events = base.points.flatMap(\.events)
            let numbers = message.split(whereSeparator: { !$0.isNumber && !$0.isLetter }).map(String.init)
            var days = 7
            for (i, w) in numbers.enumerated() where Int(w) != nil && i + 1 < numbers.count {
                if numbers[i + 1].hasPrefix("day") { days = Int(w)! } else if numbers[i + 1].hasPrefix("week") { days = Int(w)! * 7 }
            }
            var parsed: ([Assumption], String)?
            if message.contains("contractor") || message.contains("mara"), let c = events.first(where: { $0.sourceId == "rec:mara-okafor-design" }) {
                parsed = ([.shiftEvent(eventKey: c.key, days: days)], "Contractor paid \(days) days later")
            } else if message.contains("inv") || message.contains("lumen") {
                if message.contains("on time") || message.contains("due date") { parsed = ([.invoiceOnDue(invoiceId: "inv_104")], "INV-104 paid on due date") }
                else { parsed = ([.shiftEvent(eventKey: "inv:inv_104", days: days)], "INV-104 \(days) more days late") }
            } else if message.contains("adobe") || message.contains("cancel"), let a = events.first(where: { $0.sourceId == "rec:adobe-creative-cloud" }) {
                parsed = ([.removeEvent(eventKey: a.key)], "Cancel Adobe Creative Cloud")
            }
            guard let (assumptions, label) = parsed else { return "Tell me what to change — e.g. “what if INV-104 pays on time” or “what if the contractor is paid a week later”." }
            guard let f = getForecast(), let sc = scenario(assumptions, label) else { return "That scenario references something I can’t find in your data, so I didn’t run it." }
            r.calcs.append(Calculation(label: "Low now", valueMinor: f.minPoint.balanceMinor, source: f.id))
            r.calcs.append(Calculation(label: "Low · \(label)", valueMinor: sc.minMinor, source: "run_scenario"))
            r.uncertainties.append("Hypothetical only — not saved to your forecast. Toggle it on the Cash Flow tab to keep it.")
            return "**\(label):** your low point moves from \(m(f.minPoint.balanceMinor)) to \(m(sc.minMinor)) on **\(Dates.short(sc.minDate))**, \(sc.breach ? "still under" : "above") your floor. Day-30 balance: \(m(sc.endMinor))."

        case "score":
            guard let fs = r.call("get_flow_score", cite: [r.cite("flow_score", "fs_\(s.flowScore.score)", "FlowScore \(s.flowScore.score)")], { s.flowScore }) else { return "FlowScore is unavailable." }
            let pos = fs.factors.filter(\.positive).map { "\($0.label) +\($0.points)" }
            let neg = fs.factors.filter { !$0.positive }.map { "\($0.label) −\($0.max - $0.points)" }
            return "FlowScore is **\(fs.score)/100 (\(fs.band))**. Helping: \(pos.joined(separator: ", ")). Costing points: \(neg.joined(separator: ", ")). \(FlowScore.disclaimer)"

        case "invoices":
            let inv = getInvoices()
            for i in inv { r.calcs.append(Calculation(label: "\(i.number) · \(i.client)", valueMinor: i.amountMinor, source: i.id)) }
            let lines = inv.map { i -> String in
                let late = Dates.diffDays(i.expectedDate ?? i.dueDate, i.dueDate)
                return "**\(i.number)** \(i.client) \(m(i.amountMinor)) due \(Dates.short(i.dueDate)), expected \(Dates.short(i.expectedDate ?? i.dueDate))\(late > 0 ? " (\(late) days late, \(Int(((i.confidence ?? 0) * 100).rounded()))% confidence)" : "")"
            }
            if let risky = inv.first(where: { ($0.expectedDate ?? $0.dueDate) > $0.dueDate && $0.followUpDraftId == nil }),
               let d = r.call("create_invoice_followup_draft", cite: [r.cite("invoice", risky.id, risky.number)], { try Tools.followUpDraft(r.ctx, invoiceId: risky.id) }) {
                r.actions.append(d)
            }
            return "\(inv.count) open invoices. \(lines.joined(separator: ". "))."

        case "classify":
            guard let row = (r.call("get_transactions", cite: [r.cite("transaction", "b&h", "B&H Photo")]) { try Tools.transactions(r.ctx, query: "B&H", limit: 1) })?.first else { return "I couldn’t find that transaction." }
            if row.t.businessUse == .business { return "**\(row.t.merchantName)** (\(m(-row.t.amountMinor))) is already classified as business." }
            if let p = r.call("classify_transaction_proposal", cite: [r.cite("transaction", row.t.id, row.t.merchantName)], { try Tools.classifyProposal(r.ctx, transactionId: row.t.id, use: .business) }) { r.actions.append(p) }
            return "**\(row.t.merchantName)** (\(m(-row.t.amountMinor))) is classified as *\(row.t.businessUse.rawValue)*. A camera kit for a design studio is likely a business expense — I’ve proposed the change for you to approve."

        case "subscriptions":
            let out = (r.call("get_recurring_cashflows", cite: [r.cite("recurring", "streams", "\(s.streams.count) recurring streams")]) { s.streams } ?? []).filter { $0.direction == .outflow }
            for st in out.prefix(6) { r.calcs.append(Calculation(label: st.merchant, valueMinor: -st.expectedAmountMinor, source: st.key)) }
            let up = out.filter { $0.expectedAmountMinor > $0.previousAmountMinor }
            return "\(out.count) recurring costs detected. " + up.map { "**\($0.merchant)** rose from \(m($0.previousAmountMinor)) to \(m($0.expectedAmountMinor))/mo." }.joined(separator: " ")

        case "spending":
            guard let sp = r.call("detect_spending_change", cite: [r.cite("spending", "spend_30d", "Last 30 vs prior 30 days")], { s.spending }) else { return "Spending data unavailable." }
            r.calcs.append(Calculation(label: "Last 30 days", valueMinor: sp.currentMinor, source: "spend_30d"))
            r.calcs.append(Calculation(label: "Prior 30 days", valueMinor: sp.previousMinor, source: "spend_30d"))
            let top = sp.byCategory.first
            return "Discretionary spend is \(m(sp.currentMinor)) over the last 30 days vs \(m(sp.previousMinor)) before (\(sp.changePct > 0 ? "+" : "")\(sp.changePct)%). " + (top.map { "Most of the jump is **\($0.category)** (+\(Money.format($0.deltaMinor))), led by \(sp.largest.first?.merchant ?? "")." } ?? "")

        case "reserve":
            _ = cash()
            let plan = r.call("create_budget_draft", cite: [r.cite("account", "acc_sav", "Tax Reserve ••1177")]) { try Tools.reservePlan(r.ctx) }
            if let plan { r.actions.append(plan) }
            r.uncertainties.append("Reserve target is your configured preference, not tax advice.")
            return "Your tax reserve holds \(m(s.reserveMinor)) against a \(Money.format(s.workspace.reserveTargetMinor, cents: false)) target.\(plan != nil ? " I proposed a reserve plan timed after your next retainer — a reminder, not a transfer." : "")"

        case "cash":
            guard let c = cash(), let f = getForecast() else { return "Cash data unavailable." }
            r.calcs.append(Calculation(label: "Cash today", valueMinor: c, source: "accounts"))
            r.calcs.append(Calculation(label: "Day 30 (base)", valueMinor: f.endBalanceMinor, source: f.id))
            let accts = s.accounts.filter { $0.type == .depository }.map { "\($0.name) \(Money.format($0.balanceMinor))" }.joined(separator: ", ")
            return "You have \(m(c)) today (\(accts)). \(lowSentence(f))"

        default:
            r.guardrails.append("Out of scope: answered without financial claims.")
            return "I only answer from your FlowFi data — cash, forecast, invoices, spending, recurring costs, and FlowScore. Try “What should I do?” or “Why does my balance dip?”"
        }
    }
}

// MARK: - Approval boundary

public struct AuditEvent: Sendable, Codable, Identifiable, Equatable {
    public let id: String
    public let at: String
    public let actor: String
    public let action: String
    public let entity: String
    public let metadata: [String: String]
    public init(id: String, at: String, actor: String, action: String, entity: String, metadata: [String: String] = [:]) {
        self.id = id; self.at = at; self.actor = actor; self.action = action; self.entity = entity; self.metadata = metadata
    }
}

public enum ApprovalMethod: String, Sendable, Codable { case holdToConfirm = "hold_to_confirm", biometric }

public enum ActionEffect: Sendable, Equatable {
    case followUp(invoiceId: String, draftId: String, subject: String, body: String)
    case override(transactionId: String, newValue: BusinessUse)
    case reservePlan(amountMinor: Minor, plannedDate: ISODate)
}

public struct ApprovalError: Error, Equatable, Sendable { public let reason: String }

public enum Approvals {
    /// The only path from a proposal to an application write.
    public static func execute(_ action: ProposedAction, approval: ApprovalMethod?, at: String, ids: IdSource) -> Result<(ActionEffect, [AuditEvent]), ApprovalError> {
        guard approval != nil else { return .failure(ApprovalError(reason: "explicit approval required")) }
        guard action.status == .proposed else { return .failure(ApprovalError(reason: "action is not in proposed state")) }
        let p = action.payload
        let effect: ActionEffect
        switch action.kind {
        case .invoiceFollowUp:
            guard let inv = p["invoiceId"], let subject = p["subject"], let body = p["body"], !body.isEmpty else { return .failure(ApprovalError(reason: "follow-up payload requires invoiceId, subject, body")) }
            effect = .followUp(invoiceId: inv, draftId: "draft_\(action.id)", subject: subject, body: body)
        case .classifyTransaction:
            guard let t = p["transactionId"], p["field"] == "businessUse", let v = p["newValue"].flatMap(BusinessUse.init(rawValue:)), v != .unknown else { return .failure(ApprovalError(reason: "classification payload invalid")) }
            effect = .override(transactionId: t, newValue: v)
        case .reservePlan:
            guard let a = p["amountMinor"].flatMap(Int.init), a > 0, let d = p["plannedDate"], d.count == 10 else { return .failure(ApprovalError(reason: "reserve plan payload invalid")) }
            effect = .reservePlan(amountMinor: a, plannedDate: d)
        }
        return .success((effect, [
            AuditEvent(id: ids.next(), at: at, actor: "user", action: "action.approved", entity: action.id, metadata: ["type": action.kind.rawValue, "method": approval!.rawValue]),
            AuditEvent(id: ids.next(), at: at, actor: "system", action: "action.executed", entity: action.id, metadata: ["type": action.kind.rawValue, "sent": "false"]),
        ]))
    }
}
