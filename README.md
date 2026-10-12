# FlowFi — see the dip before it happens

**FlowFi is a cash-flow copilot for freelancers and small businesses: explainable 30-day forecasts, a copilot that cites the tool behind every number, and nothing changes without your explicit approval.**

**Live demo:** https://flowfi-ai.vercel.app · runs entirely on fictional data for *Northstar Studio*. No sign-up, no keys.

**Native iOS app (SwiftUI):** [`ios/`](ios/): same engine ported to Swift (`FlowFiCore`), parity-tested against the web numbers, with a Keychain + Face ID vault and the guided tour. See [ios/README.md](ios/README.md).

**Launch film (24s, voiceover):** [`public/flowfi-film.mp4`](public/flowfi-film.mp4), built with HyperFrames from [`brag-output/composition`](brag-output/composition). Every number in it is real engine output.

> Honesty first: this is a portfolio build. Everything under **Measured evidence** was produced by code in this repo. Everything under **Roadmap** is not built yet.

---

## The 90-second story (try it at `/demo`)

1. Home shows **$12,180.00** cash today and a 30-day forecast.
2. FlowFi warns the balance dips to **$4,836.68 on Oct 23**, $163.32 under the $5,000 floor.
3. **Why?** Two dominant drivers: invoice INV-104 ($6,800) is expected 10 days late, and a $5,200 contractor payment lands the same week.
4. Ask the copilot *"What should I do?"*. It calls `get_forecast → get_invoices → run_scenario → create_invoice_followup_draft` and proposes a follow-up draft.
5. **Hold to approve.** The draft is saved inside FlowFi. Nothing is sent.
6. Toggle *"INV-104 paid on time"*. The low point moves to $11,636.68 and FlowScore goes from 47 (Watch) to 63 (Stable).
7. The audit trail shows the AI run, the proposal, the approval and the scenario change.
8. Run the **fault lab**: duplicate webhooks, 429s, 5xx outages, a worker crash and malformed rows, all executed live against the ingestion engine.

## Architecture

```
            ┌────────────────────── Next.js app (Vercel) ───────────────────────┐
 Browser    │  /            marketing site (Motion, NumberFlow, live core)       │
 ────────►  │  /demo        phone-framed product + live request/audit console    │
            │                                                                    │
            │  /api/snapshot  /api/forecast  /api/transactions                   │
            │  /api/ai/chat   /api/actions/approve  /api/fault-lab  /api/health  │
            └──────────────┬─────────────────────────────┬───────────────────────┘
                           │                             │
             src/lib/core (deterministic)     src/lib/agent (copilot)
             ├─ dataset    fictional fixture  ├─ tools.ts   11 typed tools, arg validation,
             ├─ recurring  monthly detection  │             untrusted-text sanitizer
             ├─ invoices   late-risk          ├─ agent.ts   intent router → tool calls →
             ├─ forecast   3 scenarios        │             grounded answer contract
             ├─ flowscore  6 visible factors  └─ actions.ts approval boundary + audit
             ├─ alerts     6 rule types
             └─ ingest     idempotent sync, retries, quarantine (+ faultlab)
```

**Key decisions**

| Decision | Why |
|---|---|
| Calculations are never the LLM's job | Balances, forecasts and scores come from deterministic TypeScript. The copilot can only *quote* tool output. |
| Integer cents everywhere | `assertMinor` rejects floats, and rounding is half-away-from-zero and explicit. |
| Stateless demo API | The browser sends its approvals and assumptions; the server recomputes. That makes it replay-stable and easy to host on Vercel. |
| Proposals, not writes | Every write tool returns a `proposed_action`. `/api/actions/approve` rejects anything without an explicit approval proof. |
| Deterministic demo agent | The public demo needs no API key. The router obeys the same response contract a tool-calling LLM would, so a model can be swapped in behind it. |

## Forecasting methodology

`projected[d] = projected[d-1] + inflows[d] − outflows[d] − variable_daily`

