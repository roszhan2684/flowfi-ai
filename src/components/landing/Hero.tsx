"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { buildSnapshot } from "@/lib/core/engine";
import { diffDays, formatShortDate } from "@/lib/core/dates";
import { ForecastChart } from "../shared/ForecastChart";
import { Money, Count } from "../shared/Money";
import { EASE, GhostButton, PrimaryButton } from "./primitives";

const AS_OF = "2026-10-12";
const EXPECTED_IDX = diffDays("2026-10-30", AS_OF);
const DUE_IDX = diffDays("2026-10-20", AS_OF);

export function Hero() {
  const [idx, setIdx] = useState(EXPECTED_IDX);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const snap = useMemo(
    () => buildSnapshot({ assumptions: idx === EXPECTED_IDX ? [] : [{ kind: "shift_event", eventKey: "inv:inv_104", days: idx - EXPECTED_IDX }] }),
    [idx],
  );
  const f = snap.forecasts.base;
  const domain = useMemo<[number, number]>(() => [320_000, 2_250_000], []);
  const date = f.points[idx]?.date ?? AS_OF;

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((clientX - r.left) / r.width) * (f.points.length - 1));
    setIdx(Math.max(1, Math.min(f.points.length - 1, i)));
  };

  return (
    <section className="grain relative overflow-hidden pt-28 pb-20 md:pt-36">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-1/2 h-[720px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative w-full px-4 md:px-10 xl:px-16">
        <motion.a
          href="/demo"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-line bg-surface/60 py-1 pr-3 pl-1 text-[12px] text-muted backdrop-blur"
        >
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">Live demo</span>
          Try it with a fictional studio’s books →
        </motion.a>

        <h1 className="text-center text-[clamp(44px,9.2vw,124px)] leading-[0.92] font-medium tracking-[-0.045em]">
          <motion.span className="block" initial={{ opacity: 0, y: 40, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1, ease: EASE }}>
            See the <span className="serif text-accent italic">dip</span>
          </motion.span>
          <motion.span className="block text-fg/90" initial={{ opacity: 0, y: 40, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 1, delay: 0.12, ease: EASE }}>
            before it happens.
          </motion.span>
        </h1>

        <motion.p
          className="mx-auto mt-7 max-w-md text-center text-[17px] leading-relaxed text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.35 }}
        >
          Cash-flow forecasts you can explain. A copilot that shows its work.
        </motion.p>

        <motion.div className="mt-9 flex flex-wrap justify-center gap-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.45, ease: EASE }}>
          <PrimaryButton href="/demo">Try the live demo</PrimaryButton>
          <GhostButton href="#forecast">How it works</GhostButton>
        </motion.div>

        <motion.div
          id="forecast"
          initial={{ opacity: 0, y: 60, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
          className="relative mt-14 w-full scroll-mt-28 rounded-[28px] select-none border border-line bg-surface/70 p-4 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl md:p-7"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Northstar Studio · next 30 days</div>
              <div className="mt-2 flex items-baseline gap-3">
                <Money minor={f.minPoint.balanceMinor} className="text-[34px] font-medium tracking-tight md:text-[44px]" />
                <span className="text-[13px] text-muted">lowest · {formatShortDate(f.minPoint.date)}</span>
              </div>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={f.breach ? "risk" : "clear"}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.35, ease: EASE }}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium ${f.breach ? "bg-risk/12 text-risk" : "bg-accent/12 text-accent"}`}
              >
                <span className={`size-1.5 rounded-full ${f.breach ? "bg-risk" : "bg-accent"}`} />
                {f.breach ? `Below $5k floor on ${formatShortDate(f.breach.firstDate)}` : "Clear of the $5k floor"}
              </motion.div>
            </AnimatePresence>
          </div>

          <div ref={box} className="relative mt-10 mb-14">
            <ForecastChart
              points={f.points.map((p) => ({ date: p.date, balanceMinor: p.balanceMinor, events: p.events }))}
              floorMinor={f.floorMinor}
              tone="dark"
              height={300}
              domain={domain}
              interactive={!dragging}
              summary={`30-day balance forecast. Lowest ${f.minPoint.balanceMinor / 100} dollars on ${formatShortDate(f.minPoint.date)}.`}
              overlay={(s) => (
                <>
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute top-0 bottom-0 w-px"
                    style={{ background: "linear-gradient(to bottom, transparent, var(--accent))" }}
                    animate={{ left: `${s.xPct(idx)}%`, opacity: dragging ? 1 : 0.5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                  <span aria-hidden className="pointer-events-none absolute -top-6 font-mono text-[10px] whitespace-nowrap text-dim" style={{ left: `${s.xPct(DUE_IDX)}%`, transform: "translateX(-50%)" }}>
                    INV-104 due ↓
                  </span>
                  <span aria-hidden className="pointer-events-none absolute -top-1 bottom-0 w-px border-l border-dashed border-line-strong" style={{ left: `${s.xPct(DUE_IDX)}%` }} />
                  <motion.button
                    type="button"
                    role="slider"
                    aria-label="INV-104 expected payment date"
                    aria-valuemin={1}
                    aria-valuemax={30}
                    aria-valuenow={idx}
                    aria-valuetext={formatShortDate(date)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") setIdx((i) => Math.max(1, i - 1));
                      if (e.key === "ArrowRight") setIdx((i) => Math.min(30, i + 1));
                      setTouched(true);
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDragging(true);
                      setTouched(true);
                    }}
                    onPointerMove={(e) => dragging && move(e.clientX)}
                    onPointerUp={() => setDragging(false)}
                    className="absolute -bottom-12 z-20 -translate-x-1/2 cursor-grab touch-none active:cursor-grabbing"
                    animate={{ left: `${s.xPct(idx)}%`, scale: dragging ? 1.08 : 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  >
                    <span className="flex items-center gap-2 rounded-full border border-accent/40 bg-bg px-3 py-1.5 text-[12px] whitespace-nowrap shadow-lg shadow-black/50">
                      <span className="size-2 rounded-full bg-accent" />
                      <span className="font-medium">INV-104</span>
                      <span className="tnum text-muted">$6.8k · {formatShortDate(date)}</span>
                    </span>
                  </motion.button>
                  <AnimatePresence>
                    {!touched && (
                      <motion.span
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, x: [0, -14, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ opacity: { delay: 2 }, x: { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 2 } }}
                        className="pointer-events-none absolute -bottom-[42px] font-mono text-[11px] whitespace-nowrap text-accent"
                        style={{ left: `calc(${s.xPct(idx)}% + 100px)` }}
                      >
                        ← drag the late invoice
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-line pt-5 text-[12px] text-muted md:gap-6">
            <Stat label="Cash today">
              <Money minor={snap.cash.availableMinor} cents={false} />
            </Stat>
            <Stat label="Day 30">
              <Money minor={f.endBalanceMinor} cents={false} />
            </Stat>
            <Stat label="FlowScore">
              <Count value={snap.flowScore.score} /> <span className="text-[13px] text-muted">{snap.flowScore.band}</span>
            </Stat>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.14em] text-dim uppercase">{label}</div>
      <div className="mt-1 text-[20px] font-medium text-fg md:text-[24px]">{children}</div>
    </div>
  );
}
