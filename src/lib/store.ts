"use client";

// Client-side demo state. Everything here is user intent (toggles, approvals,
// chat) — financial numbers are always recomputed by the API from it.

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentResponse } from "./agent/agent";
import type { ActionEffect, AuditEvent } from "./agent/actions";
import type { ProposedAction } from "./agent/tools";
import type { SnapshotOptions } from "./core/engine";
import type { Assumption, Scenario } from "./core/forecast";

export type AssumptionPreset = { id: string; label: string; detail: string; assumption: Assumption };

export const PRESETS: AssumptionPreset[] = [
  { id: "inv104_on_time", label: "INV-104 paid on time", detail: "Lumen Health pays Oct 20", assumption: { kind: "invoice_on_due", invoiceId: "inv_104" } },
  { id: "contractor_late", label: "Contractor paid later", detail: "Mara Okafor billed Oct 31", assumption: { kind: "shift_event", eventKey: "rec:mara-okafor-design#0", days: 8 } },
  { id: "drop_adobe", label: "Cancel Adobe CC", detail: "Remove the $89.99 charge", assumption: { kind: "remove_event", eventKey: "rec:adobe-creative-cloud#0" } },
];

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; response: AgentResponse; actionStatus: Record<string, "proposed" | "approved" | "rejected"> }
  | { id: string; role: "error"; text: string };

export type ApiLogEntry = { id: string; at: string; method: string; path: string; status: number; ms: number; note?: string };

export const TOUR_STEPS = [
  { id: "cash", label: "See cash today + 30-day forecast", title: "Cash today, and where it’s heading", body: "Live balance plus 7, 14 and 30-day projections, computed by the deterministic engine." },
  { id: "why", label: "Spot the threshold alert", title: "One alert that matters", body: "FlowFi spots the Oct 23 dip below your $5,000 floor. Tap Why, or press Next." },
  { id: "drivers", label: "See what drives the dip", title: "Drivers, not vibes", body: "A late invoice and a contractor payment cause the dip. Every bar is a real event." },
  { id: "answer", label: "Ask the copilot “What should I do?”", title: "Ask the copilot", body: "It calls typed tools first, then answers using only the numbers they return." },
  { id: "evidence", label: "Open an evidence chip", title: "Every number has a receipt", body: "Open Evidence to see the calculations and sources behind the answer." },
  { id: "hold", label: "Hold to approve the follow-up draft", title: "Hold to approve", body: "The copilot only proposes. Press and hold the ring: nothing is sent or paid." },
  { id: "presets", label: "Toggle INV-104 paid on time", title: "What if it pays on time?", body: "Toggle INV-104 and watch the low point and FlowScore recover." },
  { id: "audit", label: "Check the audit trail", title: "Everything is audited", body: "AI runs, proposals, approvals and scenario changes, append-only." },
  { id: "faults", label: "Run the fault lab", title: "Built for bad days", body: "Run duplicate webhooks, outages and crashes against the real sync engine." },
] as const;
export type TourStep = (typeof TOUR_STEPS)[number]["id"];

type State = {
  scenario: Scenario;
  enabledPresets: string[];
  overrides: NonNullable<SnapshotOptions["overrides"]>;
  followUps: Record<string, string>;
  drafts: Array<Extract<ActionEffect, { kind: "followup" }>>;
  reservePlans: Array<Extract<ActionEffect, { kind: "reserve_plan" }>>;
  simulateStale: boolean;
  audit: AuditEvent[];
  chat: ChatMessage[];
  apiLog: ApiLogEntry[];
  tour: TourStep[];
  tourStep: number | null;
  tourAutoStarted: boolean;
  previousLow: { minor: number; date: string } | null;
};

type Actions = {
  setScenario: (s: Scenario) => void;
  togglePreset: (id: string) => void;
  setStale: (v: boolean) => void;
  applyEffect: (e: ActionEffect) => void;
  addOverride: (transactionId: string, newValue: string, oldValue: string) => void;
  pushAudit: (...events: AuditEvent[]) => void;
  pushChat: (m: ChatMessage) => void;
  setActionStatus: (messageId: string, actionId: string, status: "approved" | "rejected") => void;
  logApi: (e: Omit<ApiLogEntry, "id" | "at">) => void;
  completeTour: (...s: TourStep[]) => void;
  setTourStep: (n: number | null) => void;
  setPreviousLow: (v: State["previousLow"]) => void;
  reset: () => void;
};

