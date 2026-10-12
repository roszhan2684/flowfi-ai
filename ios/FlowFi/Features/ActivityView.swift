import FlowFiCore
import SwiftUI

struct ActivityView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var filter = "All"
    @Namespace private var ns
    static let filters = ["All", "Business", "Personal", "Mixed", "Unknown", "Pending"]

    private var groups: [(String, [FlowFiCore.Transaction])] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)
        let rows = model.snapshot.transactions.filter { t in
            if !q.isEmpty && !"\(t.merchantName) \(t.category) \(Money.format(abs(t.amountMinor)))".lowercased().contains(q) { return false }
            switch filter {
            case "All": return true
            case "Pending": return t.pending
            default: return t.businessUse.rawValue == filter.lowercased()
            }
        }
        var order: [String] = []
        var map: [String: [FlowFiCore.Transaction]] = [:]
        for t in rows { if map[t.occurredAt] == nil { order.append(t.occurredAt) }; map[t.occurredAt, default: []].append(t) }
        return order.prefix(40).map { ($0, map[$0]!) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                ScreenHeader(title: "Activity", subtitle: "\(model.snapshot.transactions.count) transactions · 3 accounts").padding(.horizontal, -16)
                Section {
                    if groups.isEmpty {
                        VStack(spacing: 8) {
                            Text("Nothing matches").font(.system(size: 15, weight: .semibold))
                            Text("Try another merchant or clear the filter.").font(.system(size: 12)).foregroundStyle(Palette.muted)
                            Button("Clear") { query = ""; filter = "All" }.buttonStyle(PrimaryButtonStyle()).frame(width: 120)
                        }.frame(maxWidth: .infinity).padding(.top, 50)
                    }
                    ForEach(groups, id: \.0) { date, rows in
                        Text(Dates.short(date).uppercased()).font(.system(size: 11, weight: .semibold)).foregroundStyle(Palette.muted).padding(.top, 14).padding(.bottom, 6)
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, t in
                                if i > 0 { Divider().overlay(Palette.line).padding(.leading, 56) }
                                row(t)
                            }
                        }
                        .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                } header: {
                    VStack(spacing: 8) {
                        HStack {
                            Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                            TextField("Search merchant, category, amount", text: $query).font(.system(size: 14))
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Palette.card, in: Capsule()).overlay(Capsule().stroke(Palette.line))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(Self.filters, id: \.self) { f in
                                    Button { withAnimation(.snappy) { filter = f } } label: {
                                        Text(f).font(.system(size: 12, weight: .medium)).padding(.horizontal, 12).padding(.vertical, 7)
                                            .foregroundStyle(filter == f ? Palette.bg : Palette.muted)
                                            .background { if filter == f { Capsule().fill(Palette.ink).matchedGeometryEffect(id: "f", in: ns) } }
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                    .background(Palette.bg.opacity(0.95))
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 20)
        }
    }

    private func row(_ t: FlowFiCore.Transaction) -> some View {
        let flagged = Sanitizer.sanitize(t.description).flagged
        let acct = model.snapshot.accounts.first { $0.id == t.accountId }
        return Button { model.open(.transaction(t.id)) } label: {
            HStack(spacing: 12) {
                Text(initials(t.merchantName)).font(.system(size: 11, weight: .semibold)).frame(width: 36, height: 36)
                    .background(t.amountMinor > 0 ? Palette.accentSoft : Palette.bg, in: Circle())
                    .foregroundStyle(t.amountMinor > 0 ? Palette.accent : Palette.ink)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Text(t.merchantName).font(.system(size: 14, weight: .medium)).lineLimit(1)
                        if t.pending { Pill("Pending") }
                        if flagged { Pill("⛨ Memo", tone: .neg) }
                    }
                    Text("\(t.category) · \(acct?.type == .credit ? "Card" : acct?.name.split(separator: " ").first.map(String.init) ?? "") ••\(acct?.mask ?? "") · \(t.businessUse.rawValue)")
                        .font(.system(size: 11)).foregroundStyle(Palette.muted).lineLimit(1)
                }
                Spacer()
                Text(Money.format(t.amountMinor, sign: true)).font(.system(size: 14, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(t.amountMinor > 0 ? Palette.accent : Palette.ink)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
