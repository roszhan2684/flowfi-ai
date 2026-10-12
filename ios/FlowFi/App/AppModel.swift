import FlowFiCore
import Observation
import SwiftUI

enum Tab: String, CaseIterable, Identifiable {
    case home, cash, activity, copilot, more
    var id: String { rawValue }
    var title: String { ["home": "Home", "cash": "Cash Flow", "activity": "Activity", "copilot": "Copilot", "more": "More"][rawValue]! }
    var icon: String { ["home": "house", "cash": "chart.line.uptrend.xyaxis", "activity": "arrow.left.arrow.right", "copilot": "sparkles", "more": "ellipsis"][rawValue]! }
}

enum MorePage: String { case alerts, score, invoices, audit, sync, settings }

enum Sheet: Identifiable, Equatable {
    case why
    case transaction(String)
    case action(messageId: String, action: ProposedAction)
    case invoice(String)
    var id: String {
        switch self {
        case .why: "why"
        case let .transaction(id): "tx:\(id)"
        case let .action(m, a): "act:\(m):\(a.id)"
        case let .invoice(id): "inv:\(id)"
        }
    }
}

struct Preset: Identifiable {
    let id: String, label: String, detail: String, assumption: Assumption
    static let all = [
        Preset(id: "inv104_on_time", label: "INV-104 paid on time", detail: "Lumen Health pays Oct 20", assumption: .invoiceOnDue(invoiceId: "inv_104")),
        Preset(id: "contractor_late", label: "Contractor paid later", detail: "Mara Okafor billed Oct 31", assumption: .shiftEvent(eventKey: "rec:mara-okafor-design#0", days: 8)),
        Preset(id: "drop_adobe", label: "Cancel Adobe CC", detail: "Remove the $89.99 charge", assumption: .removeEvent(eventKey: "rec:adobe-creative-cloud#0")),
    ]
}

struct ChatMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable { case user, assistant, error }
    let id: String
    let role: Role
    var text: String = ""
    var response: AgentResponse? = nil
}

struct FollowUpDraft: Codable, Equatable, Identifiable { let id: String; let invoiceId: String; let subject: String; let body: String }

/// Everything the user did, persisted. Financial numbers are never stored —
/// they are recomputed by FlowFiCore from this intent.
private struct Persisted: Codable {
    var enabledPresets: [String] = []
    var overrides: [TransactionOverride] = []
    var followUps: [String: String] = [:]
    var drafts: [FollowUpDraft] = []
    var reservePlans: [String] = []
    var simulateStale = false
    var audit: [AuditEvent] = []
    var chat: [ChatMessage] = []
    var tourCompleted: [String] = []
    var tourAutoStarted = false
    var appearance: Appearance = .system
    var biometricForMediumRisk = true
    var seq = 0
}

@MainActor @Observable
final class AppModel {
    // Navigation
    var tab: Tab = .home
    var page: MorePage?
    var sheet: Sheet?
    var keyboardVisible = false
    var pendingQuestion: String?

    // Tour
    var tourStep: Int?

    // Derived
    private(set) var snapshot: Snapshot
    var scenario: Scenario = .base

    private var state = Persisted()
    private let defaultsKey = "flowfi.state.v1"
    let vault = FlowFiSecureVault()
    var locked = false

