"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { formatShortDate } from "@/lib/core/dates";
import { formatMoney } from "@/lib/core/money";
import { useSnap } from "@/lib/client";
import { useDemo } from "@/lib/store";
import { Money } from "../shared/Money";
import { Card, EASE, ErrorState, Label, Pill, Skeleton, syncedLabel, useNav } from "./ui";

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: 0.04 * i, ease: EASE },
});

export function HomeScreen() {
  const { data, error, retry } = useSnap();
  const nav = useNav();
  const completeTour = useDemo((s) => s.completeTour);
  const followUps = useDemo((s) => s.followUps);
  const enabled = useDemo((s) => s.enabledPresets);
  const setStale = useDemo((s) => s.setStale);

  useEffect(() => {
    if (data) completeTour("cash");
  }, [data, completeTour]);

  if (error && !data) return <ErrorState message={error} retry={retry} />;
  if (!data) return <HomeSkeleton />;

  const f = data.forecasts.base;
  const fs = data.flowScore;
  const upcoming = f.points.flatMap((p) => p.events).slice(0, 5);
  const pos = fs.factors.filter((x) => x.direction === "positive").sort((a, b) => b.points - a.points)[0];
  const neg = fs.factors.filter((x) => x.direction === "negative").sort((a, b) => b.max - b.points - (a.max - a.points))[0];
  const drafted = !!followUps.inv_104;

  return (
    <div className="space-y-3 px-4 pt-2 pb-6">
      <motion.div {...stagger(0)} className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-full bg-app-ink text-[12px] font-semibold text-white">NS</div>
          <div>
            <div className="text-[14px] leading-tight font-semibold">{data.workspace.name}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-app-muted">
              <span className={`size-1.5 rounded-full ${data.freshness.stale ? "bg-app-risk" : "bg-app-accent"}`} />
              {data.freshness.stale ? `Stale · ${data.freshness.ageHours}h old` : `Synced ${syncedLabel(data.freshness.syncedAt)}`}
            </div>
          </div>
        </div>
        <Pill tone="neutral">Demo data</Pill>
      </motion.div>

      {data.freshness.stale && (
        <motion.div {...stagger(1)}>
          <Card tone="risk" className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-app-risk">Bank data is {data.freshness.ageHours}h old</div>
              <div className="text-[11px] text-app-muted">Showing last good state.</div>
            </div>
            <button onClick={() => setStale(false)} className="rounded-full bg-app-ink px-3 py-1.5 text-[12px] font-medium text-white">
              Retry sync
            </button>
          </Card>
        </motion.div>
      )}

      <motion.div {...stagger(1)} data-tour="cash">
        <Card>
          <Label>Cash available today</Label>
          <Money minor={data.cash.availableMinor} className="mt-1 block text-[38px] leading-none font-semibold tracking-tight" />
          <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-app-muted">
            {data.accounts
              .filter((a) => a.type === "depository")
              .map((a) => (
                <span key={a.id} className="tnum">
                  {a.name} ••{a.mask} {formatMoney(a.balanceMinor, { cents: false })}
                </span>
              ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[7, 14, 30].map((d) => {
              const p = f.points[d];
              const low = p.balanceMinor < f.floorMinor;
              return (
                <button key={d} onClick={() => nav.go("cash")} className={`rounded-2xl p-2.5 text-left ${low ? "bg-app-risk-soft" : "bg-app-bg"}`}>
                  <div className="text-[10px] text-app-muted">In {d} days</div>
                  <Money minor={p.balanceMinor} cents={false} className={`text-[14px] font-semibold ${low ? "text-app-risk" : ""}`} />
                </button>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {f.breach ? (
        <motion.div {...stagger(2)}>
          <Card tone="risk">
            <div className="flex items-center gap-2">
              <Pill tone="risk">⚠ Threshold risk</Pill>
              <span className="text-[11px] text-app-muted">{f.scenario} scenario</span>
            </div>
            <div className="mt-2 text-[16px] leading-snug font-semibold">
              Cash may dip below {formatMoney(f.floorMinor, { cents: false })} on {formatShortDate(f.breach.firstDate)}
            </div>
            <div className="mt-1 text-[12px] text-app-muted">
              Low of <span className="tnum font-medium text-app-ink">{formatMoney(f.breach.minBalanceMinor)}</span> — {formatMoney(f.breach.shortfallMinor)} under your floor.
            </div>
            <button data-tour="why" onClick={() => nav.open({ kind: "why" })} className="mt-3 rounded-full bg-app-ink px-4 py-2 text-[13px] font-medium text-white">
              Why?
            </button>
          </Card>
        </motion.div>
      ) : (
        <motion.div {...stagger(2)}>
          <Card tone="accent">
            <Pill tone="accent">✓ Clear</Pill>
            <div className="mt-2 text-[16px] font-semibold">Above your {formatMoney(f.floorMinor, { cents: false })} floor for 30 days</div>
            <div className="mt-1 text-[12px] text-app-muted">
              Lowest <span className="tnum font-medium text-app-ink">{formatMoney(f.minPoint.balanceMinor)}</span> on {formatShortDate(f.minPoint.date)}
              {enabled.length ? " · with your scenario assumptions" : ""}
            </div>
          </Card>
        </motion.div>
      )}

      <motion.div {...stagger(3)}>
        <Card tone="ink" onClick={() => (drafted ? nav.go("cash") : nav.ask("What should I do?"))}>
          <div className="text-[11px] font-medium tracking-wide text-white/50 uppercase">Next best step</div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="text-[16px] leading-snug font-semibold">
              {drafted ? "Follow-up saved. Model “INV-104 paid on time”" : "Nudge Lumen Health about INV-104"}
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10">→</span>
          </div>
          <div className="mt-1 text-[12px] text-white/60">{drafted ? "See how the forecast changes" : "Ask FlowFi · $6,800 expected 10 days late"}</div>
        </Card>
      </motion.div>

      <motion.div {...stagger(4)}>
        <Card>
          <div className="flex items-center justify-between">
            <Label>Upcoming</Label>
            <button onClick={() => nav.go("cash")} className="text-[12px] font-medium text-app-accent">
              All
            </button>
          </div>
          <ul className="mt-2 divide-y divide-app-line">
            {upcoming.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-9 shrink-0 text-center">
                    <div className="text-[9px] text-app-muted uppercase">{formatShortDate(e.date).split(" ")[0]}</div>
                    <div className="tnum text-[15px] leading-none font-semibold">{formatShortDate(e.date).split(" ")[1]}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{e.name}</div>
                    <div className="text-[11px] text-app-muted">
                      {e.type === "invoice" ? `Invoice · ${Math.round(e.confidence * 100)}% confidence` : e.type === "obligation" ? "Card statement" : "Recurring"}
                    </div>
                  </div>
                </div>
                <span className={`tnum text-[13px] font-semibold ${e.amountMinor > 0 ? "text-app-accent" : ""}`}>{formatMoney(e.amountMinor, { sign: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
      </motion.div>

      <motion.div {...stagger(5)}>
        <Card onClick={() => nav.go("more", "score")}>
          <div className="flex items-center justify-between">
            <Label>FlowScore</Label>
            <span className="text-[10px] text-app-faint">Not a credit score</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tnum text-[32px] font-semibold tracking-tight">{fs.score}</span>
            <span className="text-[13px] text-app-muted">/ 100</span>
            <Pill tone={fs.score >= 60 ? "accent" : "risk"}>{fs.band}</Pill>
          </div>
          <div className="mt-2 space-y-1 text-[12px]">
            {pos && (
              <div className="flex justify-between">
                <span>
                  <span className="text-app-accent">▲</span> {pos.label}
                </span>
                <span className="tnum text-app-muted">+{pos.points}</span>
              </div>
            )}
            {neg && (
              <div className="flex justify-between">
                <span>
                  <span className="text-app-risk">▼</span> {neg.label}
                </span>
                <span className="tnum text-app-muted">−{neg.max - neg.points}</span>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      <motion.div {...stagger(6)}>
        <button onClick={() => nav.go("copilot")} className="flex w-full items-center gap-3 rounded-full border border-app-line bg-app-card py-3 pr-3 pl-4 text-left text-[14px] text-app-muted">
          <span className="text-app-accent">✦</span>
          Ask FlowFi about your cash…
        </button>
      </motion.div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-44 w-full rounded-[22px]" />
      <Skeleton className="h-32 w-full rounded-[22px]" />
      <Skeleton className="h-24 w-full rounded-[22px]" />
      <Skeleton className="h-52 w-full rounded-[22px]" />
    </div>
  );
}
