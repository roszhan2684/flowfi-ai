import FlowFiCore
import SwiftUI

struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmReset = false

    var body: some View {
        let s = model.snapshot
        ScrollView {
            VStack(spacing: 12) {
                ScreenHeader(title: "More", subtitle: "Northstar Studio · freelancer workspace").padding(.horizontal, -16)
                VStack(spacing: 0) {
                    row("Alerts", "Risk signals with evidence", "bell", badge: "\(s.alerts.count)", tone: .risk) { model.go(.more, page: .alerts) }
                    row("FlowScore", "Explainable health indicator", "gauge.with.dots.needle.67percent", badge: "\(s.flowScore.score)") { model.go(.more, page: .score) }
                    row("Invoices", "Receivables & follow-ups", "doc.text") { model.go(.more, page: .invoices) }
                    row("Audit trail", "Every approval and change", "list.bullet.rectangle", badge: model.audit.isEmpty ? nil : "\(model.audit.count)") { model.go(.more, page: .audit) }
                    row("Sync health & fault lab", "Integration status, failure drills", "waveform.path.ecg", badge: s.freshness.stale ? "Stale" : nil, tone: .risk) { model.go(.more, page: .sync) }
                    row("Settings & security", "Appearance, Face ID, Keychain", "lock.shield", last: true) { model.go(.more, page: .settings) }
                }
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

                Button { model.startTour() } label: { Label("Replay guided tour", systemImage: "sparkles") }.buttonStyle(PrimaryButtonStyle())

                Card {
                    Eyebrow("About this demo")
                    VStack(alignment: .leading, spacing: 6) {
                        Text("• Northstar Studio is fictional; all data is a deterministic fixture.")
                        Text("• Forecasts, scores and alerts are computed on-device by FlowFiCore (Swift) — the same engine as the web demo, verified by parity tests.")
                        Text("• The copilot is a deterministic router over real typed tools. No LLM, no network.")
                        Text("• FlowFi never moves money. Approvals only save records inside FlowFi.")
                    }.font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 8)
                }

                Button(confirmReset ? "Tap again to erase demo state" : "Reset demo") {
                    if confirmReset { model.reset(); confirmReset = false } else { confirmReset = true }
                }
                .buttonStyle(PrimaryButtonStyle(fill: confirmReset ? Palette.neg : Palette.card, text: confirmReset ? .white : Palette.neg))
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
    }

    private func row(_ title: String, _ sub: String, _ icon: String, badge: String? = nil, tone: PillTone = .neutral, last: Bool = false, _ action: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: 12) {
                    Image(systemName: icon).frame(width: 22).foregroundStyle(Palette.ink)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(.system(size: 15, weight: .medium)).foregroundStyle(Palette.ink)
                        Text(sub).font(.system(size: 12)).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    if let badge { Pill(badge, tone: tone) }
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(.horizontal, 16).padding(.vertical, 13).contentShape(Rectangle())
            }.buttonStyle(.plain)
            if !last { Divider().overlay(Palette.line).padding(.leading, 50) }
        }
    }
}

struct AlertsView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ScreenHeader(title: "Alerts", subtitle: "Deterministic rules over your data", back: { model.go(.more) }).padding(.horizontal, -16)
                ForEach(Array(model.snapshot.alerts.enumerated()), id: \.element.id) { i, a in
                    Card {
                        HStack {
                            Pill(a.severity.rawValue.capitalized, tone: a.severity == .high ? .neg : a.severity == .medium ? .risk : .neutral)
                            Text(a.kind.rawValue).font(.system(size: 11)).foregroundStyle(Palette.muted)
                        }
                        Text(a.title).font(.system(size: 16, weight: .semibold)).padding(.top, 8)
                        Text(a.detail).font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 2)
                        HStack {
                            Text("evidence: \(a.evidenceLabel)").font(.mono(10)).foregroundStyle(Palette.faint).lineLimit(1)
                            Spacer()
                            Button(a.recommendedAction) { act(a) }.font(.system(size: 12, weight: .semibold))
                                .padding(.horizontal, 12).padding(.vertical, 7).background(Palette.ink, in: Capsule()).foregroundStyle(Palette.bg)
                        }.padding(.top, 10)
                    }
                    .stagger(i, true)
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
    }

    private func act(_ a: FlowFiCore.Alert) {
        switch a.kind {
        case .cashThreshold: model.open(.why)
        case .invoiceRisk: model.ask("Show my invoices")
        case .unusualSpending: model.open(.transaction(a.evidenceId))
        case .subscriptionIncrease: model.ask("Any subscription changes?")
        case .taxReserveGap: model.ask("How is my tax reserve?")
        case .syncStale: model.go(.more, page: .sync)
        }
    }
}

