import FlowFiCore
import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var appeared = false

    var body: some View {
        let s = model.snapshot
        let f = s.base
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    header(s).stagger(0, appeared)

                    if s.freshness.stale {
                        Card(tint: Palette.riskSoft) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Bank data is \(s.freshness.ageHours)h old").font(.system(size: 14, weight: .semibold)).foregroundStyle(Palette.risk)
                                    Text("Showing last good state.").font(.system(size: 12)).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                Button("Retry sync") { model.setStale(false) }.font(.system(size: 13, weight: .semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 7).background(Palette.ink, in: Capsule()).foregroundStyle(Palette.bg)
                            }
                        }
                    }

                    Card {
                        Eyebrow("Cash available today")
                        MoneyText(minor: s.availableMinor).font(.display(38)).foregroundStyle(Palette.ink).padding(.top, 4)
                        Text(s.accounts.filter { $0.type == .depository }.map { "\($0.name.split(separator: " ").last ?? "") ••\($0.mask) \(Money.format($0.balanceMinor, cents: false))" }.joined(separator: "  ·  "))
                            .font(.system(size: 11)).monospacedDigit().foregroundStyle(Palette.muted)
                            .lineLimit(1).minimumScaleFactor(0.8).padding(.top, 6)
                        HStack(spacing: 8) {
                            ForEach([7, 14, 30], id: \.self) { d in
                                let p = f.points[d]
                                let low = p.balanceMinor < f.floorMinor
                                Button { model.go(.cash) } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("In \(d) days").font(.system(size: 10)).foregroundStyle(Palette.muted)
                                        MoneyText(minor: p.balanceMinor, cents: false).font(.system(size: 15, weight: .semibold)).foregroundStyle(low ? Palette.risk : Palette.ink)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                                    .background(low ? Palette.riskSoft : Palette.bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }.buttonStyle(.plain)
                            }
                        }.padding(.top, 14)
                    }
                    .tourTarget(.cash)
                    .stagger(1, appeared)

                    if let b = f.breach {
                        Card(tint: Palette.riskSoft) {
                            HStack(spacing: 8) {
                                Pill("⚠ Threshold risk", tone: .risk)
                                Text("base scenario").font(.system(size: 11)).foregroundStyle(Palette.muted)
                            }
                            Text("Cash may dip below \(Money.format(f.floorMinor, cents: false)) on \(Dates.short(b.firstDate))").font(.system(size: 17, weight: .semibold)).foregroundStyle(Palette.ink).padding(.top, 8)
                            (Text("Low of ") + Text(Money.format(b.minBalanceMinor)).fontWeight(.semibold).foregroundColor(Palette.ink) + Text(" — \(Money.format(b.shortfallMinor)) under your floor."))
                                .font(.system(size: 12)).monospacedDigit().foregroundStyle(Palette.muted).padding(.top, 3)
                            Button("Why?") { model.open(.why) }
                                .font(.system(size: 14, weight: .semibold))
                                .padding(.horizontal, 18).padding(.vertical, 9)
                                .background(Palette.ink, in: Capsule()).foregroundStyle(Palette.bg)
                                .padding(.top, 12)
                                .tourTarget(.why)
                        }
                        .stagger(2, appeared)
                    } else {
                        Card(tint: Palette.accentSoft) {
                            Pill("✓ Clear", tone: .accent)
                            Text("Above your \(Money.format(f.floorMinor, cents: false)) floor for 30 days").font(.system(size: 17, weight: .semibold)).padding(.top, 8)
                            Text("Lowest \(Money.format(f.minPoint.balanceMinor)) on \(Dates.short(f.minPoint.date))\(model.enabledPresets.isEmpty ? "" : " · with your assumptions")")
                                .font(.system(size: 12)).monospacedDigit().foregroundStyle(Palette.muted).padding(.top, 3)
                        }
                        .stagger(2, appeared)
                    }

                    nextStep.stagger(3, appeared)
                    upcoming(f).stagger(4, appeared)
                    score(s.flowScore).stagger(5, appeared)

                    Button { model.go(.copilot) } label: {
                        HStack { Image(systemName: "sparkles").foregroundStyle(Palette.accent); Text("Ask FlowFi about your cash…").foregroundStyle(Palette.muted); Spacer() }
                            .font(.system(size: 14)).padding(.horizontal, 16).padding(.vertical, 13)
                            .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line))
                    }.buttonStyle(.plain).stagger(6, appeared)
                }
                .padding(.horizontal, 16).padding(.bottom, 20)
            }
            .scrollsToTour(proxy, model: model)
        }
        .onAppear { withAnimation(.ease) { appeared = true }; model.completeTour("cash") }
    }

    private func header(_ s: Snapshot) -> some View {
        HStack {
            Text("NS").font(.system(size: 12, weight: .semibold)).frame(width: 36, height: 36).background(Palette.ink, in: Circle()).foregroundStyle(Palette.bg)
            VStack(alignment: .leading, spacing: 1) {
                Text(s.workspace.name).font(.system(size: 15, weight: .semibold))
                HStack(spacing: 5) {
                    Circle().fill(s.freshness.stale ? Palette.risk : Palette.accent).frame(width: 6, height: 6)
                    Text(s.freshness.stale ? "Stale · \(s.freshness.ageHours)h old" : "Synced 8:42 AM").font(.system(size: 11)).foregroundStyle(Palette.muted)
                }
            }
            Spacer()
            if model.vault.appLockEnabled { Image(systemName: "lock.fill").font(.system(size: 12)).foregroundStyle(Palette.muted).accessibilityLabel("App lock on") }
            Pill("Demo data")
        }
        .padding(.top, 8).padding(.horizontal, 4)
    }

    private var nextStep: some View {
        let drafted = model.snapshot.invoices.contains { $0.id == "inv_104" && $0.followUpDraftId != nil }
        return Button { drafted ? model.go(.cash) : model.ask("What should I do?") } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text("NEXT BEST STEP").font(.system(size: 11, weight: .medium)).kerning(0.6).foregroundStyle(.white.opacity(0.5))
                HStack(alignment: .top) {
                    Text(drafted ? "Follow-up saved. Model “INV-104 paid on time”" : "Nudge Lumen Health about INV-104").font(.system(size: 17, weight: .semibold)).multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "arrow.right").frame(width: 32, height: 32).background(.white.opacity(0.12), in: Circle())
                }
                Text(drafted ? "See how the forecast changes" : "Ask FlowFi · $6,800 expected 10 days late").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
            }
            .foregroundStyle(.white).padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.slab, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }.buttonStyle(.plain)
    }

    private func upcoming(_ f: Forecast) -> some View {
        Card {
            HStack { Eyebrow("Upcoming"); Spacer(); Button("All") { model.go(.cash) }.font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.accent) }
            ForEach(Array(f.points.flatMap(\.events).prefix(5).enumerated()), id: \.offset) { i, e in
                if i > 0 { Divider().overlay(Palette.line) }
                HStack(spacing: 12) {
                    VStack(spacing: 0) {
                        Text(Dates.short(e.date).split(separator: " ")[0].uppercased()).font(.system(size: 9)).foregroundStyle(Palette.muted)
                        Text(String(Dates.short(e.date).split(separator: " ")[1])).font(.system(size: 16, weight: .semibold)).monospacedDigit()
                    }.frame(width: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(e.name).font(.system(size: 13, weight: .medium)).lineLimit(1)
                        Text(e.type == .invoice ? "Invoice · \(Int(e.confidence * 100))% confidence" : e.type == .obligation ? "Card statement" : "Recurring").font(.system(size: 11)).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Text(Money.format(e.amountMinor, sign: true)).font(.system(size: 13, weight: .semibold)).monospacedDigit().foregroundStyle(e.amountMinor > 0 ? Palette.accent : Palette.ink)
                }.padding(.vertical, 9)
            }
        }
    }

    private func score(_ fs: FlowScore) -> some View {
        Button { model.go(.more, page: .score) } label: {
            Card {
                HStack { Eyebrow("FlowScore"); Spacer(); Text("Not a credit score").font(.system(size: 10)).foregroundStyle(Palette.faint) }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(fs.score)").font(.display(32)).monospacedDigit().contentTransition(.numericText(value: Double(fs.score)))
                    Text("/ 100").font(.system(size: 13)).foregroundStyle(Palette.muted)
                    Pill(fs.band, tone: fs.score >= 60 ? .accent : .risk)
                }.padding(.top, 2)
                if let pos = fs.factors.filter(\.positive).max(by: { $0.points < $1.points }) {
                    factorRow("▲", pos.label, "+\(pos.points)", Palette.accent)
                }
                if let neg = fs.factors.filter({ !$0.positive }).max(by: { ($0.max - $0.points) < ($1.max - $1.points) }) {
                    factorRow("▼", neg.label, "−\(neg.max - neg.points)", Palette.risk)
                }
            }
        }.buttonStyle(.plain)
    }

    private func factorRow(_ glyph: String, _ label: String, _ value: String, _ color: Color) -> some View {
        HStack { Text(glyph).foregroundStyle(color); Text(label); Spacer(); Text(value).foregroundStyle(Palette.muted).monospacedDigit() }
            .font(.system(size: 12)).foregroundStyle(Palette.ink).padding(.top, 5)
    }
}

extension View {
    func stagger(_ i: Int, _ on: Bool) -> some View {
        opacity(on ? 1 : 0).offset(y: on ? 0 : 14).animation(.ease.delay(Double(i) * 0.04), value: on)
    }
}
