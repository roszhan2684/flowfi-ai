// Money is always integer minor units (cents). Never floats for stored or
// authoritative values; division results are rounded half-away-from-zero.

export type Minor = number;

export function assertMinor(value: Minor, label = "amount"): Minor {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be an integer number of minor units, got ${value}`);
  }
  return value;
}

export function sumMinor(values: readonly Minor[]): Minor {
  return values.reduce((acc, v) => acc + assertMinor(v), 0);
}

export function roundMinor(value: number): Minor {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function scaleMinor(value: Minor, factor: number): Minor {
  return roundMinor(value * factor);
}

export function formatMoney(minor: Minor, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const { cents = true, sign = false } = opts;
  const abs = Math.abs(minor) / 100;
  const body = abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  if (minor < 0) return `−${body}`;
  return sign && minor > 0 ? `+${body}` : body;
}

export function formatCompact(minor: Minor): string {
  const abs = Math.abs(minor) / 100;
  const body =
    abs >= 1000
      ? `$${(abs / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
      : `$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return minor < 0 ? `−${body}` : body;
}