struct ScoreView: View {
    @Environment(AppModel.self) private var model
    @State private var shown = false
    var body: some View {
        let fs = model.snapshot.flowScore
        ScrollView {
            VStack(spacing: 12) {
                ScreenHeader(title: "FlowScore", subtitle: "Sum of six visible factors", back: { model.go(.more) }).padding(.horizontal, -16)
                Card {
                    VStack(spacing: 4) {
                        ZStack {
                            Circle().trim(from: 0, to: 0.5).stroke(Palette.line, style: StrokeStyle(lineWidth: 12, lineCap: .round)).rotationEffect(.degrees(180))
                            Circle().trim(from: 0, to: shown ? Double(fs.score) / 200 : 0).stroke(fs.score >= 60 ? Palette.accent : Palette.risk, style: StrokeStyle(lineWidth: 12, lineCap: .round)).rotationEffect(.degrees(180))
                            Text("\(fs.score)").font(.display(54)).monospacedDigit().contentTransition(.numericText(value: Double(fs.score))).offset(y: -18)
                        }
                        .frame(width: 200, height: 200).padding(.bottom, -80)
                        Text(fs.band).font(.system(size: 14, weight: .semibold)).foregroundStyle(fs.score >= 60 ? Palette.accent : Palette.risk)
                        Text(FlowScore.disclaimer).font(.system(size: 11)).foregroundStyle(Palette.faint).multilineTextAlignment(.center)
                    }.frame(maxWidth: .infinity)
                }
                Card {
                    ForEach(Array(fs.factors.enumerated()), id: \.element.id) { i, f in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack { Text(f.label).font(.system(size: 14, weight: .medium)); Spacer(); Text("\(f.points)").fontWeight(.semibold).monospacedDigit() + Text(" / \(f.max)").foregroundColor(Palette.faint) }
                                .font(.system(size: 13))
                            GeometryReader { g in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Palette.line)
                                    Capsule().fill(f.positive ? Palette.accent : Palette.risk).frame(width: shown ? g.size.width * Double(f.points) / Double(f.max) : 0)
                                        .animation(.ease.delay(Double(i) * 0.06), value: shown)
                                }
                            }.frame(height: 6)
                            HStack { Text(f.detail); Spacer(); Text(f.value) }.font(.system(size: 11)).foregroundStyle(Palette.muted)
                        }.padding(.vertical, 7)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
        .onAppear { withAnimation(.ease.delay(0.15)) { shown = true } }
    }
}

struct InvoicesView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ScreenHeader(title: "Invoices", subtitle: "Expected dates use each client’s payment history", back: { model.go(.more) }).padding(.horizontal, -16)
                ForEach(model.snapshot.invoices.reversed()) { inv in
                    Button { model.open(.invoice(inv.id)) } label: {
                        Card {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(inv.number).font(.system(size: 15, weight: .semibold)) + Text(" · \(inv.client)").foregroundColor(Palette.muted)
                                    Text("Due \(Dates.short(inv.dueDate))" + (inv.status == .paid ? " · paid \(Dates.short(inv.paidAt!))" : " · expected \(Dates.short(inv.expectedDate!))")).font(.system(size: 12)).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                Text(Money.format(inv.amountMinor, cents: false)).font(.system(size: 15, weight: .semibold)).monospacedDigit()
                            }
                            HStack(spacing: 6) {
                                if inv.status == .paid { Pill("Paid") } else if (inv.expectedDate ?? "") > inv.dueDate { Pill("Likely late", tone: .risk) } else { Pill("On track", tone: .accent) }
                                if let c = inv.confidence { Pill("\(Int((c * 100).rounded()))% confidence") }
                                if inv.followUpDraftId != nil { Pill("✓ Follow-up drafted", tone: .ink) }
                            }.padding(.top, 10)
                        }
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
    }
}