    init() {
        snapshot = Engine.snapshot()
        if let data = UserDefaults.standard.data(forKey: defaultsKey), let saved = try? JSONDecoder().decode(Persisted.self, from: data) {
            state = saved
        }
        locked = vault.appLockEnabled
        refresh()
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-resetDemo") { reset() }
        if !state.tourAutoStarted { state.tourAutoStarted = true; tourStep = 0; save() }
        // Launch arguments for demos and screenshots: -appearance dark|light, -tourStep N.
        if let i = args.firstIndex(of: "-appearance"), i + 1 < args.count, let a = Appearance(rawValue: args[i + 1]) { state.appearance = a }
        if let i = args.firstIndex(of: "-tourStep"), i + 1 < args.count, let n = Int(args[i + 1]) {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                self.setTourStep(n)
            }
        }
    }

    // MARK: State accessors
    var enabledPresets: [String] { state.enabledPresets }
    var chat: [ChatMessage] { state.chat }
    var audit: [AuditEvent] { state.audit }
    var drafts: [FollowUpDraft] { state.drafts }
    var simulateStale: Bool { state.simulateStale }
    var tourCompleted: Set<String> { Set(state.tourCompleted) }
    var appearance: Appearance {
        get { state.appearance }
        set { state.appearance = newValue; save() }
    }
    var biometricForMediumRisk: Bool {
        get { state.biometricForMediumRisk }
        set { state.biometricForMediumRisk = newValue; save() }
    }

    var options: SnapshotOptions {
        SnapshotOptions(assumptions: Preset.all.filter { state.enabledPresets.contains($0.id) }.map(\.assumption),
                        overrides: state.overrides, followUps: state.followUps, simulateStale: state.simulateStale)
    }
    var forecast: Forecast { snapshot.forecasts[scenario]! }

    private func refresh() { snapshot = Engine.snapshot(options) }
    private func save() { if let d = try? JSONEncoder().encode(state) { UserDefaults.standard.set(d, forKey: defaultsKey) } }
    private func nextId(_ p: String) -> String { state.seq += 1; return "\(p)_\(state.seq)" }
    private var now: String { ISO8601DateFormatter().string(from: Date()) }

    private func audit(_ action: String, actor: String = "user", entity: String, _ meta: [String: String] = [:]) {
        state.audit.insert(AuditEvent(id: nextId("aud"), at: now, actor: actor, action: action, entity: entity, metadata: meta), at: 0)
    }

    // MARK: Navigation
    func go(_ tab: Tab, page: MorePage? = nil) {
        withAnimation(.ease) {
            self.tab = tab
            self.page = page
            sheet = nil
        }
    }
    func open(_ s: Sheet?) { withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) { sheet = s } }
    func ask(_ q: String) { pendingQuestion = q; go(.copilot) }

    // MARK: Intent
    func togglePreset(_ id: String) {
        let on = !state.enabledPresets.contains(id)
        if on { state.enabledPresets.append(id) } else { state.enabledPresets.removeAll { $0 == id } }
        audit(on ? "scenario.assumption_enabled" : "scenario.assumption_disabled", entity: id)
        if id == "inv104_on_time" { completeTour("presets") }
        withAnimation(.smooth) { refresh() }
        save()
    }

    func setStale(_ v: Bool) {
        state.simulateStale = v
        audit(v ? "sync.simulated_stale" : "sync.recovered", actor: "system", entity: "item_demo")
        withAnimation { refresh() }
        save()
    }

    func overrideUse(_ t: FlowFiCore.Transaction, _ use: BusinessUse) {
        state.overrides.removeAll { $0.transactionId == t.id }
        state.overrides.append(TransactionOverride(transactionId: t.id, newValue: use))
        audit("transaction.classification_overridden", entity: t.id, ["oldValue": t.businessUse.rawValue, "newValue": use.rawValue])
        refresh()
        save()
    }

    func send(_ question: String) async {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        state.chat.append(ChatMessage(id: nextId("msg"), role: .user, text: q))
        save()
        try? await Task.sleep(for: .milliseconds(350)) // a beat for "choosing tools"
        let ids = IdSource(prefix: "act_\(state.seq)")
        let r = Copilot.respond(to: q, options: options, ids: ids, runId: nextId("run"))
        state.chat.append(ChatMessage(id: nextId("msg"), role: .assistant, response: r))
        audit("ai.run.completed", actor: "copilot", entity: r.runId, ["intent": r.intent, "tools": String(r.trace.count)])
        for a in r.proposedActions { audit("ai.proposed_action", actor: "copilot", entity: a.id, ["type": a.kind.rawValue, "title": a.title]) }
        if r.intent == "next_step" { completeTour("answer") }
        save()
    }

    /// Approval boundary. Medium-risk actions also require device authentication (fail closed).
    func approve(messageId: String, action: ProposedAction) async -> String? {
        var method: ApprovalMethod = .holdToConfirm
        if action.riskLevel == "medium" && biometricForMediumRisk {
            let ok = await vault.authenticate(reason: "Approve “\(action.title)”")
            audit(ok ? "mobile.secure_vault.auth.success" : "mobile.secure_vault.auth.failure", actor: "system", entity: action.id)
            guard ok else { save(); return "Authentication failed — nothing was approved." }
            method = .biometric
        }
        switch Approvals.execute(action, approval: method, at: now, ids: IdSource(prefix: "aud_\(state.seq)")) {
        case let .failure(e):
            audit("action.failed", actor: "system", entity: action.id, ["reason": e.reason])
            save()
            return e.reason
        case let .success((effect, events)):
            state.seq += 2
            state.audit.insert(contentsOf: events.reversed(), at: 0)
            switch effect {
            case let .followUp(invoiceId, draftId, subject, body):
                state.followUps[invoiceId] = draftId
                state.drafts.insert(FollowUpDraft(id: draftId, invoiceId: invoiceId, subject: subject, body: body), at: 0)
            case let .override(tid, use):
                state.overrides.removeAll { $0.transactionId == tid }
                state.overrides.append(TransactionOverride(transactionId: tid, newValue: use))
            case let .reservePlan(amount, date):
                state.reservePlans.append("\(amount)@\(date)")
            }
            setStatus(messageId: messageId, actionId: action.id, .approved)
            completeTour("hold")
            refresh()
            save()
            return nil
        }
    }

    func reject(messageId: String, action: ProposedAction) {
        audit("action.rejected", entity: action.id, ["type": action.kind.rawValue])
        setStatus(messageId: messageId, actionId: action.id, .rejected)
        save()
    }

    private func setStatus(messageId: String, actionId: String, _ s: ProposedAction.Status) {
        guard let i = state.chat.firstIndex(where: { $0.id == messageId }), var r = state.chat[i].response,
              let j = r.proposedActions.firstIndex(where: { $0.id == actionId }) else { return }
        r.proposedActions[j].status = s
        state.chat[i].response = r
    }

    func recordFaultLab(passed: Int, total: Int) {
        audit("faultlab.completed", actor: "system", entity: "item_demo", ["passed": "\(passed)/\(total)"])
        completeTour("faults")
        save()
    }

    func completeTour(_ ids: String...) {
        for id in ids where !state.tourCompleted.contains(id) { state.tourCompleted.append(id) }
        save()
    }

    func reset() {
        let keep = (state.appearance, state.biometricForMediumRisk)
        state = Persisted()
        state.tourAutoStarted = true
        (state.appearance, state.biometricForMediumRisk) = keep
        scenario = .base
        tourStep = nil
        go(.home)
        refresh()
        save()
    }

    // MARK: Tour
    var pendingProposal: (messageId: String, action: ProposedAction)? {
        for m in state.chat.reversed() {
            if let a = m.response?.proposedActions.first(where: { $0.status == .proposed }) { return (m.id, a) }
        }
        return nil
    }

    func startTour(at i: Int = 0) { setTourStep(i) }

    func setTourStep(_ i: Int?) {
        guard let i, TourStep.all.indices.contains(i) else { withAnimation(.ease) { tourStep = nil }; return }
        withAnimation(.ease) { tourStep = i }
        switch TourStep.all[i].target {
        case .cash, .why: go(.home)
        case .drivers: go(.home); open(.why)
        case .answer:
            if state.chat.contains(where: { $0.response?.intent == "next_step" }) { go(.copilot) } else { ask("What should I do?") }
        case .evidence: go(.copilot)
        case .hold:
            go(.copilot)
            if let p = pendingProposal { open(.action(messageId: p.messageId, action: p.action)) }
        case .presets: go(.cash)
        case .audit: go(.more, page: .audit)
        case .faults: go(.more, page: .sync)
        }
    }

    func tourAdvance(_ delta: Int) {
        guard let i = tourStep else { return }
        if delta > 0 { completeTour(TourStep.all[i].target.rawValue) }
        let n = i + delta
        if n < 0 { return }
        setTourStep(n < TourStep.all.count ? n : nil)
    }
}
