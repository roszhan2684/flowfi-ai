import SwiftUI

enum TourTarget: String, CaseIterable {
    case cash, why, drivers, answer, evidence, hold, presets, audit, faults
}

struct TourStep {
    let target: TourTarget
    let label: String
    let title: String
    let body: String

    static let all: [TourStep] = [
        TourStep(target: .cash, label: "Cash today + 30-day forecast", title: "Cash today, and where it’s heading", body: "Live balance plus 7, 14 and 30-day projections, computed on-device by FlowFiCore."),
        TourStep(target: .why, label: "Spot the threshold alert", title: "One alert that matters", body: "FlowFi spots the Oct 23 dip below your $5,000 floor. Tap Why, or press Next."),
        TourStep(target: .drivers, label: "See what drives the dip", title: "Drivers, not vibes", body: "A late invoice and a contractor payment cause the dip. Every bar is a real event."),
        TourStep(target: .answer, label: "Ask “What should I do?”", title: "Ask the copilot", body: "It calls typed tools first, then answers using only the numbers they return."),
        TourStep(target: .evidence, label: "Open the evidence", title: "Every number has a receipt", body: "Tap Evidence to see the calculations and sources behind the answer."),
        TourStep(target: .hold, label: "Hold to approve the draft", title: "Hold to approve", body: "The copilot only proposes. Press and hold the ring: nothing is sent or paid."),
        TourStep(target: .presets, label: "Toggle INV-104 on time", title: "What if it pays on time?", body: "Flip the switch and watch the low point and FlowScore recover."),
        TourStep(target: .audit, label: "Check the audit trail", title: "Everything is audited", body: "AI runs, proposals, approvals and scenario changes, append-only."),
        TourStep(target: .faults, label: "Run the fault lab", title: "Built for bad days", body: "Duplicate webhooks, outages and crashes, run against the real sync engine."),
    ]
}

struct TourAnchorKey: PreferenceKey {
    static let defaultValue: [TourTarget: Anchor<CGRect>] = [:]
    static func reduce(value: inout [TourTarget: Anchor<CGRect>], nextValue: () -> [TourTarget: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

extension View {
    /// Marks a view as a tour target and gives it a scroll id.
    func tourTarget(_ t: TourTarget) -> some View {
        // transform (not set) so nested targets survive their parents.
        transformAnchorPreference(key: TourAnchorKey.self, value: .bounds) { $0[t] = $1 }.id(t)
    }

    /// Scrolls the current tour target into view inside a ScrollViewReader.
    func scrollsToTour(_ proxy: ScrollViewProxy, model: AppModel) -> some View {
        onChange(of: model.tourStep, initial: true) { _, step in
            guard let step else { return }
            let target = TourStep.all[step].target
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(380))
                withAnimation(.ease) { proxy.scrollTo(target, anchor: .center) }
            }
        }
    }
}

/// Dims everything except the current target and shows the step card.
/// Taps pass through, so the highlighted UI stays fully usable.
struct TourOverlay: View {
    @Environment(AppModel.self) private var model
    let anchors: [TourTarget: Anchor<CGRect>]

    var body: some View {
        GeometryReader { geo in
            if let i = model.tourStep {
                let step = TourStep.all[i]
                // Anchors resolve in safe-area space; the overlay draws full-screen.
                let inset = geo.safeAreaInsets
                let full = CGSize(width: geo.size.width + inset.leading + inset.trailing, height: geo.size.height + inset.top + inset.bottom)
                let rect = anchors[step.target].map { geo[$0].offsetBy(dx: inset.leading, dy: inset.top).insetBy(dx: -6, dy: -6) }
                    .map { $0.intersection(CGRect(origin: .zero, size: full).insetBy(dx: 6, dy: inset.top)) }
                    .flatMap { $0.isNull || $0.height < 12 ? nil : $0 }
                ZStack(alignment: .topLeading) {
                    Spotlight(rect: rect)
                        .fill(Color.black.opacity(0.56), style: FillStyle(eoFill: true))
                        .allowsHitTesting(false)
                        .animation(.spring(response: 0.45, dampingFraction: 0.82), value: rect)
                    if let rect {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Palette.accent, lineWidth: 2)
                            .frame(width: rect.width, height: rect.height)
                            .offset(x: rect.minX, y: rect.minY)
                            .modifier(Pulse())
                            .allowsHitTesting(false)
                            .animation(.spring(response: 0.45, dampingFraction: 0.82), value: rect)
                    }
                    TourCard(index: i, step: step)
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity)
                        .position(x: full.width / 2, y: cardY(rect, in: full))
                        .id(i)
                        .transition(.opacity.combined(with: .scale(scale: 0.97)))
                }
                .ignoresSafeArea()
            }
        }
    }

    private func cardY(_ r: CGRect?, in size: CGSize) -> CGFloat {
        let h: CGFloat = 196
        guard let r else { return size.height / 2 }
        if r.midY < size.height * 0.5 { return min(r.maxY + 14 + h / 2, size.height - h / 2 - 40) }
        return max(r.minY - 14 - h / 2, h / 2 + 64)
    }
}

private struct Spotlight: Shape {
    var rect: CGRect?
    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { let r = rect ?? .zero; return .init(.init(r.minX, r.minY), .init(r.width, r.height)) }
        set { rect = rect == nil ? nil : CGRect(x: newValue.first.first, y: newValue.first.second, width: newValue.second.first, height: newValue.second.second) }
    }
    func path(in bounds: CGRect) -> Path {
        var p = Path(bounds)
        if let rect { p.addRoundedRect(in: rect, cornerSize: CGSize(width: 20, height: 20), style: .continuous) }
        return p
    }
}

private struct Pulse: ViewModifier {
    @State private var on = false
    func body(content: Content) -> some View {
        content.opacity(on ? 0.35 : 0.95)
            .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { on = true } }
    }
}

struct TourCard: View {
    @Environment(AppModel.self) private var model
    let index: Int
    let step: TourStep

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HStack(spacing: 4) {
                    ForEach(TourStep.all.indices, id: \.self) { j in
                        Capsule().fill(j == index ? Color(hex: 0x9EF0C0) : .white.opacity(j < index ? 0.6 : 0.2))
                            .frame(width: j == index ? 18 : 6, height: 4)
                    }
                }
                Spacer()
                Text("\(index + 1) / \(TourStep.all.count)").font(.mono(11)).foregroundStyle(.white.opacity(0.55))
            }
            Text(step.title).font(.system(size: 17, weight: .semibold)).padding(.top, 10)
            Text(step.body).font(.system(size: 13)).foregroundStyle(.white.opacity(0.72)).padding(.top, 3).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                Button("Skip tour") { model.setTourStep(nil) }
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.6))
                Spacer()
                Button("Back") { model.tourAdvance(-1) }
                    .font(.system(size: 13, weight: .medium))
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .overlay(Capsule().stroke(.white.opacity(0.25)))
                    .disabled(index == 0).opacity(index == 0 ? 0.35 : 1)
                Button(index == TourStep.all.count - 1 ? "Finish" : "Next") { model.tourAdvance(1) }
                    .font(.system(size: 13, weight: .semibold))
                    .padding(.horizontal, 16).padding(.vertical, 7)
                    .background(.white, in: Capsule())
                    .foregroundStyle(Color(hex: 0x0D1110))
            }
            .padding(.top, 14)
        }
        .foregroundStyle(.white)
        .padding(16)
        .background(Color(hex: 0x0D1110), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tour step \(index + 1) of \(TourStep.all.count): \(step.title)")
    }
}

extension Color {
    init(hex: UInt32) { self.init(UIColor(hex: hex)) }
}
