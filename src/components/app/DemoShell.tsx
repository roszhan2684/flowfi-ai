"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SnapshotProvider } from "@/lib/client";
import { TOUR_STEPS, useDemo } from "@/lib/store";
import { PhoneFrame } from "../landing/PhoneStory";
import { Logo } from "../shared/Logo";
import { ThemeToggle } from "../shared/ThemeToggle";
import { CoachMarks, useTourDriver } from "./CoachMarks";
import { ActivityScreen } from "./ActivityScreen";
import { CashFlowScreen } from "./CashFlowScreen";
import { CopilotScreen } from "./CopilotScreen";
import { HomeScreen } from "./HomeScreen";
import { AlertsPage, AuditPage, InvoicesPage, MoreScreen, ScorePage, SyncPage } from "./MoreScreen";
import { Sheets } from "./Sheets";
import { EASE, NavContext, type Nav, type Page, type Sheet, type Tab } from "./ui";

const TABS: Array<[Tab, string, React.ReactNode]> = [
  ["home", "Home", <path key="h" d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5z" />],
  ["cash", "Cash Flow", <path key="c" d="M3.5 17.5l5-6 4 3.5 7.5-9" />],
  ["activity", "Activity", <path key="a" d="M4 8h13m0 0l-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0l3.5-3.5M7 16l3.5 3.5" />],
  ["copilot", "Copilot", <path key="p" d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5zM18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />],
  ["more", "More", <g key="m"><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></g>],
];
const ORDER: Tab[] = TABS.map((t) => t[0]);

function TourDriver() {
  useTourDriver();
  return null;
}

function PhoneApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const autoStarted = useDemo((s) => s.tourAutoStarted);
  const setTourStep = useDemo((s) => s.setTourStep);
  useEffect(() => {
    if (!autoStarted) {
      const t = setTimeout(() => setTourStep(0), 900);
      return () => clearTimeout(t);
    }
  }, [autoStarted, setTourStep]);
  const [tab, setTab] = useState<Tab>("home");
  const [page, setPage] = useState<Page>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dir, setDir] = useState(1);
  const [pendingQuestion, setPending] = useState<string | null>(null);

  const go = useCallback(
    (t: Tab, p: Page = null) => {
      setDir(ORDER.indexOf(t) >= ORDER.indexOf(tab) ? 1 : -1);
      setTab(t);
      setPage(p);
      setSheet(null);
    },
    [tab],
  );
  const nav: Nav = useMemo(
    () => ({
      tab,
      page,
      sheet,
      go,
      open: setSheet,
      ask: (q) => {
        setPending(q);
        go("copilot");
      },
      pendingQuestion,
      clearPending: () => setPending(null),
    }),
    [tab, page, sheet, go, pendingQuestion],
  );

  const key = `${tab}:${page ?? ""}`;
  const screen =
    tab === "home" ? <HomeScreen /> :
    tab === "cash" ? <CashFlowScreen /> :
    tab === "activity" ? <ActivityScreen /> :
    tab === "copilot" ? <CopilotScreen /> :
    page === "alerts" ? <AlertsPage /> :
    page === "score" ? <ScorePage /> :
    page === "invoices" ? <InvoicesPage /> :
    page === "audit" ? <AuditPage /> :
    page === "sync" ? <SyncPage /> : <MoreScreen />;

  return (
    <NavContext.Provider value={nav}>
      <TourDriver />
      <div ref={rootRef} className="relative flex h-full flex-col bg-app-bg text-app-ink">
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.div
              key={key}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: page ? 40 : d * 24, filter: "blur(3px)" }),
                center: { opacity: 1, x: 0, filter: "blur(0px)" },
                exit: (d: number) => ({ opacity: 0, x: page ? -20 : d * -24, filter: "blur(3px)" }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.32, ease: EASE }}
              className={`absolute inset-0 ${tab === "copilot" ? "" : "no-scrollbar overflow-y-auto"}`}
            >
              {screen}
            </motion.div>
          </AnimatePresence>
        </div>

        <nav className="relative z-20 flex border-t border-app-line bg-app-bg/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur" aria-label="Tabs">
          {TABS.map(([t, label, icon]) => {
            const active = t === tab;
            return (
              <button key={t} onClick={() => go(t)} aria-current={active ? "page" : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 py-1">
                {active && <motion.span layoutId="tab-dot" className="absolute -top-1.5 h-[3px] w-6 rounded-full bg-app-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <svg width="22" height="22" viewBox="0 0 24 24" fill={t === "more" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-app-ink" : "text-app-faint"} aria-hidden>
                  {icon}
                </svg>
                <span className={`text-[10px] font-medium ${active ? "text-app-ink" : "text-app-faint"}`}>{label}</span>
              </button>
            );
          })}
        </nav>
        <Sheets />
        <CoachMarks container={rootRef} />
      </div>
    </NavContext.Provider>
  );
}