struct AuditView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ScreenHeader(title: "Audit trail", subtitle: "Append-only · newest first", back: { model.go(.more) }).padding(.horizontal, -16)
                    Group {
                        if model.audit.isEmpty {
                            Card {
                                Text("No activity yet").font(.system(size: 15, weight: .semibold))
                                Text("Ask the copilot, approve a proposal or toggle a scenario — it lands here.").font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 2)
                                Button("Ask “What should I do?”") { model.ask("What should I do?") }.buttonStyle(PrimaryButtonStyle()).padding(.top, 12)
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(model.audit) { e in
                                    HStack(alignment: .top, spacing: 12) {
                                        Circle().fill(e.actor == "user" ? Palette.ink : e.actor == "copilot" ? Palette.accent : Palette.faint).frame(width: 9, height: 9).padding(.top, 4)
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack { Text(e.action).font(.mono(12)).fontWeight(.medium); Spacer(); Text(time(e.at)).font(.system(size: 10)).foregroundStyle(Palette.faint) }
                                            Text(([e.actor, e.entity] + e.metadata.sorted { $0.key < $1.key }.prefix(3).map { "\($0.key): \($0.value)" }).joined(separator: " · "))
                                                .font(.system(size: 11)).foregroundStyle(Palette.muted).lineLimit(2)
                                        }
                                    }
                                    .padding(.vertical, 8)
                                    .transition(.move(edge: .top).combined(with: .opacity))
                                }
                            }
                        }
                    }
                    .tourTarget(.audit)
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .scrollsToTour(proxy, model: model)
        }
        .onAppear { model.completeTour("audit") }
    }

    private func time(_ iso: String) -> String {
        guard let d = ISO8601DateFormatter().date(from: iso) else { return "" }
        return d.formatted(date: .omitted, time: .standard)
    }
}

struct SyncView: View {
    @Environment(AppModel.self) private var model
    @State private var results: [FaultResult] = []
    @State private var running = false
    @State private var ms = 0

