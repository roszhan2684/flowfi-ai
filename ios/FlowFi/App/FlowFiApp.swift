import FlowFiCore
import SwiftUI

@main
struct FlowFiApp: App {
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(model.appearance.scheme)
                .onChange(of: phase) { _, p in
                    // App lock: re-lock whenever FlowFi leaves the foreground.
                    if p == .background, model.vault.appLockEnabled { model.locked = true }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                ZStack {
                    screen
                        .id(screenKey)
                        .transition(.asymmetric(insertion: .opacity.combined(with: .offset(x: model.page == nil ? 0 : 36)), removal: .opacity))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if !model.keyboardVisible { TabBar() }
            }
            .background(Palette.bg.ignoresSafeArea())

            SheetLayer()
        }
        .overlayPreferenceValue(TourAnchorKey.self) { anchors in
            TourOverlay(anchors: anchors)
        }
        .overlay {
            if model.locked { LockView().transition(.opacity) }
        }
        .animation(.ease, value: model.locked)
    }

    private var screenKey: String { "\(model.tab.rawValue):\(model.page?.rawValue ?? "")" }

    @ViewBuilder private var screen: some View {
        switch (model.tab, model.page) {
        case (.home, _): HomeView()
        case (.cash, _): CashFlowView()
        case (.activity, _): ActivityView()
        case (.copilot, _): CopilotView()
        case (.more, .alerts?): AlertsView()
        case (.more, .score?): ScoreView()
        case (.more, .invoices?): InvoicesView()
        case (.more, .audit?): AuditView()
        case (.more, .sync?): SyncView()
        case (.more, .settings?): SettingsView()
        case (.more, nil): MoreView()
        }
    }
}

struct TabBar: View {
    @Environment(AppModel.self) private var model
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases) { t in
                let active = model.tab == t
                Button { model.go(t) } label: {
                    VStack(spacing: 3) {
                        ZStack {
                            if active { Capsule().fill(Palette.ink).frame(width: 22, height: 3).matchedGeometryEffect(id: "dot", in: ns).offset(y: -15) }
                            Image(systemName: t.icon).font(.system(size: 18, weight: active ? .semibold : .regular))
                                .symbolEffect(.bounce, value: active)
                        }
                        .frame(height: 24)
                        Text(t.title).font(.system(size: 10, weight: .medium))
                    }
                    .foregroundStyle(active ? Palette.ink : Palette.faint)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(.top, 8).padding(.bottom, 2)
        .background(Palette.bg.opacity(0.96).ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Rectangle().fill(Palette.line).frame(height: 0.5) }
    }
}

/// Bottom sheets live in the same hierarchy as the app so the tour can highlight inside them.
struct SheetLayer: View {
    @Environment(AppModel.self) private var model
    @State private var drag: CGFloat = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            if let sheet = model.sheet {
                Color.black.opacity(0.32).ignoresSafeArea()
                    .onTapGesture { model.open(nil) }
                    .transition(.opacity)
                VStack(spacing: 0) {
                    Capsule().fill(Palette.line).frame(width: 40, height: 5).padding(.top, 9).padding(.bottom, 8)
                        .frame(maxWidth: .infinity).contentShape(Rectangle())
                        .gesture(DragGesture().onChanged { drag = max(0, $0.translation.height) }.onEnded { v in
                            if v.translation.height > 110 || v.predictedEndTranslation.height > 400 { model.open(nil) }
                            withAnimation(.spring) { drag = 0 }
                        })
                    SheetContent(sheet: sheet).padding(.horizontal, 20).padding(.bottom, 34)
                }
                .frame(maxWidth: .infinity)
                .background(Palette.bg, in: UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous))
                .shadow(color: .black.opacity(0.2), radius: 30)
                .offset(y: drag)
                .transition(.move(edge: .bottom))
                .accessibilityAddTraits(.isModal)
            }
        }
        .ignoresSafeArea(edges: .bottom)
    }
}

struct LockView: View {
    @Environment(AppModel.self) private var model
    @State private var failed = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "lock.shield").font(.system(size: 48, weight: .light)).foregroundStyle(Palette.accent)
            Text("FlowFi is locked").font(.display(24))
            Text(failed ? "Authentication failed. FlowFi stays locked." : "Unlock with \(model.vault.biometricAvailability().rawValue).")
                .font(.system(size: 14)).foregroundStyle(failed ? Palette.neg : Palette.muted)
            Spacer()
            Button("Unlock") { Task { await unlock() } }
                .buttonStyle(PrimaryButtonStyle()).padding(.horizontal, 40).padding(.bottom, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.bg.ignoresSafeArea())
        .task { await unlock() }
    }

    private func unlock() async {
        let ok = await model.vault.authenticate(reason: "Unlock FlowFi")
        failed = !ok
        if ok { model.locked = false }
    }
}
