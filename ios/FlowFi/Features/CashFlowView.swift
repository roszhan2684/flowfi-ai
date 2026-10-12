import FlowFiCore
import SwiftUI

struct CashFlowView: View {
    @Environment(AppModel.self) private var model
    @State private var showAssumptions = false
    @State private var lastLow: Int?
    @State private var delta: Int?

    var body: some View {
        @Bindable var model = model
        let f = model.forecast
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 12) {
                    ScreenHeader(title: "Cash flow", subtitle: "30 days from \(Dates.short(f.asOf)) · \(Forecast.modelVersion)")
                        .padding(.horizontal, -16)

                    Picker("Scenario", selection: $model.scenario.animation(.smooth)) {
                        ForEach(Scenario.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)

                    Card {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Eyebrow("Lowest point")
                                MoneyText(minor: f.minPoint.balanceMinor).font(.display(30))
                                Text("on \(Dates.short(f.minPoint.date))").font(.system(size: 12)).foregroundStyle(Palette.muted)
                            }
                            Spacer()
                            Group {
                                if let b = f.breach { Pill("⚠ Below floor \(b.daysBelow)d", tone: .risk) } else { Pill("✓ Above floor", tone: .accent) }
                            }
                            .transition(.scale.combined(with: .opacity))
                            .id(f.breach == nil)
                        }
                        ForecastChart(forecast: f, band: model.snapshot.band, height: 200).padding(.top, 12)
                        HStack { Text("Shaded: conservative ↔ optimistic"); Spacer(); Text("Drag to inspect") }
                            .font(.system(size: 11)).foregroundStyle(Palette.muted).padding(.top, 8)
                        if let delta, delta != 0 {
                            Text("Since last forecast: low point \(Money.format(delta, sign: true))")
                                .font(.system(size: 12, weight: .medium)).monospacedDigit()
                                .foregroundStyle(delta > 0 ? Palette.accent : Palette.risk)
                                .padding(.horizontal, 12).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)
                                .background(delta > 0 ? Palette.accentSoft : Palette.riskSoft, in: RoundedRectangle(cornerRadius: 12))
                                .padding(.top, 10)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }

                    Card {
                        Eyebrow("Try an assumption")
                        ForEach(Array(Preset.all.enumerated()), id: \.offset) { i, p in
                            if i > 0 { Divider().overlay(Palette.line) }
                            Toggle(isOn: Binding(get: { model.enabledPresets.contains(p.id) }, set: { _ in model.togglePreset(p.id) })) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(p.label).font(.system(size: 14, weight: .medium))
                                    Text(p.detail).font(.system(size: 11)).foregroundStyle(Palette.muted)
                                }
                            }
                            .tint(Palette.accent)
                            .padding(.vertical, 8)
                        }
                        Text(f.scenario.rule).font(.system(size: 11)).foregroundStyle(Palette.muted).padding(.top, 2)
                    }
                    .tourTarget(.presets)

                    Card {
                        Button { withAnimation(.ease) { showAssumptions.toggle() } } label: {
                            HStack { Eyebrow("Model assumptions · \(f.assumptions.count)"); Spacer(); Image(systemName: "chevron.right").rotationEffect(.degrees(showAssumptions ? 90 : 0)).foregroundStyle(Palette.muted) }
                        }.buttonStyle(.plain)
                        if showAssumptions {
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(f.assumptions, id: \.self) { a in Text("• \(a)").font(.system(size: 12)) }
                                Text("Data as of Oct 12, 3:42 PM UTC · computed on-device · no LLM involved").font(.system(size: 11)).foregroundStyle(Palette.faint).padding(.top, 4)
                            }.padding(.top, 8).transition(.opacity)
                        }
                    }

                    Card {
                        Eyebrow("Expected in & out")
                        ForEach(f.points.filter { !$0.events.isEmpty }) { p in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(Dates.short(p.date))
                                    Spacer()
                                    Text(Money.format(p.balanceMinor, cents: false) + (p.balanceMinor < f.floorMinor ? " · below floor" : ""))
                                        .fontWeight(p.balanceMinor < f.floorMinor ? .semibold : .regular)
                                        .foregroundStyle(p.balanceMinor < f.floorMinor ? Palette.risk : Palette.muted)
                                }
                                .font(.system(size: 11)).monospacedDigit().foregroundStyle(Palette.muted)
                                ForEach(p.events) { e in
                                    HStack {
                                        Text(e.name).lineLimit(1)
                                        if let note = e.note { Text(note).font(.system(size: 10)).foregroundStyle(Palette.accent) }
                                        Spacer()
                                        Text(Money.format(e.amountMinor, sign: true)).fontWeight(.medium).monospacedDigit().foregroundStyle(e.amountMinor > 0 ? Palette.accent : Palette.ink)
                                    }.font(.system(size: 13))
                                }
                            }
                            .padding(.vertical, 8)
                            Divider().overlay(Palette.line)
                        }
                        Text("Plus \(Money.format(f.variableDailyMinor))/day of day-to-day spend.").font(.system(size: 11)).foregroundStyle(Palette.muted).padding(.top, 6)
                    }
                }
                .padding(.horizontal, 16).padding(.bottom, 20)
            }
            .scrollsToTour(proxy, model: model)
        }
        .onChange(of: f.id, initial: true) { _, _ in
            if let lastLow { withAnimation(.ease) { delta = f.minPoint.balanceMinor - lastLow } }
            lastLow = f.minPoint.balanceMinor
        }
    }
}
