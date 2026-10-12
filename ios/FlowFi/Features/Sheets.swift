import FlowFiCore
import SwiftUI

struct SheetContent: View {
    let sheet: Sheet
    var body: some View {
        switch sheet {
        case .why: WhySheet()
        case let .transaction(id): TransactionSheet(id: id)
        case let .action(m, a): ActionSheet(messageId: m, action: a)
        case let .invoice(id): InvoiceSheet(id: id)
        }
    }
}

struct WhySheet: View {
    @Environment(AppModel.self) private var model
    @State private var shown = false
    var body: some View {
        let f = model.snapshot.base
        let maxImpact = Double(f.drivers.map { abs($0.impactMinor) }.max() ?? 1)
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("Why \(Dates.short(f.minPoint.date)) is the low point")
            Text(Money.format(f.minPoint.balanceMinor)).font(.display(30)).monospacedDigit().padding(.top, 4)
            Text("Starting from \(Money.format(f.startBalanceMinor)) today. Dominant drivers between now and then:").font(.system(size: 12)).foregroundStyle(Palette.muted)
            VStack(spacing: 14) {
                ForEach(Array(f.drivers.enumerated()), id: \.element.id) { i, d in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(d.name).font(.system(size: 13, weight: .medium))
                                if d.type == "invoice_delay" { Pill("Delayed receivable", tone: .risk) }
                            }
                            Spacer()
                            Text(Money.format(d.impactMinor)).font(.system(size: 13)).monospacedDigit().foregroundStyle(Palette.muted)
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Palette.line)
                                Capsule().fill(i < 2 ? Palette.risk : Palette.ink.opacity(0.6))
                                    .frame(width: shown ? g.size.width * Double(abs(d.impactMinor)) / maxImpact : 0)
                                    .animation(.ease.delay(0.15 + Double(i) * 0.1), value: shown)
                            }
                        }.frame(height: 8)
                    }
                }
            }
            .padding(10)
            .tourTarget(.drivers)
            .padding(.top, 12)
            Text("A delayed receivable counts as a driver because it was due before the low point but is expected after it.")
                .font(.system(size: 12)).foregroundStyle(Palette.muted).padding(12)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).padding(.top, 10)
            Button("Ask FlowFi what to do") { model.ask("What should I do?") }.buttonStyle(PrimaryButtonStyle()).padding(.top, 14)
        }
        .onAppear { shown = true; model.completeTour("why", "drivers") }
    }
}

struct TransactionSheet: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var raw = false
    var body: some View {
        if let t = model.snapshot.transactions.first(where: { $0.id == id }) {
            let acct = model.snapshot.accounts.first { $0.id == t.accountId }
            let memo = Sanitizer.sanitize(t.description)
            VStack(alignment: .leading, spacing: 0) {
                HStack { Pill(t.pending ? "Pending" : "Posted", tone: t.pending ? .neutral : .accent); Text(t.category).font(.system(size: 11)).foregroundStyle(Palette.muted) }
                Text(Money.format(t.amountMinor, sign: true)).font(.display(34)).monospacedDigit().foregroundStyle(t.amountMinor > 0 ? Palette.accent : Palette.ink).padding(.top, 6)
                Text(t.merchantName).font(.system(size: 16, weight: .medium))
                Text("\(Dates.short(t.occurredAt)) · \(acct?.name ?? "") ••\(acct?.mask ?? "")").font(.system(size: 12)).foregroundStyle(Palette.muted)
                if t.description != nil {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Eyebrow(memo.flagged ? "⛨ Untrusted memo" : "Memo")
                            Spacer()
                            if memo.flagged { Button(raw ? "Hide raw" : "Show raw") { raw.toggle() }.font(.system(size: 11, weight: .medium)).foregroundStyle(Palette.neg) }
                        }
                        Text(raw ? (t.description ?? "") : (memo.text ?? "")).font(.system(size: 13))
                        if memo.flagged { Text("Contains instruction-like text. The copilot treats it as data and can’t be steered by it.").font(.system(size: 11)).foregroundStyle(Palette.muted) }
                    }
                    .padding(12).background(memo.flagged ? Palette.negSoft : Palette.card, in: RoundedRectangle(cornerRadius: 16)).padding(.top, 14)
                }
                Eyebrow("Business use · manual override").padding(.top, 16)
                Picker("Business use", selection: Binding(get: { t.businessUse }, set: { if $0 != .unknown, $0 != t.businessUse { model.overrideUse(t, $0) } })) {
                    ForEach(t.businessUse == .unknown ? BusinessUse.allCases : [.business, .personal, .mixed], id: \.self) { Text($0.rawValue.capitalized).tag($0) }
                }
                .pickerStyle(.segmented).padding(.top, 8)
                Text("Changes are recorded in the audit trail.").font(.system(size: 11)).foregroundStyle(Palette.muted).padding(.top, 4)
                VStack(alignment: .leading, spacing: 3) {
                    Text("provider: demo · \(t.source)")
                    Text("provider_txn_id: \(t.providerTransactionId)").lineLimit(1)
                    Text("synced_at: \(t.syncedAt)")
                    Text("id: \(t.id)")
                }
                .font(.mono(10.5)).foregroundStyle(Palette.muted).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).padding(.top, 14)
            }
        }
    }
}

