import Charts
import FlowFiCore
import SwiftUI

/// Daily balance chart (Swift Charts). Straight daily segments, a dashed safety
/// floor, the below-floor stretch redrawn in the risk color, and drag-to-scrub
/// for exact values.
struct ForecastChart: View {
    let forecast: Forecast
    var band: [BandPoint] = []
    var height: CGFloat = 200
    var interactive = true
    @State private var selected: Int?

    private struct Seg: Identifiable { let id: String; let points: [(Double, Double)] }

    /// Below-floor stretches, cut exactly at the floor crossing.
    private var riskSegments: [Seg] {
        let floor = Double(forecast.floorMinor)
        let pts = forecast.points.enumerated().map { (Double($0.offset), Double($0.element.balanceMinor)) }
        var segs: [Seg] = [], cur: [(Double, Double)] = []
        for i in pts.indices {
            let (x, y) = pts[i]
            if y < floor {
                if cur.isEmpty, i > 0, pts[i - 1].1 >= floor {
                    let (px, py) = pts[i - 1]
                    cur.append((px + (py - floor) / (py - y) * (x - px), floor))
                }
                cur.append((x, y))
            } else if !cur.isEmpty {
                let (px, py) = pts[i - 1]
                cur.append((px + (floor - py) / (y - py) * (x - px), floor))
                segs.append(Seg(id: "r\(segs.count)", points: cur))
                cur = []
            }
        }
        if !cur.isEmpty { segs.append(Seg(id: "r\(segs.count)", points: cur)) }
        return segs
    }

    private var domain: ClosedRange<Double> {
        let vals = forecast.points.map { Double($0.balanceMinor) } + band.flatMap { [Double($0.lowerMinor), Double($0.upperMinor)] } + [Double(forecast.floorMinor)]
        let lo = vals.min()!, hi = vals.max()!, pad = (hi - lo) * 0.12
        return (lo - pad)...(hi + pad)
    }

    var body: some View {
        Chart {
            ForEach(Array(band.enumerated()), id: \.offset) { i, b in
                AreaMark(x: .value("Day", Double(i)), yStart: .value("Low", Double(b.lowerMinor)), yEnd: .value("High", Double(b.upperMinor)), series: .value("s", "band"))
                    .foregroundStyle(Palette.ink.opacity(0.06))
            }
            ForEach(Array(forecast.points.enumerated()), id: \.offset) { i, p in
                AreaMark(x: .value("Day", Double(i)), yStart: .value("Base", domain.lowerBound), yEnd: .value("Balance", Double(p.balanceMinor)), series: .value("s", "area"))
                    .foregroundStyle(.linearGradient(colors: [Palette.accent.opacity(0.18), Palette.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Day", Double(i)), y: .value("Balance", Double(p.balanceMinor)), series: .value("s", "line"))
                    .foregroundStyle(Palette.ink)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineJoin: .round))
            }
            ForEach(riskSegments) { seg in
                ForEach(Array(seg.points.enumerated()), id: \.offset) { _, pt in
                    LineMark(x: .value("Day", pt.0), y: .value("Balance", pt.1), series: .value("s", seg.id))
                        .foregroundStyle(Palette.risk)
                        .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                }
            }
            RuleMark(y: .value("Floor", Double(forecast.floorMinor)))
                .foregroundStyle(Palette.risk.opacity(0.85))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 5]))
                .annotation(position: .top, alignment: .trailing, spacing: 2) {
                    Text("\(Money.format(forecast.floorMinor, cents: false)) FLOOR").font(.system(size: 9, weight: .semibold)).foregroundStyle(Palette.risk)
                }
            if let i = selected, forecast.points.indices.contains(i) {
                let p = forecast.points[i]
                RuleMark(x: .value("Day", Double(i))).foregroundStyle(Palette.line)
                PointMark(x: .value("Day", Double(i)), y: .value("Balance", Double(p.balanceMinor)))
                    .foregroundStyle(Palette.ink).symbolSize(70)
                    .annotation(position: .top, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(Dates.short(p.date) + (i == 0 ? " · today" : "")).font(.system(size: 10)).opacity(0.65)
                            Text(Money.format(p.balanceMinor)).font(.system(size: 13, weight: .semibold)).monospacedDigit()
                            ForEach(p.events.prefix(2)) { e in
                                Text("\(e.name.split(separator: "·").first.map(String.init) ?? e.name) \(Money.format(e.amountMinor, cents: false, sign: true))").font(.system(size: 10)).opacity(0.8)
                            }
                        }
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Palette.ink, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(Palette.bg)
                    }
            }
        }
        .chartYScale(domain: domain)
        .chartXScale(domain: 0...Double(forecast.points.count - 1))
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: [0, 7, 14, 21, 28]) { v in
                AxisValueLabel {
                    if let i = v.as(Double.self).map(Int.init), forecast.points.indices.contains(i) {
                        Text(Dates.short(forecast.points[i].date)).font(.system(size: 9)).foregroundStyle(Palette.faint)
                    }
                }
            }
        }
        .chartXSelection(value: Binding(get: { selected.map(Double.init) }, set: { selected = interactive ? $0.map { Int($0.rounded()) } : nil }))
        .frame(height: height)
        .animation(.smooth(duration: 0.6), value: forecast.id)
        .accessibilityElement()
        .accessibilityLabel("\(forecast.scenario.title) forecast")
        .accessibilityValue("Starts at \(Money.format(forecast.startBalanceMinor)), lowest \(Money.format(forecast.minPoint.balanceMinor)) on \(Dates.short(forecast.minPoint.date)), ends at \(Money.format(forecast.endBalanceMinor)).")
    }
}
