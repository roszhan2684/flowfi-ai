import FlowFiCore
import SwiftUI

struct CopilotView: View {
    @Environment(AppModel.self) private var model
    @State private var input = ""
    @State private var busy = false
    @FocusState private var focused: Bool

    static let suggestions = ["What should I do?", "Why does my balance dip?", "What if the contractor is paid a week later?", "What's my FlowScore?", "Move $1,690 into my tax reserve", "What is the QuickPrint memo?"]

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Copilot").font(.display(28))
                Spacer()
                Pill("Tool-grounded · on-device")
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 6)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        if model.chat.isEmpty && !busy { empty }
                        ForEach(Array(model.chat.enumerated()), id: \.element.id) { i, m in
                            MessageView(message: m, latest: i == model.chat.count - 1).id(m.id)
                        }
                        if busy { Thinking().id("thinking") }
                    }
                    .padding(.horizontal, 16).padding(.bottom, 12)
                }
                .onChange(of: model.chat.count) { _, _ in
                    withAnimation(.ease) { proxy.scrollTo(model.chat.last?.id, anchor: .top) }
                }
                .scrollsToTour(proxy, model: model)
            }

            if !model.chat.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Self.suggestions.prefix(5), id: \.self) { s in
                            Button(s) { ask(s) }.font(.system(size: 12)).padding(.horizontal, 12).padding(.vertical, 7)
                                .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line)).foregroundStyle(Palette.ink)
                                .disabled(busy)
                        }
                    }.padding(.horizontal, 16)
                }.padding(.bottom, 8)
            }

            HStack(spacing: 8) {
                TextField("Ask FlowFi…", text: $input)
                    .font(.system(size: 15))
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { ask(input) }
                Button { ask(input) } label: {
                    Image(systemName: "arrow.up").font(.system(size: 15, weight: .semibold)).frame(width: 34, height: 34)
                        .background(Palette.ink, in: Circle()).foregroundStyle(Palette.bg)
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                .opacity(input.trimmingCharacters(in: .whitespaces).isEmpty ? 0.3 : 1)
                .accessibilityLabel("Send")
            }
            .padding(.leading, 16).padding(.trailing, 6).padding(.vertical, 6)
            .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line))
            .padding(.horizontal, 12).padding(.bottom, 10)
        }
        .onChange(of: focused) { _, f in withAnimation(.ease) { model.keyboardVisible = f } }
        .task(id: model.pendingQuestion) {
            if let q = model.pendingQuestion { model.pendingQuestion = nil; ask(q) }
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 20) {
            (Text("Ask about your cash.\n") + Text("Every number comes with a receipt.").foregroundColor(Palette.muted))
                .font(.display(27)).padding(.top, 20)
            FlowLayout(spacing: 8) {
                ForEach(Self.suggestions, id: \.self) { s in
                    Button(s) { ask(s) }.font(.system(size: 13)).padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line)).foregroundStyle(Palette.ink)
                }
            }
        }
    }

    private func ask(_ q: String) {
        let text = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        input = ""
        focused = false
        busy = true
        Task {
            await model.send(text)
            busy = false
        }
    }
}

private struct Thinking: View {
    @State private var on = false
    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) { ForEach(0..<3) { i in Circle().fill(Palette.muted).frame(width: 6, height: 6).opacity(on ? 1 : 0.3).animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(i) * 0.15), value: on) } }
            Text("Choosing tools…").font(.system(size: 12)).foregroundStyle(Palette.muted)
        }
        .onAppear { on = true }
    }
}

struct MessageView: View {
    let message: ChatMessage
    let latest: Bool
    var body: some View {
        switch message.role {
        case .user:
            HStack { Spacer(minLength: 50); Text(message.text).font(.system(size: 15)).padding(.horizontal, 14).padding(.vertical, 10)
                .background(Palette.ink, in: UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 20, bottomTrailingRadius: 6, topTrailingRadius: 20)).foregroundStyle(Palette.bg) }
                .transition(.move(edge: .bottom).combined(with: .opacity))
        case .error:
            Text("Copilot unavailable: \(message.text). No numbers were shown.").font(.system(size: 13)).padding(12).background(Palette.negSoft, in: RoundedRectangle(cornerRadius: 16)).foregroundStyle(Palette.neg)
        case .assistant:
            if let r = message.response { AnswerView(messageId: message.id, r: r, latest: latest) }
        }
    }
}

struct AnswerView: View {
    @Environment(AppModel.self) private var model
    let messageId: String
    let r: AgentResponse
    let latest: Bool
    @State private var revealed = 0
    @State private var showEvidence = false

