"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { buildSnapshot } from "@/lib/core/engine";
import type { FaultResult } from "@/lib/core/faultlab";
import { HoldButton } from "../shared/HoldButton";
import { LogoMark } from "../shared/Logo";
import { Count } from "../shared/Money";
import { EASE, Eyebrow, PrimaryButton, Reveal, SplitHeadline } from "./primitives";

const PRINCIPLES = ["Deterministic math", "Tool-grounded answers", "Human approval", "Replay-safe sync", "Audit everything", "Never moves money", "Stale data disclosed", "Integer cents only"];

export function Marquee() {
  return (
    <div className="mask-fade-x relative overflow-hidden border-y border-line py-5">
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-12 pr-12">
        {[...PRINCIPLES, ...PRINCIPLES].map((p, i) => (
          <span key={i} className="flex items-center gap-12 text-[15px] whitespace-nowrap text-muted">
            {p}
            <LogoMark size={16} className="text-dim" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Approve() {
  const [events, setEvents] = useState<string[]>([]);
  const [key, setKey] = useState(0);
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-40">
      <div className="grid items-center gap-14 md:grid-cols-2">
        <div>
          <Reveal>
            <Eyebrow>Approval boundary</Eyebrow>
          </Reveal>
          <h2 className="text-[clamp(36px,6vw,72px)] leading-[0.98] font-medium tracking-[-0.04em]">
            <SplitHeadline text="Nothing moves" /> <span className="serif text-accent italic"><SplitHeadline text="without you." delay={0.12} /></span>
          </h2>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-sm text-[17px] text-muted">AI proposes. You hold. Every write is audited.</p>
          </Reveal>
        </div>

        <Reveal delay={0.1} className="relative rounded-[32px] border border-line bg-surface p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">proposed_action</div>
              <div className="mt-2 text-[20px] font-medium">Follow-up draft · INV-104</div>
              <div className="mt-1 text-[14px] text-muted">Saved in FlowFi. Not sent.</div>
            </div>
            <span className="rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">Low risk</span>
          </div>
          <div className="my-10 flex justify-center" key={key}>
            <HoldButton
              tone="dark"
              size={112}
              onConfirm={() => {
                const t = new Date().toISOString().slice(11, 19);
                setEvents([`${t}  action.approved   method=hold_to_confirm`, `${t}  action.executed   sent=false`, `${t}  audit.appended    actor=user`]);
              }}
            />
          </div>
          <div className="min-h-[86px] rounded-2xl bg-bg/60 p-4 font-mono text-[11.5px] leading-6">
            <AnimatePresence>
              {events.length === 0 ? (
                <motion.div key="idle" exit={{ opacity: 0 }} className="text-dim">
                  audit_events — waiting for approval…
                </motion.div>
              ) : (
                events.map((e, i) => (
                  <motion.div key={e} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.18 }} className="truncate text-accent/90">
                    {e}
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
          {events.length > 0 && (
            <button onClick={() => { setEvents([]); setKey((k) => k + 1); }} className="mt-3 text-[12px] text-dim underline-offset-4 hover:text-muted hover:underline">
              Reset
            </button>
          )}
        </Reveal>
      </div>
    </section>
  );
}

export function Score() {
  const [onTime, setOnTime] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const snap = useMemo(() => buildSnapshot({ assumptions: onTime ? [{ kind: "invoice_on_due", invoiceId: "inv_104" }] : [] }), [onTime]);
  const fs = snap.flowScore;
  const shown = inView ? fs.score : 0;
  const R = 92;
  const C = Math.PI * R;

  return (
    <section className="relative mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-40">
      <Reveal>
        <Eyebrow>FlowScore</Eyebrow>
      </Reveal>
      <h2 className="max-w-3xl text-[clamp(36px,6vw,72px)] leading-[0.98] font-medium tracking-[-0.04em]">
        <SplitHeadline text="A score that" /> <span className="serif text-accent italic"><SplitHeadline text="shows its work." delay={0.12} /></span>
      </h2>

      <div ref={ref} className="mt-14 grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <Reveal className="flex flex-col items-center justify-center rounded-[32px] border border-line bg-surface p-8">
          <div className="relative w-full max-w-[280px]">
            <svg viewBox="0 0 220 120" className="w-full overflow-visible" aria-hidden>
              <path d={`M18 110 A${R} ${R} 0 0 1 202 110`} stroke="var(--line-strong)" strokeWidth="12" fill="none" strokeLinecap="round" />
              <motion.path
                d={`M18 110 A${R} ${R} 0 0 1 202 110`}
                stroke={fs.score >= 60 ? "var(--accent)" : "var(--risk)"}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: C * (1 - shown / 100) }}
                transition={{ duration: 1.4, ease: EASE }}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
              <Count value={shown} className="text-[64px] leading-none font-medium tracking-tight" />
              <div className={`mt-1 text-[14px] font-medium ${fs.score >= 60 ? "text-accent" : "text-risk"}`}>{fs.band}</div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={onTime}
            onClick={() => setOnTime((v) => !v)}
            className="mt-10 flex items-center gap-3 rounded-full border border-line py-2 pr-4 pl-2 text-[14px] transition-colors hover:bg-white/5"
          >
            <span className={`relative h-6 w-10 rounded-full transition-colors ${onTime ? "bg-accent" : "bg-raised"}`}>
              <motion.span layout className={`absolute top-1 size-4 rounded-full ${onTime ? "right-1 bg-accent-ink" : "left-1 bg-muted"}`} transition={{ type: "spring", stiffness: 500, damping: 32 }} />
            </span>
            What if INV-104 pays on time?
          </button>
          <p className="mt-6 text-center text-[11px] text-dim">{fs.disclaimer}</p>
        </Reveal>

        <Reveal delay={0.1} className="rounded-[32px] border border-line bg-surface p-6 md:p-8">
          <ul className="space-y-5">
            {fs.factors.map((f, i) => (
              <li key={f.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px]">{f.label}</span>
                  <span className="tnum font-mono text-[13px]">
                    <Count value={inView ? f.points : 0} />
                    <span className="text-dim"> / {f.max}</span>
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                  <motion.div
                    className={`h-full rounded-full ${f.direction === "positive" ? "bg-accent" : "bg-risk"}`}
                    initial={{ width: 0 }}
                    animate={{ width: inView ? `${(f.points / f.max) * 100}%` : 0 }}
                    transition={{ duration: 1, delay: 0.1 + i * 0.08, ease: EASE }}
                  />
                </div>
                <div className="mt-1.5 text-[12px] text-dim">{f.detail}</div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export function Reliability() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [results, setResults] = useState<FaultResult[] | null>(null);
  const [ms, setMs] = useState(0);
  const run = async () => {
    setState("running");
    try {
      const res = await fetch("/api/fault-lab", { method: "POST" });
      const data = (await res.json()) as { results: FaultResult[]; durationMs: number };
      setResults(data.results);
      setMs(data.durationMs);
      setState("done");
    } catch {
      setState("error");
    }
  };
  const dup = results?.find((r) => r.id === "duplicate_webhook");
  const passed = results?.filter((r) => r.pass).length ?? 0;
  const rows = results ?? PLACEHOLDER;

  return (
    <section id="reliability" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-28 md:px-6 md:py-40">
      <Reveal>
        <Eyebrow>Fault lab</Eyebrow>
      </Reveal>
      <div className="flex flex-wrap items-end justify-between gap-8">
        <h2 className="text-[clamp(36px,6vw,72px)] leading-[0.98] font-medium tracking-[-0.04em]">
          <SplitHeadline text="Built for" /> <span className="serif text-accent italic"><SplitHeadline text="bad days." delay={0.1} /></span>
        </h2>
        <Reveal delay={0.15}>
          <button
            onClick={run}
            disabled={state === "running"}
            className="group inline-flex h-12 items-center gap-3 rounded-full border border-line-strong px-5 text-[15px] transition-colors hover:bg-white/5 disabled:opacity-60"
          >
            <span className={`size-2 rounded-full ${state === "running" ? "animate-pulse bg-risk" : state === "done" ? "bg-accent" : "bg-muted"}`} />
            {state === "running" ? "Injecting faults…" : state === "done" ? "Run again" : "Run the fault lab"}
          </button>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-[1fr_1.6fr]">
        <Reveal className="flex flex-col justify-between rounded-[32px] border border-line bg-surface p-8">
          <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Duplicate webhook ×100</div>
          <div className="my-8">
            <div className="text-[88px] leading-none font-medium tracking-tight">
              <Count value={dup ? Number(dup.observed.match(/(\d+) duplicates/)?.[1] ?? 0) : 0} />
            </div>
            <div className="mt-2 text-[15px] text-muted">duplicate transactions created</div>
          </div>
          <div className="text-[12px] text-dim">{state === "done" ? `${passed}/${results!.length} scenarios passed · ${ms} ms · measured live on this server` : "Runs the real ingestion engine against a scripted provider."}</div>
        </Reveal>

        <Reveal delay={0.1} className="overflow-hidden rounded-[32px] border border-line bg-surface">
          <ul>
            {rows.map((r, i) => (
              <motion.li
                key={r.id}
                className="flex items-start gap-4 border-b border-line px-6 py-4 last:border-0"
                initial={false}
                animate={{ opacity: state === "idle" ? 0.55 : 1 }}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center">
                  <AnimatePresence mode="wait">
                    {state === "done" ? (
                      <motion.span
                        key="ok"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.09, type: "spring", stiffness: 500, damping: 24 }}
                        className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${r.pass ? "bg-accent text-accent-ink" : "bg-neg text-bg"}`}
                        aria-label={r.pass ? "passed" : "failed"}
                      >
                        {r.pass ? "✓" : "!"}
                      </motion.span>
                    ) : (
                      <motion.span key="wait" className={`size-2 rounded-full ${state === "running" ? "animate-pulse bg-risk" : "bg-dim"}`} />
                    )}
                  </AnimatePresence>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px]">{r.title}</div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-dim">{state === "done" ? r.observed : r.expected}</div>
                </div>
              </motion.li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

const PLACEHOLDER: FaultResult[] = [
  ["duplicate_webhook", "Duplicate webhook ×100", "0 duplicate transactions, 1 recompute"],
  ["concurrent_webhook", "Webhook while a job is running", "Second delivery coalesces"],
  ["rate_limit", "Provider 429 rate limit", "Backoff, bounded retries, then success"],
  ["provider_5xx", "Provider 5xx outage", "Retry with jitter, keep last good state"],
  ["worker_crash", "Worker crash mid-sync, then replay", "Cursor only advances past committed pages"],
  ["pending_posted", "Pending → posted replacement", "No double count"],
  ["malformed", "Malformed transaction", "Quarantine row, continue the batch"],
  ["expired_item", "Expired / revoked item", "Mark relink required"],
].map(([id, title, expected]) => ({ id, title, expected, observed: "", pass: false, log: [] }));

export function Stack() {
  const items = [
    ["Forecast engine", "Deterministic TypeScript, integer cents, replay-stable"],
    ["Copilot", "11 typed tools, structured responses, proposals only"],
    ["Backend", "Next.js route handlers, stateless, schema-validated"],
    ["Evidence", "Vitest suite: money math, fixtures, guardrails, faults"],
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 md:px-6">
      <div className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line md:grid-cols-4">
        {items.map(([k, v], i) => (
          <Reveal key={k} delay={i * 0.06} className="bg-bg p-6">
            <div className="text-[15px] font-medium">{k}</div>
            <div className="mt-2 text-[13px] leading-relaxed text-muted">{v}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section className="grain relative overflow-hidden px-4 py-36 text-center md:py-48">
      <div aria-hidden className="pointer-events-none absolute bottom-[-40%] left-1/2 h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(158,240,192,0.18),transparent)] blur-2xl" />
      <h2 className="relative text-[clamp(48px,10vw,140px)] leading-[0.9] font-medium tracking-[-0.05em]">
        <SplitHeadline text="Run the" /> <span className="serif text-accent italic"><SplitHeadline text="numbers." delay={0.1} /></span>
      </h2>
      <Reveal delay={0.25} className="relative mt-10 flex justify-center">
        <PrimaryButton href="/demo">Open the live demo</PrimaryButton>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line px-4 py-10 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 text-[12px] text-dim md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-muted">
          <LogoMark size={18} /> FlowFi · portfolio project
        </div>
        <p className="max-w-xl leading-relaxed">
          Northstar Studio and every number here are fictional. FlowFi is not a bank, not tax advice, and FlowScore is not a credit score. The demo copilot is a deterministic router over real tools — no LLM.
        </p>
        <Link href="https://github.com/roszhan2684/flowfi-ai" className="text-muted hover:text-fg">
          GitHub →
        </Link>
      </div>
    </footer>
  );
}
