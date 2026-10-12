"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Alert } from "@/lib/core/alerts";
import { formatShortDate } from "@/lib/core/dates";
import type { FaultResult } from "@/lib/core/faultlab";
import { formatMoney } from "@/lib/core/money";
import { api, useSnap } from "@/lib/client";
import { useDemo } from "@/lib/store";
import { Count } from "../shared/Money";
import { Card, EASE, Label, Pill, ScreenHeader, Skeleton, Switch, syncedLabel, useNav } from "./ui";

export function MoreScreen() {
  const nav = useNav();
  const { data } = useSnap();
  const reset = useDemo((s) => s.reset);
  const auditCount = useDemo((s) => s.audit.length);
  const [confirmReset, setConfirmReset] = useState(false);

  const rows: Array<[string, string, () => void, React.ReactNode?]> = [
    ["Alerts", "Risk signals with evidence", () => nav.go("more", "alerts"), data ? <Pill tone="risk">{data.alerts.length}</Pill> : null],
    ["FlowScore", "Explainable health indicator", () => nav.go("more", "score"), data ? <Pill>{data.flowScore.score}</Pill> : null],
    ["Invoices", "Receivables & follow-ups", () => nav.go("more", "invoices")],
    ["Audit trail", "Every approval and change", () => nav.go("more", "audit"), auditCount ? <Pill>{auditCount}</Pill> : null],
    ["Sync health & fault lab", "Integration status, failure drills", () => nav.go("more", "sync"), data?.freshness.stale ? <Pill tone="risk">Stale</Pill> : null],
  ];

  return (
    <div className="pb-6">
      <ScreenHeader title="More" subtitle="Northstar Studio · freelancer workspace" />
      <div className="space-y-3 px-4">
        <div className="overflow-hidden rounded-[22px] bg-app-card">
          {rows.map(([title, sub, onClick, badge]) => (
            <button key={title} onClick={onClick} className="flex w-full items-center justify-between gap-3 border-b border-app-line px-4 py-3.5 text-left last:border-0 active:bg-app-bg">
              <span>
                <span className="block text-[14px] font-medium">{title}</span>
                <span className="block text-[11.5px] text-app-muted">{sub}</span>
              </span>
              <span className="flex items-center gap-2 text-app-faint">
                {badge}›
              </span>
            </button>
          ))}
        </div>

        <Card>
          <Label>About this demo</Label>
          <ul className="mt-2 space-y-1.5 text-[12px] leading-snug text-app-muted">
            <li>• Northstar Studio is fictional; all data is a deterministic fixture.</li>
            <li>• Forecasts, scores and alerts are computed by the FlowFi API — no LLM.</li>
            <li>• The copilot is a deterministic router over real typed tools.</li>
            <li>• FlowFi never moves money. Approvals only save records inside FlowFi.</li>
          </ul>
        </Card>

        <button onClick={() => {
            if (!confirmReset) return setConfirmReset(true);
            reset();
            setConfirmReset(false);
            nav.go("home");
          }} className={`w-full rounded-full py-3 text-[13px] font-medium ${confirmReset ? "bg-app-neg text-white" : "bg-app-card text-app-neg"}`}>
          {confirmReset ? "Tap again to erase demo state" : "Reset demo"}
        </button>
      </div>
    </div>
  );
}

const SEV: Record<Alert["severity"], ["risk" | "neutral" | "neg", string]> = { high: ["neg", "High"], medium: ["risk", "Medium"], low: ["neutral", "Low"] };

export function AlertsPage() {
  const { data } = useSnap();
  const nav = useNav();
  const act = (a: Alert) => {
    if (a.type === "cash_threshold") nav.open({ kind: "why" });
    else if (a.type === "invoice_risk") nav.ask("Show my invoices");
    else if (a.type === "unusual_spending") nav.open({ kind: "tx", id: a.evidence[0].id });
    else if (a.type === "subscription_increase") nav.ask("Any subscription changes?");
    else if (a.type === "tax_reserve_gap") nav.ask("How is my tax reserve?");
    else nav.go("more", "sync");
  };
  return (
    <div className="pb-6">
      <ScreenHeader title="Alerts" back={() => nav.go("more")} subtitle="Deterministic rules over your data" />
      <div className="space-y-3 px-4">
        {!data
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-[22px]" />)
          : data.alerts.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, ease: EASE }}>
                <Card>
                  <div className="flex items-center gap-2">
                    <Pill tone={SEV[a.severity][0]}>{SEV[a.severity][1]}</Pill>
                    <span className="text-[11px] text-app-muted">{a.type.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-2 text-[15px] leading-snug font-semibold">{a.title}</div>
                  <div className="mt-1 text-[12px] text-app-muted">{a.detail}</div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-app-faint">evidence: {a.evidence.map((e) => e.label).join(", ")}</span>
                    <button onClick={() => act(a)} className="shrink-0 rounded-full bg-app-ink px-3 py-1.5 text-[12px] font-medium text-white">
                      {a.recommendedAction}
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
      </div>
    </div>
  );
}

