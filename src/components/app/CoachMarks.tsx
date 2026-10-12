"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { TOUR_STEPS, useDemo } from "@/lib/store";
import { EASE, useNav } from "./ui";

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 6;

/** Navigates the app to whatever each tour step needs on screen. */
export function useTourDriver() {
  const nav = useNav();
  const step = useDemo((s) => s.tourStep);
  const chat = useDemo((s) => s.chat);
  const navRef = useRef(nav);
  navRef.current = nav;

  const pending = [...chat]
    .reverse()
    .flatMap((m) => (m.role === "assistant" ? m.response.proposedActions.filter((a) => (m.actionStatus[a.id] ?? "proposed") === "proposed").map((a) => ({ m, a })) : []))[0];
  const hasAnswer = chat.some((m) => m.role === "assistant" && m.response.intent === "next_step");
  const pendingKey = pending ? pending.a.id : "";

  useEffect(() => {
    if (step === null) return;
    const n = navRef.current;
    switch (TOUR_STEPS[step].id) {
      case "cash":
      case "why":
        n.go("home");
        break;
      case "drivers":
        n.go("home");
        n.open({ kind: "why" });
        break;
      case "answer":
        if (hasAnswer) n.go("copilot");
        else n.ask("What should I do?");
        break;
      case "evidence":
        n.go("copilot");
        break;
      case "hold":
        n.go("copilot");
        if (pending) n.open({ kind: "action", messageId: pending.m.id, action: pending.a });
        break;
      case "presets":
        n.go("cash");
        break;
      case "audit":
        n.go("more", "audit");
        break;
      case "faults":
        n.go("more", "sync");
        break;
    }
    // Re-run the "hold" step once the copilot's proposal exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, step !== null && TOUR_STEPS[step].id === "hold" ? pendingKey : ""]);
}

function scrollParent(el: HTMLElement, stop: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Spotlight + step card, drawn over the app inside its own container. */
export function CoachMarks({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const step = useDemo((s) => s.tourStep);
  const setStep = useDemo((s) => s.setTourStep);
  const completeTour = useDemo((s) => s.completeTour);
  const [rect, setRect] = useState<Rect | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const scrolledFor = useRef<number | null>(null);
  const s = step === null ? null : TOUR_STEPS[step];

  useEffect(() => {
    if (step === null || !s) return;
    scrolledFor.current = null;
    setRect(null);
    const tick = () => {
      const root = container.current;
      if (!root) return;
      const c = root.getBoundingClientRect();
      setBox((b) => (b.w === c.width && b.h === c.height ? b : { w: c.width, h: c.height }));
      const target = root.querySelector<HTMLElement>(`[data-tour="${s.id === "faults" ? "faultlab" : s.id}"]`);
      if (!target) return setRect(null);
      if (scrolledFor.current !== step) {
        const sp = scrollParent(target, root);
        if (sp) {
          const t = target.getBoundingClientRect();
          const p = sp.getBoundingClientRect();
          sp.scrollTo({ top: sp.scrollTop + (t.top - p.top) - p.height / 2 + Math.min(t.height, p.height * 0.6) / 2, behavior: "smooth" });
        }
        scrolledFor.current = step;
      }
      const r = target.getBoundingClientRect();
      const next = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
      setRect((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && Math.abs(prev.w - next.w) < 0.5 && Math.abs(prev.h - next.h) < 0.5 ? prev : next));
    };
    const first = setTimeout(tick, 60);
    const id = setInterval(tick, 140);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [step, s, container]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStep(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (step === null || !s) return null;

  const go = (d: number) => {
    if (d > 0) completeTour(s.id);
    const n = step + d;
    if (n < 0) return;
    setStep(n >= TOUR_STEPS.length ? null : n);
  };

  // Clamp the spotlight to the visible app area.
  const vis = rect
    ? (() => {
        const top = Math.max(rect.y - PAD, 8);
        const bottom = Math.min(rect.y + rect.h + PAD, box.h - 8);
        return { x: Math.max(rect.x - PAD, 8), y: top, w: Math.min(rect.w + PAD * 2, box.w - 16), h: Math.max(bottom - top, 24) };
      })()
    : null;
  const below = vis ? vis.y + vis.h / 2 < box.h * 0.48 : false;
  const cardStyle: React.CSSProperties = !vis
    ? { top: "50%", transform: "translateY(-50%)" }
    : below
      ? { top: Math.min(vis.y + vis.h + 12, box.h - 230) }
      : { bottom: Math.min(box.h - vis.y + 12, box.h - 230) };
  const last = step === TOUR_STEPS.length - 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-[80]" aria-live="polite">
      <AnimatePresence>
        {vis ? (
          <motion.div
            key="spot"
            className="absolute rounded-[20px]"
            style={{ boxShadow: "0 0 0 9999px rgba(6, 8, 7, 0.58)" }}
            initial={{ opacity: 0, left: vis.x, top: vis.y, width: vis.w, height: vis.h }}
            animate={{ opacity: 1, left: vis.x, top: vis.y, width: vis.w, height: vis.h }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <motion.span
              className="absolute -inset-[3px] rounded-[23px] border-2 border-app-accent"
              animate={{ opacity: [0.9, 0.35, 0.9], scale: [1, 1.015, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        ) : (
          <motion.div key="dim" className="absolute inset-0 bg-[rgba(6,8,7,0.45)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>

      <motion.div
        key={step}
        role="dialog"
        aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}: ${s.title}`}
        className="pointer-events-auto absolute right-3 left-3 rounded-[22px] bg-app-ink p-4 text-white shadow-2xl"
        style={cardStyle}
        initial={{ opacity: 0, y: below ? -10 : 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all ${i === step ? "w-5 bg-[#9ef0c0]" : i < step ? "w-1.5 bg-white/60" : "w-1.5 bg-white/20"}`} />
            ))}
          </div>
          <span className="font-mono text-[10.5px] text-white/50">
            {step + 1} / {TOUR_STEPS.length}
          </span>
        </div>
        <div className="mt-2.5 text-[16px] leading-snug font-semibold">{s.title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{s.body}</p>
        <div className="mt-3.5 flex items-center gap-2">
          <button onClick={() => setStep(null)} className="mr-auto rounded-full px-1 py-1.5 text-[12px] font-medium text-white/55 hover:text-white">
            Skip tour
          </button>
          <button
            onClick={() => go(-1)}
            disabled={step === 0}
            className="rounded-full border border-white/20 px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-30"
          >
            Back
          </button>
          <button onClick={() => go(1)} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-semibold text-app-ink">
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
