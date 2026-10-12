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
  { id: "home", label: "See cash today + 30-day forecast" },
  { id: "why", label: "Tap “Why” on the threshold alert" },
  { id: "ask", label: "Ask the copilot “What should I do?”" },
  { id: "evidence", label: "Open an evidence chip" },
  { id: "approve", label: "Hold to approve the follow-up draft" },
  { id: "toggle", label: "Toggle INV-104 paid on time" },
  { id: "audit", label: "Check the audit trail" },
  { id: "faults", label: "Run the fault lab" },
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
  completeTour: (s: TourStep) => void;
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
      completeTour: (step) => set((s) => (s.tour.includes(step) ? s : { tour: [...s.tour, step] })),
      setPreviousLow: (previousLow) => set({ previousLow }),
      reset: () => set({ ...initial }),
    }),
    {
      name: "flowfi-demo-v1",
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
