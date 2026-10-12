"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMemo, useState } from "react";
import { runAgent } from "@/lib/agent/agent";
import { formatMoney } from "@/lib/core/money";
import { segments } from "@/lib/segments";
import { Eyebrow, Reveal, SplitHeadline } from "./primitives";


export function Receipts() {
  const r = useMemo(() => runAgent("What should I do?"), []);
  const [open, setOpen] = useState<number | null>(null);
  const segs = segments(r.answer);

  const sourceFor = (text: string) => {
    const calc = r.calculations.find((c) => formatMoney(c.valueMinor) === text || formatMoney(Math.abs(c.valueMinor)) === text);
    const tool = calc?.source === "run_scenario" ? "run_scenario" : "get_forecast";
    const step = r.trace.find((t) => t.tool === tool) ?? r.trace[0];
    const cite = r.citations.find((c) => (tool === "run_scenario" ? c.type === "scenario" : c.type === "forecast")) ?? r.citations[0];
    return { calc, step, cite };
  };

  return (
    <section id="copilot" className="relative w-full scroll-mt-24 px-4 py-28 md:px-10 xl:px-16 md:py-40">
      <Reveal>
        <Eyebrow>Copilot</Eyebrow>
      </Reveal>
      <h2 className="max-w-3xl text-[clamp(36px,6vw,72px)] leading-[0.98] font-medium tracking-[-0.04em]">
        <SplitHeadline text="Every number" /> <span className="serif text-accent italic"><SplitHeadline text="has a receipt." delay={0.15} /></span>
      </h2>

      <Reveal delay={0.2} className="mt-14 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <LayoutGroup>
          <div className="rounded-[28px] border border-line bg-surface p-6 md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-full bg-raised px-3 py-1.5 text-[13px]">What should I do?</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pb-5">
              {r.trace.map((t, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.12 }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[10.5px] text-muted"
                >
                  <span className={`size-1.5 rounded-full ${t.access === "read" ? "bg-accent" : "bg-risk"}`} />
                  {t.tool}
                </motion.span>
              ))}
            </div>
            <p className="text-[17px] leading-[1.75] text-fg/85 md:text-[19px]">
              {segs.map((s, i) =>
                s.bold && s.text.includes("$") ? (
                  <motion.button
                    layoutId={`chip-${i}`}
                    key={i}
                    onClick={() => setOpen(open === i ? null : i)}
                    className={`tnum mx-0.5 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap transition-colors ${open === i ? "bg-accent text-accent-ink" : "bg-accent/12 text-accent hover:bg-accent/20"}`}
                  >
                    {s.text}
                  </motion.button>
                ) : (
                  <span key={i} className={s.bold ? "font-medium text-fg" : ""}>
                    {s.text}
                  </span>
                ),
              )}
            </p>
          </div>

          <div className="relative min-h-[300px] rounded-[28px] border border-line bg-surface/60 p-6 md:p-8">
            <AnimatePresence mode="wait">
              {open === null ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col justify-between">
                  <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Tool trace</div>
                  <p className="text-[22px] leading-snug text-muted">
                    Tap a <span className="rounded-md bg-accent/12 px-1.5 text-accent">number</span> to see the tool that produced it.
                  </p>
                  <div className="text-[12px] text-dim">{r.model}</div>
                </motion.div>
              ) : (
                (() => {
                  const { calc, step, cite } = sourceFor(segs[open].text);
                  return (
                    <motion.div key={open} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="space-y-5">
                      <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Source</div>
                      <div className="tnum text-[40px] leading-none font-medium tracking-tight">{segs[open].text}</div>
                      <dl className="space-y-3 font-mono text-[12px]">
                        <Row k="label" v={calc?.label ?? "Driver impact"} />
                        <Row k="tool" v={step.tool} accent />
                        <Row k="access" v={step.access} />
                        <Row k="source" v={cite?.id ?? "—"} />
                        <Row k="as of" v={cite ? new Date(cite.asOf).toUTCString().slice(5, 22) + " UTC" : "—"} />
                        <Row k="latency" v={`${step.ms} ms`} />
                      </dl>
                      <p className="text-[12px] leading-relaxed text-dim">Computed by deterministic code. The language layer only quotes it.</p>
                    </motion.div>
                  );
                })()
              )}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </Reveal>
    </section>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-dim">{k}</dt>
      <dd className={`truncate text-right ${accent ? "text-accent" : "text-fg/80"}`}>{v}</dd>
    </div>
  );
}
