# Brag Plan: FlowFi

## What is this app?
A cash-flow copilot for freelancers. It forecasts the next 30 days, explains exactly why the balance dips, and proposes fixes you approve by holding a button.

## The angle
"Your balance looks fine today. It isn't fine on Oct 23." The video follows one real forecast from the demo, Northstar Studio's $12,180, as it dips to $4,836.68 under the $5,000 floor. Then it shows why, how the copilot answers with receipts, the hold-to-approve fix, and the line recovering. Every number on screen is a real number the FlowFi engine produces.

## Hook (first 2-3 seconds)
Huge, calm "$12,180.00" on near-black with a green "today" tag. The voice says the balance looks fine. Then a thin line starts drawing to the right, which is the promise of a story.

## Key moments (the middle)
- The forecast line draws, crosses the dashed amber $5,000 floor, and a pin lands: "$4,836.68 · Oct 23" (beat-locked to 8.74s).
- The why: two driver bars grow ("INV-104 paid late −$6,800", "Contractor −$5,200"). Then the copilot's tool chips tick in one by one: get_forecast, get_invoices, run_scenario.
- Hold to approve: a ring fills around a Face-ID glyph, then a check appears. "Nothing moves without you."
- The payoff: the line lifts above the floor, the low becomes $11,636.68, and FlowScore counts 47 → 63.

## Outro / punchline
FlowFi wordmark. "See the *dip* before it happens." with "dip" in serif italic mint. URL: flowfi-ai.vercel.app.

## User flow worth showing
Home cash today → threshold alert + Why → ask copilot (tool trace) → hold to approve follow-up → toggle INV-104 on time → forecast recovers.

## Tone
- Preset: polished
- Creative direction: quiet premium fintech product film; dark, mint accent, big numerals
- Interpretation: 5 scenes, slow confident reveals, soft crossfades, minimal on-screen text. The narration carries the story and the visuals stay sparse.

## Format: landscape — 1920x1080
## Duration: ~22s (flexes to the voiceover)

## Visual identity (from the project)
- Background: #060807 (surface #0c0f0e, raised #141917)
- Accent: #9ef0c0 (mint), risk #ffb547 (amber)
- Text: #eef1ec, muted #8e9691
- Display font: Geist (fallback Inter/system sans); accent serif italic: Instrument Serif
- Mono: Geist Mono
- Strongest visual element: the hero forecast chart with the dashed amber floor and the under-floor segment in amber

## Share copy (draft)
Introducing FlowFi: see the dip before it happens. Explainable 30-day cash forecasts and a copilot that shows its work. Try the live demo, no sign-up.

## Audio direction
- Role: warm bed under narration + sparse professional accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (steady, clean), ducked to ~0.13 under VO
- Music treatment: fade in over 0.6s, duck under voice, lift slightly for the outro, fade out over the last 1.2s
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (≈110 BPM). Strong cues: 8.74s (floor breach pin), 17.47s (approval check / recovery), 22.93s (logo if the length allows). Beat grid ≈0.545s; tool chips land on every other beat for readability.
- Audio-reactive treatment: subtle; the mint glow behind the chart breathes with music RMS. No waveform visuals.
- SFX posture: sparse (polished): soft drop on the breach pin, soft clicks on the tool chips (first/last), a switch/click when the hold starts, a bell on the approval check, a soft impact on the logo.
- Restraint rule: never more than one SFX per second; no harsh high-frequency files.

## Voiceover script (Kokoro af_heart)
1. (Hook) "Your balance says you're fine."
2. (Dip) "FlowFi sees the dip three weeks early. Below your floor, on October twenty-third."
3. (Why/Copilot) "It shows you why, and every answer cites the tools behind the numbers."
4. (Approve) "Nothing changes until you hold to approve."
5. (Outro) "FlowFi. See the dip before it happens."

## Storyboard

### Scene 1 — Today — ~3.0s
"$12,180.00" huge, centered; small label "Cash today · Northstar Studio (fictional)".
Sequential/interaction: number counts up quickly from 0 then holds.
Audio intent: calm open, music fades in. Audio-coupled idea: none.
Transition mood: soft → Scene 2 (number slides up and shrinks into a chart header)

### Scene 2 — The dip — ~5.0s
The forecast chart draws left to right (real 31 daily points from the engine), with a dashed amber floor labeled "$5,000 floor". Where the line goes under the floor it turns amber; a pin + label "$4,836.68 · Oct 23" pops at the breach.
Sequential/interaction: line draw → pin (beat-locked ~8.74s).
Audio-coupled idea: soft drop SFX on the pin.
Transition mood: soft → Scene 3

### Scene 3 — Why + receipts — ~5.5s
Left: two driver bars grow ("INV-104 paid late −$6,800.00", "Mara Okafor Design −$5,200.00"). Right: a copilot card; tool chips appear one by one (get_forecast · get_invoices · run_scenario · create_invoice_followup_draft), then a one-line answer with mint money chips: "If INV-104 pays on time, your low becomes $11,636.68."
Sequential/interaction: yes, 4 chips on every other beat, then hold.
Audio-coupled idea: light clicks on the first and last chip.
Transition mood: soft → Scene 4

### Scene 4 — Hold to approve — ~4.0s
Center: proposed action card "Follow-up draft · INV-104 · Not sent". The ring fills over ~1.1s around a scan glyph, then a mint check appears. Caption: "Nothing moves without you."
Audio-coupled idea: switch click at hold start, bell at the check (~17.47s cue if aligned).
Transition mood: soft → Scene 5

### Scene 5 — Recovery + outro — ~5.0s
The chart line morphs above the floor (INV-104 on time); "Lowest $11,636.68" and FlowScore 47 → 63 "Stable" count up. Then a crossfade to the FlowFi logo + "See the dip before it happens." + flowfi-ai.vercel.app.
Audio-coupled idea: soft impact on the logo.

**Music mood for this video:** steady, premium, upbeat-but-calm
**Audio summary:** a clean bed ducked under a warm narrator, with five quiet accents marking breach, receipts, approval and logo.
