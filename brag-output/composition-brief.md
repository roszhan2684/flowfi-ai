# Hyperframes Composition Brief: FlowFi

## Objective
Short polished launch film for FlowFi with Kokoro voiceover.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.5s (flexed to the voiceover)

## Source Material
- Project root: /Users/roszhanraj/FlowFi_AI
- Primary files read: src/components/landing/*, src/components/app/*, src/lib/core/* (engine output), globals.css, README.md
- Product name: FlowFi
- Tagline / strongest claim: "See the dip before it happens."
- Key UI to recreate: hero forecast chart (dashed amber $5,000 floor, amber under-floor segment), driver bars, copilot tool trace, hold-to-approve ring, FlowScore.
- Copy that must appear verbatim: "See the dip before it happens.", "Nothing moves without you.", "$12,180.00", "$4,836.68 · Oct 23", "$11,636.68"
- All numbers are real FlowFi engine output for the fictional Northstar Studio.

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium fintech product film
- Hook: "$12,180.00 — Looks fine" + VO "Your balance says you're fine."
- Outro: FlowFi logo + "See the dip before it happens." + flowfi-ai.vercel.app
- Avoid: generic SaaS language, abstract filler, redesigning the product

## Visual Identity
- Background #060807, surface #0c0f0e, text #eef1ec, muted #8e9691, accent #9ef0c0, risk #ffb547
- Fonts: Geist 400/500, Geist Mono, Instrument Serif italic (local woff2 copies)

## Storyboard
1. Today — 0–3.7s — $12,180.00 counts up, "Looks fine"
2. The dip — 3.2–9.2s — the chart draws, the breach pin "$4,836.68 · Oct 23"
3. Why + receipts — 8.74–15.1s — driver bars, 4 tool chips, grounded answer
4. Hold to approve — 14.73–19.0s — the ring fills, check at 17.47s, "Nothing moves without you."
5. Recovery + outro — 18.56–24.5s — line lifts, low $11,636.68, FlowScore 47→63, logo + tagline

## Audio
- Role: warm bed under narration + sparse accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3, ducked to ~0.14–0.16 under VO, lifted to 0.3 between 18.3–21s, faded out at the end
- Cue guidance: preset music-cues.json (≈110 BPM); beat-locked 8.74s (scene 3), 17.47s (approval check); beat-grid chips 9.83/10.37/10.93/11.46, url 22.37
- Audio-reactive: subtle; the mint background glow opacity/scale follows per-frame bed energy (extract-audio-data.py)
- SFX: drop (breach pin), clicks (first/last chip), switch (hold start), bell (check), soft impact (logo)
- Voiceover: Kokoro af_heart, 5 lines placed per scene
