import SwiftUI
import UIKit

/// Design tokens shared with the web app. Every color adapts to light/dark.
enum Palette {
    static let bg = Color(light: 0xF4F3EF, dark: 0x060807)
    static let card = Color(light: 0xFFFFFF, dark: 0x111514)
    static let raised = Color(light: 0xECEBE5, dark: 0x1A201E)
    static let ink = Color(light: 0x0D1110, dark: 0xEEF1EC)
    static let muted = Color(light: 0x6B716E, dark: 0x8E9691)
    static let faint = Color(light: 0x9CA19E, dark: 0x636B67)
    static let line = Color(light: 0xE7E5DF, dark: 0x222927)
    static let accent = Color(light: 0x0E7A52, dark: 0x9EF0C0)
    static let accentSoft = Color(light: 0xE2F3E9, dark: 0x16301F)
    static let onAccent = Color(light: 0xFFFFFF, dark: 0x062014)
    static let risk = Color(light: 0xA35F00, dark: 0xFFB547)
    static let riskSoft = Color(light: 0xFFF1D9, dark: 0x30240E)
    static let neg = Color(light: 0xC2412F, dark: 0xFF7A6B)
    static let negSoft = Color(light: 0xFDE8E4, dark: 0x351814)
    /// The always-dark "hero" card (next best step, tour card).
    static let slab = Color(light: 0x0D1110, dark: 0x1C2321)
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

enum Appearance: String, CaseIterable, Codable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var scheme: ColorScheme? { self == .light ? .light : self == .dark ? .dark : nil }
}

extension Font {
    static func display(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font { .system(size: size, weight: weight, design: .default) }
    static func mono(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .monospaced) }
    /// Editorial italic accent ("dip"), New York.
    static func serifItalic(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif).italic() }
}

extension Animation {
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.5)
}
