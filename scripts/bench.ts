// Forecast benchmark (spec §18): full snapshot (recurring detection, 3 scenario
// forecasts, FlowScore, alerts) over the demo workspace padded to 10k
// transactions. Run: npm run bench
import os from "node:os";
import { demoData } from "../src/lib/core/dataset";
import { addDays } from "../src/lib/core/dates";
import { buildSnapshot } from "../src/lib/core/engine";
import type { NormalizedTransaction } from "../src/lib/core/types";

const TARGET = 10_000;
const extra: NormalizedTransaction[] = [];
for (let i = 0; demoData.transactions.length + extra.length < TARGET; i++) {
  const base = demoData.transactions[i % demoData.transactions.length];
  extra.push({ ...base, id: `bench_${i}`, providerTransactionId: `bench_${i}`, occurredAt: addDays("2026-06-30", -Math.floor(i / 6)), pending: false });
}
const data = { ...demoData, transactions: [...demoData.transactions, ...extra] };

const RUNS = 60;
for (let i = 0; i < 5; i++) buildSnapshot({}, data); // warm-up
const times: number[] = [];
for (let i = 0; i < RUNS; i++) {
  const t0 = performance.now();
  buildSnapshot({}, data);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
console.log(JSON.stringify({
  workload: `${data.transactions.length} transactions, 30-day horizon, 3 scenarios + FlowScore + alerts`,
  runs: RUNS,
  medianMs: +pct(50).toFixed(2),
  p95Ms: +pct(95).toFixed(2),
  node: process.version,
  cpu: os.cpus()[0]?.model,
}, null, 2));
