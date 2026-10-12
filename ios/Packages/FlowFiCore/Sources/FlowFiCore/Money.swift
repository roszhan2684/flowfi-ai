// Money is always integer minor units (cents). Never Double for stored or
// authoritative values; scaled results round half away from zero.

public typealias Minor = Int

public enum Money {
    public static func sum(_ values: [Minor]) -> Minor { values.reduce(0, +) }

    public static func round(_ value: Double) -> Minor {
        value < 0 ? -Int((-value).rounded(.toNearestOrAwayFromZero)) : Int(value.rounded(.toNearestOrAwayFromZero))
    }

    public static func scale(_ value: Minor, _ factor: Double) -> Minor { round(Double(value) * factor) }

    static func grouped(_ n: Int) -> String {
        let s = String(n)
        var out = ""
        for (i, ch) in s.enumerated() {
            if i > 0 && (s.count - i) % 3 == 0 { out.append(",") }
            out.append(ch)
        }
        return out
    }

    /// "$1,234.56", "−$1,234.56" (true minus sign), "+$12" with `sign`.
    public static func format(_ minor: Minor, cents: Bool = true, sign: Bool = false) -> String {
        let a = abs(minor)
        let body: String
        if cents {
            let c = a % 100
            body = "$\(grouped(a / 100)).\(c < 10 ? "0" : "")\(c)"
        } else {
            body = "$\(grouped(Int((Double(a) / 100).rounded(.toNearestOrAwayFromZero))))"
        }
        if minor < 0 { return "−" + body }
        return sign && minor > 0 ? "+" + body : body
    }
}