    private var done: Bool { revealed >= r.trace.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(r.trace.prefix(revealed)) { t in
                    HStack(spacing: 6) {
                        Image(systemName: t.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(t.ok ? (t.access == "read" ? Palette.accent : Palette.risk) : Palette.neg)
                        Text(t.tool).foregroundStyle(Palette.muted)
                        Text(t.access == "write_proposal" ? "proposal" : "read").foregroundStyle(Palette.faint)
                    }
                    .font(.mono(11))
                    .transition(.move(edge: .leading).combined(with: .opacity))
                }
            }

            // Numbers only appear after every tool result is in.
            if done {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(r.guardrails, id: \.self) { g in
                        Label(g, systemImage: "shield.lefthalf.filled").font(.system(size: 12)).padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Palette.slab, in: RoundedRectangle(cornerRadius: 14)).foregroundStyle(.white)
                    }
                    RichAnswer(text: r.answer)
                        .padding(14)
                        .background(Palette.card, in: UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 20, bottomTrailingRadius: 20, topTrailingRadius: 20))
                    ForEach(r.uncertainties, id: \.self) { u in
                        HStack(alignment: .top, spacing: 6) { Pill("Estimate", tone: .risk); Text(u).font(.system(size: 12)).foregroundStyle(Palette.risk) }
                    }
                    if !r.citations.isEmpty { evidence }
                    ForEach(r.proposedActions) { a in proposal(a) }
                }
                .transition(.opacity.combined(with: .offset(y: 8)))
            }
        }
        .if(latest) { $0.tourTarget(.answer) }
        .task {
            guard latest, revealed == 0 else { revealed = r.trace.count; return }
            for i in 1...max(1, r.trace.count) {
                try? await Task.sleep(for: .milliseconds(240))
                withAnimation(.ease) { revealed = i }
            }
        }
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.ease) { showEvidence.toggle() }
                model.completeTour("evidence")
            } label: {
                HStack(spacing: 6) {
                    ForEach(r.citations.prefix(3)) { c in
                        Text(c.label.count > 22 ? String(c.label.prefix(20)) + "…" : c.label).font(.system(size: 11, weight: .medium)).lineLimit(1)
                            .padding(.horizontal, 9).padding(.vertical, 5).background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line))
                    }
                    Text(showEvidence ? "Hide" : "Evidence").font(.system(size: 12, weight: .semibold)).foregroundStyle(Palette.accent)
                }
                .foregroundStyle(Palette.ink)
            }
            .buttonStyle(.plain)
            .if(latest) { $0.tourTarget(.evidence) }

            if showEvidence {
                VStack(alignment: .leading, spacing: 8) {
                    if !r.calculations.isEmpty {
                        Eyebrow("Calculations")
                        ForEach(r.calculations) { c in
                            HStack { Text(c.label).lineLimit(1); Spacer(); Text(Money.format(c.valueMinor)).fontWeight(.medium).monospacedDigit() }.font(.system(size: 12))
                        }
                    }
                    Eyebrow("Sources").padding(.top, 4)
                    ForEach(r.citations) { c in
                        HStack { Text("\(c.type):\(c.sourceId)").lineLimit(1); Spacer(); Text(String(c.asOf.prefix(16)).replacingOccurrences(of: "T", with: " ") + "Z").foregroundStyle(Palette.muted) }.font(.mono(10))
                    }
                    Divider().overlay(Palette.line)
                    Text(AgentResponse.model).font(.system(size: 10)).foregroundStyle(Palette.faint)
                }
                .padding(12).background(Palette.card, in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line))
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private func proposal(_ a: ProposedAction) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Pill(a.status == .approved ? "✓ Approved" : a.status == .rejected ? "Rejected" : "Proposed action", tone: a.status == .approved ? .accent : a.status == .rejected ? .neutral : .ink)
                Spacer()
                Pill("\(a.riskLevel) risk", tone: a.riskLevel == "low" ? .accent : .risk)
            }
            Text(a.title).font(.system(size: 15, weight: .semibold)).padding(.top, 4)
            Text(a.summary).font(.system(size: 12)).foregroundStyle(Palette.muted)
            if a.status == .proposed {
                Button("Review") { model.open(.action(messageId: messageId, action: a)) }.buttonStyle(PrimaryButtonStyle()).padding(.top, 8)
            }
        }
        .padding(14)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.ink.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [4, 4])))
    }
}

extension View {
    @ViewBuilder func `if`(_ c: Bool, _ transform: (Self) -> some View) -> some View {
        if c { transform(self) } else { self }
    }
}

/// Wrapping layout for suggestion chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > w, x > 0 { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing
            row = max(row, s.height)
        }
        return CGSize(width: w == .infinity ? x : w, height: y + row)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            row = max(row, s.height)
        }
    }
}