    var body: some View {
        let s = model.snapshot
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    ScreenHeader(title: "Sync health", subtitle: "Integration status & failure drills", back: { model.go(.more) }).padding(.horizontal, -16)
                    Card {
                        HStack {
                            VStack(alignment: .leading) { Text("Demo provider").font(.system(size: 15, weight: .semibold)); Text("item_demo · fixture").font(.mono(11)).foregroundStyle(Palette.muted) }
                            Spacer()
                            Pill(s.freshness.stale ? "Degraded · stale" : "Healthy", tone: s.freshness.stale ? .risk : .accent)
                        }
                        HStack(spacing: 8) {
                            stat("Last sync", s.freshness.stale ? "Oct 10 · 52h ago" : "Oct 12 · 8:42 AM")
                            stat("Transactions", "\(s.transactions.count)")
                        }.padding(.top, 12)
                        Divider().overlay(Palette.line).padding(.vertical, 12)
                        Toggle(isOn: Binding(get: { model.simulateStale }, set: { model.setStale($0) })) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Simulate stale data").font(.system(size: 14, weight: .medium))
                                Text("Copilot must disclose it before advising").font(.system(size: 11)).foregroundStyle(Palette.muted)
                            }
                        }.tint(Palette.accent)
                    }

                    Card {
                        HStack {
                            VStack(alignment: .leading) { Text("Fault lab").font(.system(size: 15, weight: .semibold)); Text("Real Swift ingestion engine (actors) · scripted provider").font(.system(size: 11)).foregroundStyle(Palette.muted) }
                            Spacer()
                            Button(running ? "Running…" : results.isEmpty ? "Run" : "Run again") { Task { await run() } }
                                .font(.system(size: 13, weight: .semibold)).padding(.horizontal, 14).padding(.vertical, 8)
                                .background(Palette.ink, in: Capsule()).foregroundStyle(Palette.bg).disabled(running)
                        }
                        if results.isEmpty {
                            Text("Duplicate webhooks, 429s, 5xx outages, worker crashes, malformed rows, expired items.").font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 10)
                        }
                        ForEach(Array(results.enumerated()), id: \.element.id) { i, r in
                            VStack(alignment: .leading, spacing: 3) {
                                HStack { Text(r.title).font(.system(size: 13, weight: .medium)); Spacer(); Pill(r.pass ? "✓ Pass" : "Fail", tone: r.pass ? .accent : .neg) }
                                Text(r.observed).font(.mono(10.5)).foregroundStyle(Palette.muted)
                            }
                            .padding(10).background(Palette.bg, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 8)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .animation(.ease.delay(Double(i) * 0.06), value: results.count)
                        }
                        if !results.isEmpty {
                            Text("\(results.filter(\.pass).count)/\(results.count) passed in \(ms) ms on this device.").font(.system(size: 11)).foregroundStyle(Palette.faint).padding(.top, 8)
                        }
                    }
                    .tourTarget(.faults)

                    Card {
                        Eyebrow("Roadmap, not in this demo")
                        Text("Plaid Sandbox link + webhooks (the engine above is provider-agnostic) and Postgres persistence.").font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 6)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .scrollsToTour(proxy, model: model)
        }
    }

    private func stat(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(k).font(.system(size: 11)).foregroundStyle(Palette.muted); Text(v).font(.system(size: 13, weight: .medium)).monospacedDigit() }
            .frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Palette.bg, in: RoundedRectangle(cornerRadius: 12))
    }

    private func run() async {
        running = true
        let start = ContinuousClock.now
        let r = await FaultLab.run()
        ms = Int((ContinuousClock.now - start).components.attoseconds / 1_000_000_000_000_000) + Int((ContinuousClock.now - start).components.seconds) * 1000
        withAnimation(.ease) { results = r }
        model.recordFaultLab(passed: r.filter(\.pass).count, total: r.count)
        running = false
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var lockOn = false
    @State private var message: String?

    var body: some View {
        @Bindable var model = model
        let bio = model.vault.biometricAvailability()
        ScrollView {
            VStack(spacing: 12) {
                ScreenHeader(title: "Settings", subtitle: "Appearance & native security", back: { model.go(.more) }).padding(.horizontal, -16)
                Card {
                    Eyebrow("Appearance")
                    Picker("Appearance", selection: $model.appearance) {
                        ForEach(Appearance.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.segmented).padding(.top, 10)
                }
                Card {
                    Eyebrow("FlowFiSecureVault")
                    Toggle(isOn: Binding(get: { lockOn }, set: { v in Task { await setLock(v) } })) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("App lock").font(.system(size: 14, weight: .medium))
                            Text("Re-locks when FlowFi leaves the foreground · \(bio.rawValue)").font(.system(size: 11)).foregroundStyle(Palette.muted)
                        }
                    }.tint(Palette.accent).padding(.top, 8)
                    Divider().overlay(Palette.line).padding(.vertical, 8)
                    Toggle(isOn: $model.biometricForMediumRisk) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Confirm medium-risk approvals").font(.system(size: 14, weight: .medium))
                            Text("Hold + device authentication; fails closed").font(.system(size: 11)).foregroundStyle(Palette.muted)
                        }
                    }.tint(Palette.accent)
                    if let message { Text(message).font(.system(size: 12)).foregroundStyle(Palette.neg).padding(.top, 8) }
                }
                Card {
                    Eyebrow("Security boundary")
                    VStack(alignment: .leading, spacing: 6) {
                        row("Keychain install secret", model.vault.hasInstallSecret ? "Present · this device only" : "Missing")
                        row("Biometry", bio.rawValue)
                        row("Provider access tokens on device", "Never")
                        row("Secure Enclave keys", "Not used")
                    }.padding(.top, 8)
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 24)
        }
        .onAppear { lockOn = model.vault.appLockEnabled }
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(Palette.muted); Spacer(); Text(v).fontWeight(.medium) }.font(.system(size: 12))
    }

    private func setLock(_ on: Bool) async {
        message = nil
        if on {
            // Enabling the lock requires proving you can unlock (fail closed).
            guard await model.vault.authenticate(reason: "Turn on FlowFi app lock") else {
                message = "Couldn’t authenticate — app lock stays off."
                lockOn = false
                return
            }
        }
        model.vault.appLockEnabled = on
        lockOn = on
    }
}
