"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentResponse } from "@/lib/agent/agent";
import type { AuditEvent } from "@/lib/agent/actions";
import { formatMoney } from "@/lib/core/money";
import { api, useSnap } from "@/lib/client";
import { newId, useDemo, type ChatMessage } from "@/lib/store";
import { segments } from "@/lib/segments";
import { EASE, Pill, useNav } from "./ui";

const SUGGESTIONS = [
  "What should I do?",
  "Why does my balance dip?",
  "What if the contractor is paid a week later?",
  "What's my FlowScore?",
  "Move $1,690 into my tax reserve",
  "What is the QuickPrint memo?",
];

export function CopilotScreen() {
  const chat = useDemo((s) => s.chat);
  const pushChat = useDemo((s) => s.pushChat);
  const pushAudit = useDemo((s) => s.pushAudit);
  const completeTour = useDemo((s) => s.completeTour);
  const { options } = useSnap();
  const nav = useNav();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);
      pushChat({ id: newId("msg"), role: "user", text: q });
      try {
        const { status, data } = await api<AgentResponse & { error?: string }>("/api/ai/chat", { message: q, options }, "copilot");
        if (status !== 200) throw new Error(data.error ?? "Request failed");
        const id = newId("msg");
        pushChat({ id, role: "assistant", response: data, actionStatus: {} });
        const now = new Date().toISOString();
        const events: AuditEvent[] = [
          { id: newId("aud"), at: now, actor: "copilot", action: "ai.run.completed", entityType: "ai_run", entityId: data.runId, metadata: { intent: data.intent, tools: data.trace.length, latencyMs: data.latencyMs } },
          ...data.proposedActions.map((a) => ({ id: newId("aud"), at: now, actor: "copilot" as const, action: "ai.proposed_action", entityType: "proposed_action", entityId: a.id, metadata: { type: a.type, title: a.title } })),
        ];
        pushAudit(...events);
        if (data.intent === "next_step") completeTour("ask");
      } catch (e) {
        pushChat({ id: newId("msg"), role: "error", text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [busy, options, pushChat, pushAudit, completeTour],
  );

  useEffect(() => {
    if (nav.pendingQuestion) {
      const q = nav.pendingQuestion;
      nav.clearPending();
      send(q);
    }
  }, [nav, send]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, busy]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <h1 className="text-[26px] font-semibold tracking-tight">Copilot</h1>
        <Pill tone="neutral">Tool-grounded</Pill>
      </div>

      <div ref={scroller} className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {chat.length === 0 && !busy && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-6">
            <div className="text-[28px] leading-tight font-semibold tracking-tight">
              Ask about your cash.
              <br />
              <span className="text-app-muted">Every number comes with a receipt.</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, ease: EASE }}
                  onClick={() => send(s)}
                  className="rounded-full border border-app-line bg-app-card px-3.5 py-2 text-left text-[13px]"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {chat.map((m, i) => (
          <Message key={m.id} m={m} animate={i === chat.length - 1} />
        ))}
        {busy && <Thinking />}
      </div>

      {chat.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {SUGGESTIONS.slice(0, 5).map((s) => (
            <button key={s} disabled={busy} onClick={() => send(s)} className="shrink-0 rounded-full border border-app-line bg-app-card px-3 py-1.5 text-[12px] whitespace-nowrap disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mx-3 mb-3 flex items-center gap-2 rounded-full border border-app-line bg-app-card py-1.5 pr-1.5 pl-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask FlowFi…"
          aria-label="Message the copilot"
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-app-faint"
        />
        <button disabled={!input.trim() || busy} aria-label="Send" className="grid size-9 place-items-center rounded-full bg-app-ink text-white transition-opacity disabled:opacity-30">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-app-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-app-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </span>
      Choosing tools…
    </div>
  );
}

function Message({ m, animate }: { m: ChatMessage; animate: boolean }) {
  if (m.role === "user")
    return (
      <motion.div initial={animate ? { opacity: 0, y: 10, scale: 0.98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
        <div className="max-w-[82%] rounded-[20px] rounded-br-md bg-app-ink px-4 py-2.5 text-[14px] text-white">{m.text}</div>
      </motion.div>
    );
  if (m.role === "error")
    return <div className="rounded-2xl bg-app-neg-soft px-4 py-3 text-[13px] text-app-neg">Copilot unavailable: {m.text}. No numbers were shown.</div>;
  return <Answer id={m.id} r={m.response} status={m.actionStatus} animate={animate} />;
}

function Answer({ id, r, status, animate }: { id: string; r: AgentResponse; status: Record<string, string>; animate: boolean }) {
  const nav = useNav();
  const completeTour = useDemo((s) => s.completeTour);
  const [revealed, setRevealed] = useState(animate ? 0 : r.trace.length);
  const [showEvidence, setShowEvidence] = useState(false);
  const done = revealed >= r.trace.length;

  // Tool steps are real; they are revealed one by one, and the answer (with
  // its numbers) only appears after every tool result is in.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setRevealed((n) => n + 1), 260);
    return () => clearTimeout(t);
  }, [revealed, done]);

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        {r.trace.slice(0, revealed).map((t, i) => (
          <motion.div key={i} initial={animate ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 font-mono text-[10.5px] text-app-muted">
            <span className={`grid size-3.5 place-items-center rounded-full text-[8px] text-white ${t.ok ? (t.access === "read" ? "bg-app-accent" : "bg-app-risk") : "bg-app-neg"}`}>{t.ok ? "✓" : "!"}</span>
            {t.tool}
            <span className="text-app-faint">{t.access === "write_proposal" ? "proposal" : "read"} · {t.ms}ms</span>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {done && (
          <motion.div initial={animate ? { opacity: 0, y: 8, filter: "blur(4px)" } : false} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.45, ease: EASE }} className="space-y-2.5">
            {r.guardrails.map((g) => (
              <div key={g} className="flex gap-2 rounded-2xl bg-app-ink px-3 py-2.5 text-[12px] text-white">
                <span aria-hidden>⛨</span>
                <span>{g}</span>
              </div>
            ))}

            <div className="rounded-[20px] rounded-tl-md bg-app-card px-4 py-3 text-[14px] leading-relaxed shadow-sm">
              {segments(r.answer).map((s, i) =>
                s.bold ? (
                  <strong key={i} className={`tnum font-semibold ${s.text.includes("$") ? "rounded bg-app-accent-soft px-1 whitespace-nowrap text-app-ink" : ""}`}>
                    {s.text}
                  </strong>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>

            {r.uncertainties.map((u) => (
              <div key={u} className="flex items-start gap-2 text-[11.5px] text-app-risk">
                <Pill tone="risk">Estimate</Pill>
                <span className="leading-snug">{u}</span>
              </div>
            ))}

            {r.citations.length > 0 && (
              <div>
                <button
                  onClick={() => {
                    setShowEvidence((v) => !v);
                    completeTour("evidence");
                  }}
                  className="flex flex-wrap items-center gap-1.5"
                  aria-expanded={showEvidence}
                >
                  {r.citations.slice(0, 4).map((c) => (
                    <span key={c.id} className="rounded-full border border-app-line bg-app-card px-2.5 py-1 text-[11px] font-medium">
                      {c.type === "forecast" ? "📈" : c.type === "invoice" ? "🧾" : c.type === "scenario" ? "🧪" : "•"} {c.label.length > 26 ? c.label.slice(0, 24) + "…" : c.label}
                    </span>
                  ))}
                  <span className="text-[11px] font-medium text-app-accent">{showEvidence ? "Hide" : "Evidence"}</span>
                </button>
                <AnimatePresence initial={false}>
                  {showEvidence && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ ease: EASE }} className="overflow-hidden">
                      <div className="mt-2 space-y-2 rounded-2xl border border-app-line bg-app-card p-3 text-[11px]">
                        {r.calculations.length > 0 && (
                          <div>
                            <div className="mb-1 font-semibold text-app-muted uppercase">Calculations</div>
                            {r.calculations.map((c, i) => (
                              <div key={i} className="flex justify-between gap-2 py-0.5">
                                <span className="truncate">{c.label}</span>
                                <span className="tnum shrink-0 font-medium">{formatMoney(c.valueMinor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div>
                          <div className="mb-1 font-semibold text-app-muted uppercase">Sources</div>
                          {r.citations.map((c) => (
                            <div key={c.id} className="flex justify-between gap-2 py-0.5 font-mono text-[10px]">
                              <span className="truncate">{c.type}:{c.id}</span>
                              <span className="shrink-0 text-app-muted">{new Date(c.asOf).toISOString().slice(5, 16).replace("T", " ")}Z</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-app-line pt-1.5 text-[10px] text-app-faint">
                          {r.model} · {r.latencyMs} ms server time
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {r.proposedActions.map((a) => {
              const st = status[a.id] ?? "proposed";
              return (
                <motion.div key={a.id} layout className="rounded-[20px] border border-dashed border-app-ink/25 bg-app-card p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={st === "approved" ? "accent" : st === "rejected" ? "neutral" : "ink"}>
                      {st === "approved" ? "✓ Approved" : st === "rejected" ? "Rejected" : "Proposed action"}
                    </Pill>
                    <Pill tone={a.riskLevel === "low" ? "accent" : "risk"}>{a.riskLevel} risk</Pill>
                  </div>
                  <div className="mt-2 text-[14px] font-semibold">{a.title}</div>
                  <div className="mt-0.5 text-[12px] text-app-muted">{a.summary}</div>
                  {st === "proposed" && (
                    <button onClick={() => nav.open({ kind: "action", messageId: id, action: a })} className="mt-3 w-full rounded-full bg-app-ink py-2.5 text-[13px] font-medium text-white">
                      Review
                    </button>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