export function ScorePage() {
  const { data } = useSnap();
  const nav = useNav();
  const fs = data?.flowScore;
  return (
    <div className="pb-6">
      <ScreenHeader title="FlowScore" back={() => nav.go("more")} subtitle="Sum of six visible factors" />
      <div className="space-y-3 px-4">
        {!fs ? (
          <Skeleton className="h-80 w-full rounded-[22px]" />
        ) : (
          <>
            <Card className="text-center">
              <Count value={fs.score} className="text-[64px] leading-none font-semibold tracking-tight" />
              <div className="mt-1 text-[13px] text-app-muted">
                out of 100 · <span className={fs.score >= 60 ? "text-app-accent" : "text-app-risk"}>{fs.band}</span>
              </div>
              <div className="mt-2 text-[11px] text-app-faint">{fs.disclaimer}</div>
            </Card>
            <Card>
              <ul className="space-y-4">
                {fs.factors.map((f, i) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-medium">{f.label}</span>
                      <span className="tnum text-[13px] font-semibold">
                        {f.points}
                        <span className="font-normal text-app-faint"> / {f.max}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-app-line">
                      <motion.div className={`h-full rounded-full ${f.direction === "positive" ? "bg-app-accent" : "bg-app-risk"}`} initial={{ width: 0 }} animate={{ width: `${(f.points / f.max) * 100}%` }} transition={{ delay: i * 0.06, duration: 0.8, ease: EASE }} />
                    </div>
                    <div className="mt-1 flex justify-between gap-2 text-[11px] text-app-muted">
                      <span>{f.detail}</span>
                      <span className="shrink-0">{f.value}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export function InvoicesPage() {
  const { data } = useSnap();
  const nav = useNav();
  return (
    <div className="pb-6">
      <ScreenHeader title="Invoices" back={() => nav.go("more")} subtitle="Expected dates use each client’s payment history" />
      <div className="space-y-2 px-4">
        {!data
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-[22px]" />)
          : [...data.invoices].reverse().map((inv) => (
              <Card key={inv.id} onClick={() => nav.open({ kind: "invoice", id: inv.id })}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-semibold">
                      {inv.number} <span className="font-normal text-app-muted">· {inv.client}</span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-app-muted">
                      Due {formatShortDate(inv.dueDate)}
                      {inv.status === "paid" ? ` · paid ${formatShortDate(inv.paidAt!)}` : ` · expected ${formatShortDate(inv.expectedDate!)}`}
                    </div>
                  </div>
                  <span className="tnum text-[14px] font-semibold">{formatMoney(inv.amountMinor, { cents: false })}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {inv.status === "paid" ? <Pill>Paid</Pill> : inv.expectedDate! > inv.dueDate ? <Pill tone="risk">Likely late</Pill> : <Pill tone="accent">On track</Pill>}
                  {inv.confidence !== undefined && <Pill>{Math.round(inv.confidence * 100)}% confidence</Pill>}
                  {inv.followUpDraftId && <Pill tone="ink">✓ Follow-up drafted</Pill>}
                </div>
              </Card>
            ))}
      </div>
    </div>
  );
}

export function AuditPage() {
  const nav = useNav();
  const audit = useDemo((s) => s.audit);
  const completeTour = useDemo((s) => s.completeTour);
  useEffect(() => completeTour("audit"), [completeTour]);
  return (
    <div className="pb-6">
      <ScreenHeader title="Audit trail" back={() => nav.go("more")} subtitle="Append-only · newest first" />
      <div className="px-4">
        {audit.length === 0 ? (
          <Card className="text-center">
            <div className="text-[14px] font-semibold">No activity yet</div>
            <div className="mt-1 text-[12px] text-app-muted">Ask the copilot, approve a proposal or toggle a scenario — it lands here.</div>
            <button onClick={() => nav.ask("What should I do?")} className="mt-3 rounded-full bg-app-ink px-4 py-2 text-[12px] font-medium text-white">
              Ask “What should I do?”
            </button>
          </Card>
        ) : (
          <ol className="relative ml-2 border-l border-app-line">
            <AnimatePresence initial={false}>
              {audit.map((e) => (
                <motion.li key={e.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative pb-4 pl-5">
                  <span className={`absolute top-1 -left-[5px] size-[9px] rounded-full border-2 border-app-bg ${e.actor === "user" ? "bg-app-ink" : e.actor === "copilot" ? "bg-app-accent" : "bg-app-faint"}`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] font-medium">{e.action}</span>
                    <span className="tnum text-[10.5px] text-app-faint">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                  <div className="text-[11px] text-app-muted">
                    {e.actor} · {e.entityType}
                    {Object.entries(e.metadata)
                      .slice(0, 3)
                      .map(([k, v]) => ` · ${k}: ${String(v).length > 34 ? String(v).slice(0, 32) + "…" : v}`)
                      .join("")}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </div>
  );
}

export function SyncPage() {
  const nav = useNav();
  const { data } = useSnap();
  const stale = useDemo((s) => s.simulateStale);
  const setStale = useDemo((s) => s.setStale);
  const completeTour = useDemo((s) => s.completeTour);
  const pushAudit = useDemo((s) => s.pushAudit);
  const [results, setResults] = useState<FaultResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);

  const run = async () => {
    setRunning(true);
    try {
      const { data } = await api<{ results: FaultResult[]; durationMs: number }>("/api/fault-lab", {}, "fault lab");
      setResults(data.results);
      setMs(data.durationMs);
      completeTour("faults");
      pushAudit({ id: `aud_fl_${Date.now()}`, at: new Date().toISOString(), actor: "system", action: "faultlab.completed", entityType: "integration", entityId: "item_demo", metadata: { passed: data.results.filter((r) => r.pass).length, total: data.results.length } });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="pb-6">
      <ScreenHeader title="Sync health" back={() => nav.go("more")} subtitle="Integration status & failure drills" />
      <div className="space-y-3 px-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold">Demo provider</div>
              <div className="font-mono text-[11px] text-app-muted">item_demo · fixture</div>
            </div>
            <Pill tone={stale ? "risk" : "accent"}>{stale ? "Degraded · stale" : "Healthy"}</Pill>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-xl bg-app-bg p-2.5">
              <div className="text-app-muted">Last sync</div>
              <div className="font-medium">{data ? `${syncedLabel(data.freshness.syncedAt)} PT${stale ? " · 52h ago" : ""}` : "—"}</div>
            </div>
            <div className="rounded-xl bg-app-bg p-2.5">
              <div className="text-app-muted">Transactions</div>
              <div className="tnum font-medium">{data?.transactions.length ?? "—"}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-app-line pt-3">
            <div>
              <div className="text-[13px] font-medium">Simulate stale data</div>
              <div className="text-[11px] text-app-muted">Copilot must disclose it before advising</div>
            </div>
            <Switch label="Simulate stale data" on={stale} onChange={() => setStale(!stale)} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold">Fault lab</div>
              <div className="text-[11px] text-app-muted">Real ingestion engine · scripted provider</div>
            </div>
            <button onClick={run} disabled={running} className="rounded-full bg-app-ink px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-50">
              {running ? "Running…" : results ? "Run again" : "Run"}
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {(results ?? []).map((r, i) => (
              <motion.li key={r.id + ms} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="rounded-xl bg-app-bg p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium">{r.title}</span>
                  <Pill tone={r.pass ? "accent" : "neg"}>{r.pass ? "✓ Pass" : "Fail"}</Pill>
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] leading-snug text-app-muted">{r.observed}</div>
              </motion.li>
            ))}
            {!results && <li className="text-[12px] text-app-muted">Duplicate webhooks, 429s, 5xx outages, worker crashes, malformed rows, expired items.</li>}
          </ul>
          {results && <div className="mt-2 text-[11px] text-app-faint">{results.filter((r) => r.pass).length}/{results.length} passed in {ms} ms on the server.</div>}
        </Card>

        <Card>
          <Label>Roadmap, not in this demo</Label>
          <div className="mt-1.5 text-[12px] leading-snug text-app-muted">Plaid Sandbox link + webhooks (the engine above is provider-agnostic), Postgres persistence, native Swift vault.</div>
        </Card>
      </div>
    </div>
  );
}
