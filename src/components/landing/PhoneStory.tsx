"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { buildSnapshot } from "@/lib/core/engine";
import { formatShortDate } from "@/lib/core/dates";
import { formatMoney } from "@/lib/core/money";
import { ForecastChart } from "../shared/ForecastChart";
import { HoldButton } from "../shared/HoldButton";
import { EASE } from "./primitives";

const STEPS = [
  { k: "01", title: "See it.", sub: "Thirty days ahead, every day." },
  { k: "02", title: "Know why.", sub: "Drivers, not vibes." },
  { k: "03", title: "Approve the fix.", sub: "Nothing happens until you hold." },
];

export function PhoneFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-[52px] bg-[#1a1d1c] p-[10px] shadow-[0_50px_100px_-30px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,255,255,0.08)] ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-[42px] bg-app-bg text-app-ink">
        <div className="absolute top-2.5 left-1/2 z-30 h-[28px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
        {children}
      </div>
    </div>
  );
}

export function PhoneStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setStep(Math.min(2, Math.floor(v * 3))));
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [-6, 0, 4]);
  const bar = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const snap = useMemo(() => buildSnapshot(), []);

  return (
    <section ref={ref} className="relative h-[320vh]">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-2 px-4 md:grid-cols-[1fr_auto] md:gap-10 md:px-10 xl:px-16">
          <div className="relative z-10">
            <div className="mb-8 h-px w-40 overflow-hidden bg-line-strong">
              <motion.div className="h-full bg-accent" style={{ width: bar }} />
            </div>
            <ol className="space-y-3 md:space-y-5">
              {STEPS.map((s, i) => (
                <motion.li key={s.k} animate={{ opacity: i === step ? 1 : 0.18, x: i === step ? 0 : -6 }} transition={{ duration: 0.5, ease: EASE }}>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[12px] text-accent">{s.k}</span>
                    <span className="text-[clamp(34px,6vw,76px)] leading-[1] font-medium tracking-[-0.04em]">{s.title}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {i === step && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 ml-9 text-[16px] text-muted"
                      >
                        {s.sub}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.li>
              ))}
            </ol>
          </div>

          <motion.div style={{ rotate }} className="mx-auto">
            <PhoneFrame className="h-[660px] w-[320px] max-md:-my-[128px] max-md:scale-[0.6]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 40, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -30, filter: "blur(6px)" }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="absolute inset-0 px-5 pt-14"
                >
                  {step === 0 && <ScreenSee snap={snap} />}
                  {step === 1 && <ScreenWhy snap={snap} />}
                  {step === 2 && <ScreenApprove />}
                </motion.div>
              </AnimatePresence>
            </PhoneFrame>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

type Snap = ReturnType<typeof buildSnapshot>;

function ScreenSee({ snap }: { snap: Snap }) {
  const f = snap.forecasts.base;
  return (
    <div>
      <div className="text-[12px] text-app-muted">Cash today</div>
      <div className="tnum text-[34px] font-semibold tracking-tight">{formatMoney(snap.cash.availableMinor)}</div>
      <div className="mt-4 rounded-3xl bg-app-card p-3 shadow-sm">
        <ForecastChart points={f.points} floorMinor={f.floorMinor} height={150} interactive={false} summary="Forecast" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5, ease: EASE }}
        className="mt-4 rounded-3xl bg-app-risk-soft p-4"
      >
        <div className="text-[11px] font-semibold tracking-wide text-app-risk uppercase">Threshold risk</div>
        <div className="mt-1 text-[15px] leading-snug font-medium">Cash may dip below $5,000 on {formatShortDate(f.breach!.firstDate)}</div>
      </motion.div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[7, 14, 30].map((d) => (
          <div key={d} className="rounded-2xl bg-app-card p-3 shadow-sm">
            <div className="text-[10px] text-app-muted">{d} days</div>
            <div className="tnum text-[13px] font-semibold">{formatMoney(f.points[d].balanceMinor, { cents: false })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenWhy({ snap }: { snap: Snap }) {
  const f = snap.forecasts.base;
  const max = Math.max(...f.drivers.map((d) => Math.abs(d.impactMinor)));
  return (
    <div>
      <div className="text-[12px] text-app-muted">Why {formatShortDate(f.minPoint.date)} dips</div>
      <div className="tnum text-[28px] font-semibold tracking-tight">{formatMoney(f.minPoint.balanceMinor)}</div>
      <div className="mt-5 space-y-4">
        {f.drivers.map((d, i) => (
          <div key={d.name}>
            <div className="flex justify-between gap-3 text-[12px]">
              <span className="truncate font-medium">{d.type === "invoice_delay" ? "INV-104 paid late" : d.name}</span>
              <span className="tnum text-app-muted">{formatMoney(d.impactMinor, { cents: false })}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-app-line">
              <motion.div
                className={`h-full rounded-full ${i < 2 ? "bg-app-risk" : "bg-app-ink/70"}`}
                initial={{ width: 0 }}
                animate={{ width: `${(Math.abs(d.impactMinor) / max) * 100}%` }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.8, ease: EASE }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-app-line bg-app-card p-3 text-[11px] leading-relaxed text-app-muted">
        Lumen Health paid INV-097 and INV-101 an average of 10 days late. FlowFi expects INV-104 on Oct 30.
      </div>
    </div>
  );
}

function ScreenApprove() {
  return (
    <div className="flex h-full flex-col pb-8">
      <div className="text-[12px] text-app-muted">Proposed by copilot</div>
      <div className="mt-1 text-[20px] leading-tight font-semibold">Follow-up draft for INV-104</div>
      <div className="mt-4 rounded-3xl bg-app-card p-4 text-[12px] leading-relaxed shadow-sm">
        <div className="text-[11px] text-app-muted">To Lumen Health · draft only</div>
        <p className="mt-2">Hi Lumen Health team — a friendly heads-up that INV-104 ($6,800.00) is due Oct 20. Could you confirm it’s scheduled?</p>
      </div>
      <div className="mt-3 flex gap-2 text-[11px]">
        <span className="rounded-full bg-app-accent-soft px-2.5 py-1 font-medium text-app-accent">Low risk</span>
        <span className="rounded-full bg-app-line px-2.5 py-1 text-app-muted">Not sent</span>
      </div>
      <div className="mt-auto flex justify-center">
        <HoldButton onConfirm={() => {}} />
      </div>
    </div>
  );
}
