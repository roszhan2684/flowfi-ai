"use client";

import NumberFlow from "@number-flow/react";

/** Animated currency. Digits morph on change; tabular numerals keep columns still. */
export function Money({
  minor,
  cents = true,
  className = "",
  sign = false,
}: {
  minor: number;
  cents?: boolean;
  className?: string;
  sign?: boolean;
}) {
  return (
    <NumberFlow
      value={minor / 100}
      className={`tnum ${className}`}
      locales="en-US"
      format={{
        style: "currency",
        currency: "USD",
        minimumFractionDigits: cents ? 2 : 0,
        maximumFractionDigits: cents ? 2 : 0,
        signDisplay: sign ? "exceptZero" : "auto",
      }}
      transformTiming={{ duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" }}
      spinTiming={{ duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" }}
    />
  );
}

export function Count({ value, className = "", suffix }: { value: number; className?: string; suffix?: string }) {
  return <NumberFlow value={value} className={`tnum ${className}`} suffix={suffix} locales="en-US" />;
}
