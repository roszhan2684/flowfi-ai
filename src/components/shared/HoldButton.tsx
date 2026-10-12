"use client";

import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useRef, useState } from "react";

const R = 34;
const C = 2 * Math.PI * R;

/**
 * Press-and-hold confirmation. The ring fills over `duration`; releasing early
 * rewinds it. Keyboard: hold Space or Enter. This is the explicit approval
 * gesture for every proposed action.
 */
export function HoldButton({
  onConfirm,
  label = "Hold to approve",
  doneLabel = "Approved",
  duration = 1.1,
  tone = "light",
  disabled = false,
  size = 84,
}: {
  onConfirm: () => void;
  label?: string;
  doneLabel?: string;
  duration?: number;
  tone?: "light" | "dark";
  disabled?: boolean;
  size?: number;
}) {
  const progress = useMotionValue(0);
  const dash = useTransform(progress, (p) => C * (1 - p));
  const scale = useTransform(progress, [0, 1], [1, 0.92]);
  const ctl = useRef<AnimationPlaybackControls | null>(null);
  const [done, setDone] = useState(false);
  const [holding, setHolding] = useState(false);

  const start = () => {
    if (done || disabled) return;
    setHolding(true);
    ctl.current?.stop();
    ctl.current = animate(progress, 1, {
      duration: duration * (1 - progress.get()),
      ease: "linear",
      onComplete: () => {
        setDone(true);
        setHolding(false);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
        onConfirm();
      },
    });
  };
  const cancel = () => {
    if (done) return;
    setHolding(false);
    ctl.current?.stop();
    ctl.current = animate(progress, 0, { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] });
  };

  const ink = tone === "light" ? "var(--app-ink)" : "var(--fg)";
  const accent = tone === "light" ? "var(--app-accent)" : "var(--accent)";
  const track = tone === "light" ? "var(--app-line)" : "var(--line-strong)";

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <motion.button
        type="button"
        aria-label={done ? doneLabel : `${label} (press and hold)`}
        disabled={disabled}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            start();
          }
        }}
        onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancel()}
        style={{ scale, width: size, height: size, touchAction: "none" }}
        className="relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40"
      >
        <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden>
          <circle cx="40" cy="40" r={R} stroke={track} strokeWidth="4" fill="none" />
          <motion.circle cx="40" cy="40" r={R} stroke={accent} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={C} style={{ strokeDashoffset: dash }} />
        </svg>
        <motion.span
          className="grid place-items-center rounded-full"
          style={{ width: size - 22, height: size - 22, background: done ? accent : "transparent", color: done ? (tone === "light" ? "#fff" : "var(--accent-ink)") : ink }}
          animate={{ scale: done ? [0.8, 1.08, 1] : 1 }}
          transition={{ duration: 0.45 }}
        >
          {done ? (
            <motion.svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <motion.path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} />
            </motion.svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 4.5H5.5a1 1 0 0 0-1 1V7M17 4.5h1.5a1 1 0 0 1 1 1V7M7 19.5H5.5a1 1 0 0 1-1-1V17M17 19.5h1.5a1 1 0 0 0 1-1V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M9 9.5v1M15 9.5v1M12 9.5v3.2l-1 .8M9.5 15.5c1.4 1 3.6 1 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </motion.span>
      </motion.button>
      <span className="text-[12px] font-medium" style={{ color: done ? accent : tone === "light" ? "var(--app-muted)" : "var(--muted)" }}>
        {done ? doneLabel : holding ? "Keep holding…" : label}
      </span>
    </div>
  );
}
