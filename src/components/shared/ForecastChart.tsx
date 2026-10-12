"use client";

import { motion } from "motion/react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { formatShortDate } from "@/lib/core/dates";
import { formatMoney } from "@/lib/core/money";

export type ChartPoint = {
  date: string;
  balanceMinor: number;
  events?: Array<{ name: string; amountMinor: number }>;
};

export type ChartScales = {
  xPct: (i: number) => number;
  yPct: (v: number) => number;
  count: number;
};

const W = 1000;
const SPRING = { type: "spring", stiffness: 140, damping: 22, mass: 0.9 } as const;

/**
 * Daily balance chart. Straight segments (no smoothing that would invent
 * values), a dashed safety floor, and the part of the line under the floor
 * redrawn in the risk color. Scrub with pointer or arrow keys for exact values.
 */
export function ForecastChart({
  points,
  band,
  floorMinor,
  tone = "light",
  height = 220,
  interactive = true,
  markers = true,
  summary,
  domain,
  overlay,
  onScrub,
  drawOnMount = true,
}: {
  points: ChartPoint[];
  band?: Array<{ lowerMinor: number; upperMinor: number }>;
  floorMinor: number;
  tone?: "light" | "dark";
  height?: number;
  interactive?: boolean;
  markers?: boolean;
  summary: string;
  domain?: [number, number];
  overlay?: (s: ChartScales) => ReactNode;
  onScrub?: (index: number | null) => void;
  drawOnMount?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const H = height;
  const top = 18;
  const bottom = 14;

  const { lo, hi } = useMemo(() => {
    if (domain) return { lo: domain[0], hi: domain[1] };
    const vals = [...points.map((p) => p.balanceMinor), floorMinor, ...(band ?? []).flatMap((b) => [b.lowerMinor, b.upperMinor])];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.12 || 1;
    return { lo: min - pad, hi: max + pad };
  }, [points, band, floorMinor, domain]);

  const n = points.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (H - top - bottom);
  const scales: ChartScales = { xPct: (i) => (x(i) / W) * 100, yPct: (v) => (y(v) / H) * 100, count: n };

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.balanceMinor).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const bandPath = band
    ? `${band.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(b.upperMinor).toFixed(2)}`).join(" ")} ${band
        .map((_, i) => band.length - 1 - i)
        .map((i) => `L${x(i).toFixed(2)},${y(band[i].lowerMinor).toFixed(2)}`)
        .join(" ")} Z`
    : null;
  const floorY = y(floorMinor);

  const c =
    tone === "light"
      ? { line: "var(--app-ink)", risk: "var(--app-risk)", grid: "var(--app-line)", area: "var(--app-accent)", band: "var(--app-ink)", text: "var(--app-muted)", tipBg: "var(--app-ink)", tipFg: "#fff" }
      : { line: "var(--fg)", risk: "var(--risk)", grid: "var(--line-strong)", area: "var(--accent)", band: "var(--fg)", text: "var(--muted)", tipBg: "var(--fg)", tipFg: "var(--bg)" };

  const set = (i: number | null) => {
    setActive(i);
    onScrub?.(i);
  };
  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    set(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };

  const p = active !== null ? points[active] : null;

  return (
    <div className="relative w-full select-none" style={{ height: H }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={summary}>
        <defs>
          <linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={c.area} stopOpacity={tone === "light" ? 0.14 : 0.22} />
            <stop offset="100%" stopColor={c.area} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`under-${id}`}>
            <motion.rect x="0" width={W} height={H} initial={false} animate={{ y: floorY }} transition={SPRING} />
          </clipPath>
          <clipPath id={`reveal-${id}`}>
            <motion.rect x="0" y="-20" height={H + 40} initial={{ width: drawOnMount ? 0 : W }} animate={{ width: W }} transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }} />
          </clipPath>
        </defs>

        <g clipPath={`url(#reveal-${id})`}>
          {bandPath && <motion.path initial={false} animate={{ d: bandPath }} transition={SPRING} fill={c.band} opacity={0.06} />}
          <motion.path initial={false} animate={{ d: area }} transition={SPRING} fill={`url(#area-${id})`} />
          <motion.path initial={false} animate={{ d: line }} transition={SPRING} fill="none" stroke={c.line} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <g clipPath={`url(#under-${id})`}>
            <motion.path initial={false} animate={{ d: line }} transition={SPRING} fill="none" stroke={c.risk} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        </g>
        <motion.line x1="0" x2={W} initial={false} animate={{ y1: floorY, y2: floorY }} transition={SPRING} stroke={c.risk} strokeWidth={1} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" opacity={0.85} />
      </svg>

      <motion.span
        className="pointer-events-none absolute right-0 -translate-y-full pb-1 text-[10px] font-medium tracking-wide uppercase"
        style={{ color: c.risk }}
        initial={false}
        animate={{ top: `${(floorY / H) * 100}%` }}
        transition={SPRING}
      >
        {formatMoney(floorMinor, { cents: false })} floor
      </motion.span>

      {markers &&
        points.map((pt, i) =>
          pt.events?.length ? (
            <motion.span
              key={pt.date}
              aria-hidden
              className="pointer-events-none absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{
                left: `${scales.xPct(i)}%`,
                borderColor: tone === "light" ? "var(--app-card)" : "var(--bg)",
                background: pt.events.reduce((a, e) => a + e.amountMinor, 0) >= 0 ? (tone === "light" ? "var(--app-accent)" : "var(--accent)") : pt.balanceMinor < floorMinor ? c.risk : c.line,
              }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1, top: `${scales.yPct(pt.balanceMinor)}%` }}
              transition={{ ...SPRING, delay: drawOnMount ? 0.4 + (i / n) * 1 : 0 }}
            />
          ) : null,
        )}

      {overlay?.(scales)}

      {interactive && (
        <div
          className="absolute inset-0 cursor-crosshair touch-pan-y outline-none"
          tabIndex={0}
          aria-label="Forecast chart. Use left and right arrow keys to read daily balances."
          onPointerMove={fromPointer}
          onPointerDown={fromPointer}
          onPointerLeave={() => set(null)}
          onBlur={() => set(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") set(Math.min(n - 1, (active ?? -1) + 1));
            if (e.key === "ArrowLeft") set(Math.max(0, (active ?? 1) - 1));
            if (e.key === "Escape") set(null);
          }}
        />
      )}

      {p && active !== null && (
        <>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px" style={{ left: `${scales.xPct(active)}%`, background: c.grid }} />
          <div
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: `${scales.xPct(active)}%`, top: `${scales.yPct(p.balanceMinor)}%`, background: c.line, borderColor: tone === "light" ? "#fff" : "var(--bg)" }}
          />
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[136px] rounded-xl px-3 py-2 text-[11px] shadow-xl"
            style={{
              left: `${Math.min(Math.max(scales.xPct(active), 14), 86)}%`,
              transform: "translate(-50%, -105%)",
              background: c.tipBg,
              color: c.tipFg,
            }}
          >
            <div className="opacity-60">{formatShortDate(p.date)}{active === 0 ? " · today" : ""}</div>
            <div className="tnum text-[14px] font-semibold">{formatMoney(p.balanceMinor)}</div>
            {p.events?.slice(0, 2).map((e) => (
              <div key={e.name} className="tnum mt-0.5 flex justify-between gap-3 opacity-80">
                <span className="truncate">{e.name.split(" · ")[0]}</span>
                <span>{formatMoney(e.amountMinor, { cents: false, sign: true })}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {p ? `${formatShortDate(p.date)}: ${formatMoney(p.balanceMinor)}` : ""}
      </span>
    </div>
  );
}