struct ActionSheet: View {
    @Environment(AppModel.self) private var model
    let messageId: String
    let action: ProposedAction
    @State private var error: String?

    var body: some View {
        let p = action.payload
        VStack(alignment: .leading, spacing: 0) {
            HStack { Pill("Proposed by copilot", tone: .ink); Pill("\(action.riskLevel) risk", tone: action.riskLevel == "low" ? .accent : .risk) }
            Text(action.title).font(.display(21)).padding(.top, 8)
            VStack(alignment: .leading, spacing: 6) {
                switch action.kind {
                case .invoiceFollowUp:
                    Text("To \(p["client"] ?? "") · subject: \(p["subject"] ?? "")").font(.system(size: 11)).foregroundStyle(Palette.muted)
                    Text(p["body"] ?? "").font(.system(size: 14))
                case .classifyTransaction:
                    (Text("Business use: ") + Text(p["oldValue"] ?? "").strikethrough().foregroundColor(Palette.muted) + Text(" → ") + Text(p["newValue"] ?? "").bold()).font(.system(size: 14))
                case .reservePlan:
                    Text("Reminder to move \(Money.format(Int(p["amountMinor"] ?? "0") ?? 0)) to Tax Reserve on \(Dates.short(p["plannedDate"] ?? "2026-11-03")).").font(.system(size: 14))
                }
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 18)).padding(.top, 12)
            VStack(alignment: .leading, spacing: 3) {
                Text("✓ Saved inside FlowFi only")
                Text("✓ Nothing is sent, paid or transferred")
                Text("✓ Approval and execution are written to the audit trail")
                if action.riskLevel == "medium" && model.biometricForMediumRisk { Text("✓ Medium risk: also requires \(model.vault.biometricAvailability().rawValue)") }
            }.font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 12)
            if let error { Text(error).font(.system(size: 12)).foregroundStyle(Palette.neg).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Palette.negSoft, in: RoundedRectangle(cornerRadius: 12)).padding(.top, 10) }
            VStack(spacing: 14) {
                HoldToApprove {
                    Task {
                        if let e = await model.approve(messageId: messageId, action: action) { error = e }
                        else { try? await Task.sleep(for: .milliseconds(850)); model.open(nil) }
                    }
                }
                Button("Reject") { model.reject(messageId: messageId, action: action); model.open(nil) }
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .tourTarget(.hold)
            .padding(.top, 10)
        }
    }
}

struct InvoiceSheet: View {
    @Environment(AppModel.self) private var model
    let id: String
    var body: some View {
        if let inv = model.snapshot.invoices.first(where: { $0.id == id }) {
            VStack(alignment: .leading, spacing: 0) {
                Eyebrow(inv.client)
                Text(inv.number).font(.display(22)).padding(.top, 2)
                Text(Money.format(inv.amountMinor)).font(.display(30)).monospacedDigit()
                HStack(spacing: 8) {
                    box("Due", Dates.short(inv.dueDate))
                    box(inv.status == .paid ? "Paid" : "Expected", Dates.short(inv.paidAt ?? inv.expectedDate ?? inv.dueDate))
                }.padding(.top, 12)
                if let d = model.drafts.first(where: { $0.invoiceId == id }) {
                    VStack(alignment: .leading, spacing: 4) {
                        Eyebrow("Follow-up draft · not sent")
                        Text(d.subject).font(.system(size: 11)).foregroundStyle(Palette.muted)
                        Text(d.body).font(.system(size: 14))
                    }.padding(14).background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).padding(.top, 14)
                } else if inv.status != .paid {
                    Text("No follow-up yet. Ask the copilot “What should I do?” to draft one.").font(.system(size: 12)).foregroundStyle(Palette.muted).padding(.top, 14)
                }
            }
        }
    }
    private func box(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(k).font(.system(size: 11)).foregroundStyle(Palette.muted); Text(v).font(.system(size: 14, weight: .medium)) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Palette.card, in: RoundedRectangle(cornerRadius: 12))
    }
}