const initial: State = {
  scenario: "base",
  enabledPresets: [],
  overrides: [],
  followUps: {},
  drafts: [],
  reservePlans: [],
  simulateStale: false,
  audit: [],
  chat: [],
  apiLog: [],
  tour: [],
  tourStep: null,
  tourAutoStarted: false,
  previousLow: null,
};

let n = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}`;
const audit = (action: string, entityType: string, entityId: string, metadata: AuditEvent["metadata"] = {}): AuditEvent => ({
  id: uid("aud"),
  at: new Date().toISOString(),
  actor: "user",
  action,
  entityType,
  entityId,
  metadata,
});

export const useDemo = create<State & Actions>()(
  persist(
    (set) => ({
      ...initial,
      setScenario: (scenario) => set({ scenario }),
      togglePreset: (id) =>
        set((s) => {
          const on = !s.enabledPresets.includes(id);
          return {
            enabledPresets: on ? [...s.enabledPresets, id] : s.enabledPresets.filter((x) => x !== id),
            audit: [audit(on ? "scenario.assumption_enabled" : "scenario.assumption_disabled", "assumption", id), ...s.audit],
          };
        }),
      setStale: (v) => set((s) => ({ simulateStale: v, audit: [audit(v ? "sync.simulated_stale" : "sync.recovered", "integration", "item_demo"), ...s.audit] })),
      applyEffect: (e) =>
        set((s) => {
          if (e.kind === "followup") return { followUps: { ...s.followUps, [e.invoiceId]: e.draftId }, drafts: [e, ...s.drafts] };
          if (e.kind === "override")
            return { overrides: [...s.overrides.filter((o) => o.transactionId !== e.transactionId), { transactionId: e.transactionId, field: "businessUse", newValue: e.newValue }] };
          return { reservePlans: [e, ...s.reservePlans] };
        }),
      addOverride: (transactionId, newValue, oldValue) =>
        set((s) => ({
          overrides: [...s.overrides.filter((o) => o.transactionId !== transactionId), { transactionId, field: "businessUse", newValue }],
          audit: [audit("transaction.classification_overridden", "transaction", transactionId, { field: "businessUse", oldValue, newValue }), ...s.audit],
        })),
      pushAudit: (...events) => set((s) => ({ audit: [...events.reverse(), ...s.audit].slice(0, 200) })),
      pushChat: (m) => set((s) => ({ chat: [...s.chat, m].slice(-40) })),
      setActionStatus: (messageId, actionId, status) =>
        set((s) => ({
          chat: s.chat.map((m) => (m.id === messageId && m.role === "assistant" ? { ...m, actionStatus: { ...m.actionStatus, [actionId]: status } } : m)),
        })),
      logApi: (e) => set((s) => ({ apiLog: [{ ...e, id: uid("req"), at: new Date().toISOString() }, ...s.apiLog].slice(0, 60) })),
      completeTour: (...steps) =>
        set((s) => (steps.every((x) => s.tour.includes(x)) ? s : { tour: [...new Set([...s.tour, ...steps])] })),
      setTourStep: (tourStep) => set({ tourStep, tourAutoStarted: true }),
      setPreviousLow: (previousLow) => set({ previousLow }),
      reset: () => set({ ...initial, tourAutoStarted: true }),
    }),
    {
      name: "flowfi-demo-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ ...s, apiLog: [] }),
    },
  ),
);

export function optionsFrom(s: Pick<State, "enabledPresets" | "overrides" | "followUps" | "simulateStale">): SnapshotOptions {
  return {
    assumptions: PRESETS.filter((p) => s.enabledPresets.includes(p.id)).map((p) => p.assumption),
    overrides: s.overrides,
    followUps: s.followUps,
    simulateStale: s.simulateStale,
  };
}

export const newId = uid;

export type { ProposedAction };
