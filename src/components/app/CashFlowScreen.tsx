"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatShortDate } from "@/lib/core/dates";
import { SCENARIO_RULES, type Scenario } from "@/lib/core/forecast";
import { formatMoney } from "@/lib/core/money";
import { useSnap } from "@/lib/client";
import { PRESETS, useDemo } from "@/lib/store";
import { ForecastChart } from "../shared/ForecastChart";
import { Money } from "../shared/Money";
import { Card, EASE, ErrorState, Label, Pill, ScreenHeader, Segmented, Skeleton, Switch } from "./ui";

export function CashFlowScreen() {
  const { data, error, retry, loading } = useSnap();
  const scenario = useDemo((s) => s.scenario);
  const setScenario = useDemo((s) => s.setScenario);
  const enabled = useDemo((s) => s.enabledPresets);
  const toggle = useDemo((s) => s.togglePreset);
  const completeTour = useDemo((s) => s.completeTour);
  const [showAssumptions, setShowAssumptions] = useState(false);

  // "What changed since last forecast": remember the previous run's low point.
  const last = useRef<{ id: string; low: number } | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const f = data?.forecasts[scenario];
  useEffect(() => {
    if (!f) return;
    if (last.current && last.current.id !== f.id) setDelta(f.minPoint.balanceMinor - last.current.low);
    last.current = { id: f.id, low: f.minPoint.balanceMinor };
  }, [f]);

  if (error && !data) return <ErrorState message={error} retry={retry} />;
  if (!data || !f)
    return (
      <div className="space-y-3 px-4 pt-14">
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-64 w-full rounded-[22px]" />
        <Skeleton className="h-40 w-full rounded-[22px]" />
      </div>
    );

  const events = f.points.filter((p) => p.events.length);

  return (
    <div className="pb-6">
      <ScreenHeader title="Cash flow" subtitle={`30 days from ${formatShortDate(f.asOf)} · ${f.modelVersion}`} />
      <div className="space-y-3 px-4">
        <Segmented<Scenario>
          id="scenario"
          value={scenario}
          onChange={setScenario}
          options={[
            ["conservative", "Conservative"],
            ["base", "Base"],
            ["optimistic", "Optimistic"],
          ]}
        />

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Lowest point</Label>
              <Money minor={f.minPoint.balanceMinor} className="mt-0.5 block text-[30px] leading-tight font-semibold tracking-tight" />
              <div className="text-[12px] text-app-muted">on {formatShortDate(f.minPoint.date)}</div>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={f.breach ? "r" : "c"} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                {f.breach ? <Pill tone="risk">⚠ Below floor {f.breach.daysBelow}d</Pill> : <Pill tone="accent">✓ Above floor</Pill>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
            <ForecastChart
              points={f.points}
              band={data.band}
              floorMinor={f.floorMinor}
              height={190}
              summary={`${scenario} forecast. Starts at ${formatMoney(f.startBalanceMinor)}, lowest ${formatMoney(f.minPoint.balanceMinor)} on ${formatShortDate(f.minPoint.date)}, ends at ${formatMoney(f.endBalanceMinor)}.`}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-app-muted">
            <span>Shaded: conservative ↔ optimistic range</span>
            <span>Drag to inspect</span>
          </div>
          <AnimatePresence>
            {delta !== null && delta !== 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`mt-3 rounded-xl px-3 py-2 text-[12px] ${delta > 0 ? "bg-app-accent-soft text-app-accent" : "bg-app-risk-soft text-app-risk"}`}>
                  Since last forecast: low point <span className="tnum font-semibold">{formatMoney(delta, { sign: true })}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div data-tour="presets">
        <Card>
          <Label>Try an assumption</Label>
          <ul className="mt-2 divide-y divide-app-line">
            {PRESETS.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-[14px] font-medium">{p.label}</div>
                  <div className="text-[11px] text-app-muted">{p.detail}</div>
                </div>
                <Switch
                  label={p.label}
                  on={enabled.includes(p.id)}
                  onChange={() => {
                    toggle(p.id);
                    if (p.id === "inv104_on_time") completeTour("presets");
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-app-muted">{SCENARIO_RULES[scenario].label}</div>
        </Card>
        </div>

        <Card>
          <button onClick={() => setShowAssumptions((v) => !v)} className="flex w-full items-center justify-between" aria-expanded={showAssumptions}>
            <Label>Model assumptions · {f.assumptions.length}</Label>
            <motion.span animate={{ rotate: showAssumptions ? 90 : 0 }} className="text-app-muted">
              ›
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showAssumptions && (
              <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ ease: EASE }} className="overflow-hidden">
                {f.assumptions.map((a) => (
                  <li key={a} className="mt-2 flex gap-2 text-[12px] leading-snug">
                    <span className="text-app-faint">•</span>
                    {a}
                  </li>
                ))}
                <li className="mt-3 text-[11px] text-app-faint">
                  Data as of {new Date(f.dataFreshness).toUTCString().slice(5, 22)} UTC · computed in {data.computeMs} ms · no LLM involved
                </li>
              </motion.ul>
            )}
          </AnimatePresence>
        </Card>

        <Card>
          <Label>Expected in & out</Label>
          <ul className="mt-1">
            {events.map((p) => (
              <li key={p.date} className="border-b border-app-line py-2.5 last:border-0">
                <div className="flex items-center justify-between text-[11px] text-app-muted">
                  <span>{formatShortDate(p.date)}</span>
                  <span className={`tnum ${p.balanceMinor < f.floorMinor ? "font-semibold text-app-risk" : ""}`}>
                    {formatMoney(p.balanceMinor, { cents: false })}
                    {p.balanceMinor < f.floorMinor ? " · below floor" : ""}
                  </span>
                </div>
                {p.events.map((e) => (
                  <div key={e.key} className="mt-1 flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate">
                      {e.name}
                      {e.note && <span className="ml-1.5 text-[10px] text-app-accent">{e.note}</span>}
                    </span>
                    <span className={`tnum font-medium ${e.amountMinor > 0 ? "text-app-accent" : ""}`}>{formatMoney(e.amountMinor, { sign: true })}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-app-muted">Plus {formatMoney(f.variableDailyMinor)}/day of day-to-day spend.</div>
        </Card>
      </div>
    </div>
  );
}
