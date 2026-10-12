# Build journal

## 2026-10-12 — v0.1 public demo

**Shipped**
- Deterministic financial core: recurring detection, invoice late-risk, 3-scenario forecast, FlowScore (6 factors), 6 alert types.
- Idempotent ingestion engine with full-jitter backoff, atomic pages, cursor-after-commit, pending→posted reconciliation, quarantine. A fault lab runs 8 failure drills live.
- Copilot: 11 typed tools, deterministic intent router, grounded response contract, approval boundary with audit events.
- Marketing site and a phone-framed demo with a guided tour and live request/audit console.

**Decisions**
- Demo data is fixed "as of" 2026-10-12, so every visitor and every test sees identical numbers.
- The stateless API recomputes from client intent. That avoids a database for the public demo while keeping replay stability.
- Chart lines use straight daily segments. Smoothing would draw balances that never exist.

**Failures & fixes**
- Word-by-word headlines never appeared: each word started translated inside an `overflow-hidden` mask, so IntersectionObserver saw it as clipped. Fix: observe the visible wrapper and drive the words with variants.
- ESLint read the agent's `use()` tool helper as a React hook. Renamed it to `callFor()`.
- The first demo dataset never breached the floor. Retuned the contractor payment and card statement so the hero story (contractor payment + late invoice) is what the math actually produces, then locked it with fixture tests.
