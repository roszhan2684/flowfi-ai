"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { createContext, useContext, type ReactNode } from "react";
import type { ProposedAction } from "@/lib/agent/tools";

export const EASE = [0.22, 1, 0.36, 1] as const;

export type Tab = "home" | "cash" | "activity" | "copilot" | "more";
export type Page = "alerts" | "score" | "invoices" | "audit" | "sync" | null;
export type Sheet =
  | { kind: "why" }
  | { kind: "tx"; id: string }
  | { kind: "action"; messageId: string; action: ProposedAction }
  | { kind: "invoice"; id: string }
  | null;

export type Nav = {
  tab: Tab;
  page: Page;
  sheet: Sheet;
  go: (tab: Tab, page?: Page) => void;
  open: (s: Sheet) => void;
  ask: (question: string) => void;
  pendingQuestion: string | null;
  clearPending: () => void;
};

export const NavContext = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(NavContext);
  if (!n) throw new Error("useNav outside provider");
  return n;
};

export function Card({ children, className = "", onClick, tone = "default" }: { children: ReactNode; className?: string; onClick?: () => void; tone?: "default" | "risk" | "accent" | "ink" }) {
  const tones = {
    default: "bg-app-card",
    risk: "bg-app-risk-soft",
    accent: "bg-app-accent-soft",
    ink: "bg-app-ink text-white",
  };
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      className={`block w-full rounded-[22px] p-4 text-left shadow-[0_1px_2px_rgba(13,17,16,0.04),0_8px_24px_-12px_rgba(13,17,16,0.08)] ${tones[tone]} ${className}`}
    >
      {children}
    </Comp>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`text-[11px] font-medium tracking-wide text-app-muted uppercase ${className}`}>{children}</div>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "risk" | "accent" | "neg" | "ink" }) {
  const t = {
    neutral: "bg-app-line/70 text-app-muted",
    risk: "bg-app-risk-soft text-app-risk",
    accent: "bg-app-accent-soft text-app-accent",
    neg: "bg-app-neg-soft text-app-neg",
    ink: "bg-app-ink text-white",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${t}`}>{children}</span>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-app-line/80 ${className}`} />;
}

export function ScreenHeader({ title, subtitle, back, right }: { title: string; subtitle?: ReactNode; back?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-5 pt-3 pb-3">
      <div className="min-w-0">
        {back && (
          <button onClick={back} className="-ml-1 mb-1 flex items-center gap-0.5 text-[13px] font-medium text-app-accent">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
        )}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[12px] text-app-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? "bg-app-accent" : "bg-app-line"}`}>
      <motion.span
        className="absolute top-[3px] size-5 rounded-full bg-white shadow"
        animate={{ left: on ? 21 : 3 }}
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; id: string }) {
  return (
    <div className="flex rounded-full bg-app-line/70 p-1" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)} className="relative flex-1 rounded-full px-2 py-1.5 text-[12px] font-medium">
          {value === v && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-app-card shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
          <span className={`relative ${value === v ? "text-app-ink" : "text-app-muted"}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet with backdrop, spring entrance and drag-to-dismiss. */
export function BottomSheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title: string }) {
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[88%] flex-col rounded-t-[30px] bg-app-bg shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 110 || info.velocity.y > 600) && onClose()}
          >
            <div className="flex cursor-grab touch-none justify-center pt-2.5 pb-2" onPointerDown={(e) => controls.start(e)}>
              <div className="h-1.5 w-10 rounded-full bg-app-line" />
            </div>
            <div className="no-scrollbar overflow-y-auto px-5 pb-8">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mx-5 mt-10 rounded-[22px] bg-app-neg-soft p-5 text-center">
      <div className="text-[15px] font-semibold text-app-neg">Couldn’t reach the FlowFi API</div>
      <div className="mt-1 text-[12px] text-app-muted">{message}. Your last good data is kept.</div>
      <button onClick={retry} className="mt-4 rounded-full bg-app-ink px-4 py-2 text-[13px] font-medium text-white">
        Try again
      </button>
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function syncedLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
}
