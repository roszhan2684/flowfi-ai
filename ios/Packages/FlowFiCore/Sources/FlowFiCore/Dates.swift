// Calendar-date helpers. Dates are ISO "yyyy-MM-dd" strings converted to a day
// number with pure civil-calendar math, so forecasts never shift with the
// device's timezone or calendar settings.

public typealias ISODate = String

public enum Dates {
    /// Days since 1970-01-01 (Howard Hinnant's days_from_civil).
    public static func dayNumber(_ date: ISODate) -> Int {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        precondition(parts.count == 3, "invalid ISO date \(date)")
        var y = parts[0]
        let m = parts[1], d = parts[2]
        y -= m <= 2 ? 1 : 0
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    public static func fromDayNumber(_ z0: Int) -> ISODate {
        let z = z0 + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp + (mp < 10 ? 3 : -9)
        let y = yoe + era * 400 + (m <= 2 ? 1 : 0)
        return iso(y, m, d)
    }

    static func iso(_ y: Int, _ m: Int, _ d: Int) -> ISODate {
        func pad(_ n: Int, _ w: Int) -> String { String(repeating: "0", count: max(0, w - String(n).count)) + String(n) }
        return "\(pad(y, 4))-\(pad(m, 2))-\(pad(d, 2))"
    }

    public static func addDays(_ date: ISODate, _ days: Int) -> ISODate { fromDayNumber(dayNumber(date) + days) }
    public static func diffDays(_ a: ISODate, _ b: ISODate) -> Int { dayNumber(a) - dayNumber(b) }

    static func daysInMonth(_ y: Int, _ m: Int) -> Int {
        switch m {
        case 2: return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }

    /// Same day-of-month N months later, clamped to short months.
    public static func addMonths(_ date: ISODate, _ months: Int, anchorDay: Int? = nil) -> ISODate {
        let p = date.split(separator: "-").compactMap { Int($0) }
        let total = p[0] * 12 + (p[1] - 1) + months
        let y = total / 12, m = total % 12 + 1
        return iso(y, m, min(anchorDay ?? p[2], daysInMonth(y, m)))
    }

    public static func day(_ date: ISODate) -> Int { Int(date.suffix(2)) ?? 1 }
    public static func monthKey(_ date: ISODate) -> String { String(date.prefix(7)) }

    static let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// "Oct 23"
    public static func short(_ date: ISODate) -> String {
        let p = date.split(separator: "-").compactMap { Int($0) }
        return "\(monthNames[p[1] - 1]) \(p[2])"
    }
}