function Tour({ onPick }: { onPick?: () => void }) {
  const tour = useDemo((s) => s.tour);
  const step = useDemo((s) => s.tourStep);
  const setStep = useDemo((s) => s.setTourStep);
  const pct = (tour.length / TOUR_STEPS.length) * 100;
  return (
    <div>
      <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Guided demo</div>
      <div className="mt-2 text-[22px] leading-tight font-medium tracking-tight">The 90-second story</div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-raised">
        <motion.div className="h-full bg-accent" animate={{ width: `${pct}%` }} transition={{ ease: EASE }} />
      </div>
      <ol className="mt-4 space-y-0.5">
        {TOUR_STEPS.map((s, i) => {
          const done = tour.includes(s.id);
          const current = step === i;
          return (
            <li key={s.id}>
              <button
                onClick={() => {
                  setStep(i);
                  onPick?.();
                }}
                aria-current={current ? "step" : undefined}
                className="relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left"
              >
                {current && <motion.span layoutId="tour-current" className="absolute inset-0 rounded-xl bg-fg/[0.06] ring-1 ring-accent/50" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                <span className={`relative mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] transition-colors ${done ? "border-accent bg-accent text-accent-ink" : current ? "border-accent text-accent" : "border-line-strong text-dim"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={`relative text-[13.5px] leading-snug transition-colors ${current ? "font-medium text-fg" : done ? "text-muted" : "text-fg/80"}`}>{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex gap-2">
        {step === null ? (
          <button
            onClick={() => {
              setStep(0);
              onPick?.();
            }}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink"
          >
            {tour.length ? "Restart tour" : "Start guided tour"}
          </button>
        ) : (
          <>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-full border border-line-strong px-3.5 py-2 text-[13px] disabled:opacity-40">
              Back
            </button>
            <button onClick={() => setStep(step + 1 >= TOUR_STEPS.length ? null : step + 1)} className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink">
              {step + 1 >= TOUR_STEPS.length ? "Finish" : "Next"}
            </button>
            <button onClick={() => setStep(null)} className="ml-auto px-2 text-[13px] text-muted hover:text-fg">
              Skip
            </button>
          </>
        )}
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-dim">Use ← → to move, Esc to skip. Everything highlighted is the real, working app.</p>
    </div>
  );
}

function Console() {
  const log = useDemo((s) => s.apiLog);
  const audit = useDemo((s) => s.audit);
  const [tab, setTab] = useState<"requests" | "audit">("requests");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">Live console</div>
        <div className="flex rounded-full border border-line p-0.5 text-[11px]">
          {(["requests", "audit"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`relative rounded-full px-2.5 py-1 capitalize ${tab === t ? "text-bg" : "text-muted"}`}>
              {tab === t && <motion.span layoutId="console-tab" className="absolute inset-0 rounded-full bg-fg" />}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="no-scrollbar mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto font-mono text-[11px]">
        <AnimatePresence initial={false}>
          {tab === "requests"
            ? log.map((r) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, y: -8, backgroundColor: "rgba(158,240,192,0.12)" }} animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }} transition={{ duration: 0.6 }} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className={r.status < 300 ? "text-accent" : "text-risk"}>{r.status}</span>
                  <span className="text-dim">{r.method}</span>
                  <span className="min-w-0 flex-1 truncate text-fg/80">{r.path}</span>
                  <span className="text-dim">{r.ms}ms</span>
                </motion.div>
              ))
            : audit.map((e) => (
                <motion.div key={e.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg px-2 py-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-fg/85">{e.action}</span>
                    <span className="text-dim">{e.actor}</span>
                  </div>
                  <div className="text-dim">{new Date(e.at).toLocaleTimeString()}</div>
                </motion.div>
              ))}
        </AnimatePresence>
        {(tab === "requests" ? log : audit).length === 0 && <div className="px-2 text-dim">{tab === "requests" ? "Waiting for API calls…" : "No audit events yet."}</div>}
      </div>
      <div className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">Every number in the phone comes from these API calls. Stateless server; your approvals live in this browser.</div>
    </div>
  );
}

function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return match;
}

export function DemoShell() {
  const reset = useDemo((s) => s.reset);
  const [tourOpen, setTourOpen] = useState(false);
  const desktop = useIsDesktop();

  return (
    <SnapshotProvider>
      {!desktop ? (
      /* Mobile: the app is the page. */
      <div className="fixed inset-0 h-[100dvh] bg-app-bg pt-[env(safe-area-inset-top)]">
        <PhoneApp />
        <button onClick={() => setTourOpen(true)} aria-label="Open guided tour" className="absolute right-3 bottom-[calc(max(env(safe-area-inset-bottom),10px)+64px)] z-30 rounded-full bg-app-ink px-3 py-1.5 text-[11px] font-medium text-white shadow-lg">
          Tour
        </button>
        <AnimatePresence>
          {tourOpen && (
            <motion.div className="absolute inset-0 z-[60] overflow-y-auto bg-bg/95 p-6 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button onClick={() => setTourOpen(false)} className="mb-6 text-[13px] text-muted">
                ✕ Close
              </button>
              <Tour onPick={() => setTourOpen(false)} />
              <div className="mt-8 flex gap-3">
                <Link href="/" className="rounded-full border border-line-strong px-4 py-2 text-[13px]">
                  ← Site
                </Link>
                <button onClick={() => { reset(); setTourOpen(false); }} className="rounded-full border border-line-strong px-4 py-2 text-[13px] text-muted">
                  Reset demo
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      ) : (
      /* Desktop: tour · device · console */
      <div className="grain relative min-h-screen">
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" />
        <header className="relative flex items-center justify-between px-6 py-4 xl:px-10">
          <Link href="/" className="text-fg">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="rounded-full border border-line px-3 py-1.5 text-muted">Fictional demo data · Northstar Studio</span>
            <ThemeToggle />
            <button onClick={reset} className="rounded-full border border-line-strong px-3 py-1.5 text-muted transition-colors hover:text-fg">
              Reset demo
            </button>
          </div>
        </header>
        <div className="relative grid w-full grid-cols-[minmax(260px,1fr)_auto_minmax(300px,1fr)] items-start gap-8 px-6 pb-8 xl:gap-14 xl:px-10">
          <motion.aside initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: EASE }} className="sticky top-8 w-full max-w-[380px] justify-self-end pt-6">
            <Tour />
          </motion.aside>
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE }}>
            <PhoneFrame className="h-[min(844px,calc(100vh-110px))] min-h-[640px] w-[400px]">
              <div className="h-full pt-11">
                <PhoneApp />
              </div>
            </PhoneFrame>
          </motion.div>
          <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: EASE }} className="sticky top-8 h-[min(800px,calc(100vh-120px))] w-full max-w-[460px] rounded-[24px] border border-line bg-surface/70 p-5 backdrop-blur">
            <Console />
          </motion.aside>
        </div>
      </div>
      )}
    </SnapshotProvider>
  );
}
