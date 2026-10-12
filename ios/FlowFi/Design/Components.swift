import FlowFiCore
import SwiftUI

/// Currency that rolls digit-by-digit when it changes. Tabular figures keep columns still.
struct MoneyText: View {
    let minor: Int
    var cents = true
    var sign = false
    var body: some View {
        Text(Money.format(minor, cents: cents, sign: sign))
            .monospacedDigit()
            .contentTransition(.numericText(value: Double(minor)))
            .animation(.snappy(duration: 0.55), value: minor)
    }
}

struct Card<Content: View>: View {
    var tint: Color = Palette.card
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 12, y: 6)
    }
}

struct Eyebrow: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased()).font(.system(size: 11, weight: .medium)).kerning(0.6).foregroundStyle(Palette.muted)
    }
}

enum PillTone { case neutral, risk, accent, neg, ink }

struct Pill: View {
    let text: String
    var tone: PillTone = .neutral
    init(_ text: String, tone: PillTone = .neutral) { self.text = text; self.tone = tone }
    var body: some View {
        let (bg, fg): (Color, Color) = switch tone {
        case .neutral: (Palette.line.opacity(0.8), Palette.muted)
        case .risk: (Palette.riskSoft, Palette.risk)
        case .accent: (Palette.accentSoft, Palette.accent)
        case .neg: (Palette.negSoft, Palette.neg)
        case .ink: (Palette.ink, Palette.bg)
        }
        Text(text).font(.system(size: 10.5, weight: .semibold)).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(bg, in: Capsule()).foregroundStyle(fg)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var fill: Color = Palette.ink
    var text: Color = Palette.bg
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 16).padding(.vertical, 11)
            .frame(maxWidth: .infinity)
            .background(fill, in: Capsule())
            .foregroundStyle(text)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}

struct ScreenHeader: View {
    let title: String
    var subtitle: String? = nil
    var back: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let back {
                Button(action: back) {
                    Label("Back", systemImage: "chevron.left").font(.system(size: 14, weight: .medium)).foregroundStyle(Palette.accent)
                }
                .padding(.bottom, 2)
            }
            Text(title).font(.display(28)).foregroundStyle(Palette.ink)
            if let subtitle { Text(subtitle).font(.system(size: 12)).foregroundStyle(Palette.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 10)
    }
}

/// Press-and-hold approval. The ring fills over `duration`; releasing early
/// rewinds it. VoiceOver users get an explicit "Approve" action instead.
struct HoldToApprove: View {
    var duration: Double = 1.1
    var size: CGFloat = 88
    var label = "Hold to approve"
    let onComplete: () -> Void
    @State private var progress: CGFloat = 0
    @State private var done = false
    @State private var holding = false

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle().stroke(Palette.line, lineWidth: 5)
                Circle().trim(from: 0, to: progress)
                    .stroke(Palette.accent, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Circle().fill(done ? Palette.accent : .clear).padding(11)
                Image(systemName: done ? "checkmark" : "faceid")
                    .font(.system(size: done ? 26 : 28, weight: done ? .bold : .regular))
                    .foregroundStyle(done ? Palette.onAccent : Palette.ink)
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(width: size, height: size)
            .scaleEffect(holding ? 0.93 : 1)
            .animation(.snappy(duration: 0.25), value: holding)
            .contentShape(Circle())
            .onLongPressGesture(minimumDuration: duration, maximumDistance: 40) {
                done = true
                holding = false
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onComplete()
            } onPressingChanged: { pressing in
                holding = pressing
                if pressing && !done {
                    withAnimation(.linear(duration: duration)) { progress = 1 }
                } else if !done {
                    withAnimation(.easeOut(duration: 0.3)) { progress = 0 }
                }
            }
            .accessibilityElement()
            .accessibilityLabel(done ? "Approved" : label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: "Approve") {
                guard !done else { return }
                done = true
                progress = 1
                onComplete()
            }

            Text(done ? "Approved" : holding ? "Keep holding…" : label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(done ? Palette.accent : Palette.muted)
        }
    }
}

/// Renders "**bold**" segments; money values become accent chips.
struct RichAnswer: View {
    let text: String
    var body: some View {
        Text(attributed).font(.system(size: 15)).lineSpacing(3).foregroundStyle(Palette.ink)
    }

    var attributed: AttributedString {
        var out = AttributedString()
        let parts = text.components(separatedBy: "**")
        for (i, part) in parts.enumerated() {
            var a = AttributedString(part)
            if i % 2 == 1 {
                a.font = .system(size: 15, weight: .semibold).monospacedDigit()
                if part.contains("$") {
                    a.foregroundColor = Palette.accent
                    a.backgroundColor = Palette.accentSoft
                }
            }
            out += a
        }
        return out
    }
}

struct SkeletonBlock: View {
    var height: CGFloat
    @State private var on = false
    var body: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Palette.line)
            .frame(height: height).opacity(on ? 0.5 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever()) { on = true } }
    }
}

func initials(_ name: String) -> String {
    name.split(whereSeparator: { $0 == " " || $0 == "&" }).prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
}
