"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Snapshot } from "./core/engine";
import { optionsFrom, useDemo } from "./store";

export type ApiSnapshot = Snapshot & { computeMs: number };

/** fetch wrapper that records every call in the demo's live request log. */
export async function api<T>(path: string, body?: unknown, note?: string): Promise<{ status: number; data: T }> {
  const t0 = performance.now();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  useDemo.getState().logApi({ method: body === undefined ? "GET" : "POST", path, status: res.status, ms: Math.round(performance.now() - t0), note });
  return { status: res.status, data };
}

/** Snapshot of the workspace computed server-side from the current demo state. */
export function useSnapshot() {
  const enabledPresets = useDemo((s) => s.enabledPresets);
  const overrides = useDemo((s) => s.overrides);
  const followUps = useDemo((s) => s.followUps);
  const simulateStale = useDemo((s) => s.simulateStale);
  const options = useMemo(
    () => optionsFrom({ enabledPresets, overrides, followUps, simulateStale }),
    [enabledPresets, overrides, followUps, simulateStale],
  );
  const key = JSON.stringify(options);
  const [data, setData] = useState<ApiSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    api<ApiSnapshot>("/api/snapshot", { options: JSON.parse(key) }, "snapshot")
      .then(({ status, data }) => {
        if (mine !== seq.current) return;
        if (status !== 200) throw new Error((data as unknown as { error: string }).error);
        setData(data);
        setError(null);
      })
      .catch((e: Error) => mine === seq.current && setError(e.message || "Network error"))
      .finally(() => mine === seq.current && setLoading(false));
  }, [key, nonce]);

  return { data, error, loading, options, retry: () => setNonce((n) => n + 1) };
}

type SnapshotState = ReturnType<typeof useSnapshot>;
const SnapshotContext = createContext<SnapshotState | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  return createElement(SnapshotContext.Provider, { value: useSnapshot() }, children);
}

export function useSnap(): SnapshotState {
  const v = useContext(SnapshotContext);
  if (!v) throw new Error("useSnap must be used inside <SnapshotProvider>");
  return v;
}