- **Recurring streams** are monthly merchants with ≥3 occurrences and 26–35-day gaps. The latest amount is used, so price increases are captured.
- **Invoices** are expected on the due date plus the client's average historical lateness. Confidence drops with lateness.
- **Variable spend** is the trailing 60-day average of non-recurring depository spend.
- **Scenarios:** *conservative* delays receivables with confidence below 0.8 by 7 days and adds 25% to variable spend. *optimistic* takes 15% off variable spend.
- **Explainability:** dominant drivers before the low point include *delayed receivables* (due before the low point, expected after it). Every forecast carries `dataFreshness` and a `modelVersion`.

## AI tool & approval architecture

Response contract: `answer · citations · calculations · proposedActions · uncertainties · guardrails · dataFreshness · trace`.

Guardrails, each covered by a test in `tests/agent.test.ts`:

- Money values in answers must trace to tool output.
- Stale data is disclosed *before* any recommendation.
- Money-movement requests are refused and redirected to a plan-only proposal.
- Instruction-like text in transaction memos is treated as data (the demo dataset contains a hostile memo from "QuickPrint Co").
- Unknown tools and hallucinated arguments fail closed.
- Approval cannot be bypassed: no proof, wrong state or invalid payload means rejection.

## Measured evidence

All numbers below were produced by commands in this repo. Re-run them yourself.

| What | Command | Result |
|---|---|---|
| Unit, fixture and guardrail tests (web) | `npm test` | **37 / 37 passing** |
| Swift engine: parity with web, copilot guardrails, fault lab | `cd ios/Packages/FlowFiCore && swift test` | **19 / 19 passing** (same $4,836.68 low, 47 → 63 FlowScore, 8/8 faults) |
| Fault lab (8 scenarios from spec §6.2) | `POST /api/fault-lab` or the button on `/` | **8 / 8 pass** (100 duplicate webhooks → 0 duplicate rows, 1 recompute) |
| Forecast benchmark: full snapshot over 10,000 transactions, 3 scenarios + FlowScore + alerts, 60 runs | `npm run bench` | **median 8.19 ms · P95 9.25 ms** on Apple M4 Pro, Node 22.14 |

The benchmark pads the demo workspace with replayed history up to 10k rows. It measures compute only, not network.

## Security & privacy boundaries

- No secrets and no provider tokens: the demo uses a fixture provider. `.env*` is git-ignored.
- All API inputs are schema-checked (`src/lib/api.ts`), with body size and message length limits.
- Untrusted provider text is sanitized before it reaches the agent layer.
- The approval boundary is enforced server-side in `executeAction`. The client never executes writes on its own.

## Known limitations

- **No LLM in the public demo.** The copilot is a deterministic intent router. AI-quality metrics (tool-selection accuracy across a 200–500 prompt gold set) are not measured yet.
- **No database.** State lives in your browser (localStorage), and the server is stateless.
- **No real bank connection.** The ingestion engine is provider-agnostic and exercised by a scripted provider. A Plaid Sandbox adapter is not built.
- **iOS app is a separate native client**, not a React Native bridge: the spec's RN + Swift-module design was replaced by a fully native SwiftUI app with the same `FlowFiSecureVault` API (Keychain + LocalAuthentication). It is not on the App Store; run it from Xcode.
- FlowScore is an internal indicator, **not a credit score**.

## Roadmap

Plaid Sandbox adapter + webhooks · Postgres + Redis worker · TestFlight build of the iOS app · LLM provider behind the existing agent contract + gold-set evaluation harness.

## Local setup

```bash
npm install
npm run dev        # http://localhost:3000  ·  /demo for the product
npm test           # vitest
npm run bench      # forecast benchmark
npm run typecheck && npm run lint && npm run build
```

No environment variables are required.

---

*Northstar Studio, its clients and all amounts are fictional. FlowFi is not a bank and does not give tax or legal advice.*
