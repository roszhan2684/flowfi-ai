// Calendar-date helpers. Dates are ISO "YYYY-MM-DD" strings interpreted in UTC
// so forecasts never shift because of the host machine's timezone.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Same day-of-month N months later, clamped to the last day of short months. */
export function addMonths(date: ISODate, months: number, anchorDay?: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return fromUTC(Date.UTC(ny, nm, day));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function formatShortDate(date: ISODate): string {
  return new Date(toUTC(date)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
