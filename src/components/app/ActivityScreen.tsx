"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { formatShortDate } from "@/lib/core/dates";
import { formatMoney } from "@/lib/core/money";
import { sanitizeUntrusted } from "@/lib/agent/tools";
import { useSnap } from "@/lib/client";
import { ErrorState, Pill, ScreenHeader, Skeleton, initials, useNav } from "./ui";

const FILTERS = ["All", "Business", "Personal", "Mixed", "Unknown", "Pending"] as const;

export function ActivityScreen() {
  const { data, error, retry } = useSnap();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const groups = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const rows = data.transactions.filter((t) => {
      if (needle && !`${t.merchantName} ${t.category} ${Math.abs(t.amountMinor) / 100}`.toLowerCase().includes(needle)) return false;
      if (filter === "Pending") return t.pending;
      if (filter !== "All") return t.businessUse === filter.toLowerCase();
      return true;
    });
    const map = new Map<string, typeof rows>();
    for (const t of rows) map.set(t.occurredAt, [...(map.get(t.occurredAt) ?? []), t]);
    return [...map.entries()];
  }, [data, q, filter]);

  if (error && !data) return <ErrorState message={error} retry={retry} />;
  const acct = (id: string) => data?.accounts.find((a) => a.id === id);

  return (
    <div className="pb-6">
      <ScreenHeader title="Activity" subtitle={data ? `${data.transactions.length} transactions · 3 accounts` : "Loading…"} />
      <div className="sticky top-0 z-10 space-y-2 bg-app-bg/90 px-4 pb-2 backdrop-blur">
        <label className="flex items-center gap-2 rounded-full border border-app-line bg-app-card px-3.5 py-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="text-app-muted">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant, category, amount" aria-label="Search transactions" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-app-faint" />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`relative shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${filter === f ? "text-white" : "text-app-muted"}`}>
              {filter === f && <motion.span layoutId="tx-filter" className="absolute inset-0 rounded-full bg-app-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative">{f}</span>
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="space-y-2 px-4 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="px-8 pt-16 text-center">
          <div className="text-[15px] font-semibold">Nothing matches</div>
          <div className="mt-1 text-[12px] text-app-muted">Try another merchant or clear the filter.</div>
          <button onClick={() => { setQ(""); setFilter("All"); }} className="mt-4 rounded-full bg-app-ink px-4 py-2 text-[12px] font-medium text-white">
            Clear
          </button>
        </div>
      ) : (
        <div className="px-4">
          {groups.slice(0, 40).map(([date, rows], gi) => (
            <motion.section key={date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(gi, 8) * 0.03 }}>
              <div className="pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-app-muted uppercase">{formatShortDate(date)}</div>
              <div className="overflow-hidden rounded-[18px] bg-app-card">
                {rows.map((t) => {
                  const flagged = sanitizeUntrusted(t.description).flagged;
                  const a = acct(t.accountId);
                  return (
                    <button key={t.id} onClick={() => nav.open({ kind: "tx", id: t.id })} className="flex w-full items-center gap-3 border-b border-app-line px-3 py-2.5 text-left last:border-0 active:bg-app-bg">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${t.amountMinor > 0 ? "bg-app-accent-soft text-app-accent" : "bg-app-bg text-app-ink"}`}>{initials(t.merchantName)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium">{t.merchantName}</span>
                          {t.pending && <Pill>Pending</Pill>}
                          {flagged && <Pill tone="neg">⛨ Memo</Pill>}
                        </span>
                        <span className="block truncate text-[11px] text-app-muted">
                          {t.category} · {a?.subtype === "credit card" ? "Card" : a?.name.split(" ")[0]} ••{a?.mask} · {t.businessUse}
                        </span>
                      </span>
                      <span className={`tnum text-[13.5px] font-semibold ${t.amountMinor > 0 ? "text-app-accent" : ""}`}>{formatMoney(t.amountMinor, { sign: true })}</span>
                    </button>
                  );
                })}
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}
