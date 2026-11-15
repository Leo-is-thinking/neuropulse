# 99% – Hackathon submission

**Tagline:** a closed-loop clinical cockpit for Parkinson's and Alzheimer's, built on the Vexo Open band.

- **Live demo:** https://neuropulse-demo.netlify.app (simulated patient Henri M. – open it, pick *Henri M.*, click *Generate AI Synthesis*)
- **Code:** https://github.com/Leo-is-thinking/neuropulse (MIT)
- **Real-band page:** `/patient/armel` and `/modelization?patient=armel` (needs the physical band, see README)

## Problem
Between two consultations, neurologists are blind. Tremor, dyskinesia, speech slowing and sleep change hour by hour with the medication cycle, but the clinician sees one 20-minute snapshot. Patients under-report, especially when speech and memory are affected.

## Solution
The band streams wrist motion, microphone and light. 99% turns this into clinical signals, crosses them with the levodopa schedule, and closes the loop:

1. **Capture** – Python bridge reads the band (BLE/USB) and posts typed events.
2. **Detect** – on-device algorithms: resting tremor, strong shakes, dyskinesia, walking, posture, speech rate (Deepgram), with persistence gating and false-positive rejection (toothbrushing, arm swings).
3. **Analyse** – correlates events with the dose schedule; Gemini synthesis, deterministic fallback so the demo is reproducible offline.
4. **Act** – recommendations (e.g. shift 17:00 dose to 18:00) generate a prescription and nudge the patient's wrist (LED) plus a voice cue.
5. **Model** – 3D replay of tremor episodes from the band's real motion; voice recordings compared over time (rate, silences, volume, fade).
6. **Verify** – re-checks the next dose (hand-to-mouth gesture, post-dose tremor drop).

## Tech
Next.js 15, TypeScript, Tailwind 4, three.js · Python bridge (bleak) · Deepgram (STT/TTS) · Gemini · ElevenLabs · Netlify.

## Honest limits
The band has no haptic motor, speaker or heart-rate sensor. "Vibration" = LED blink, voice plays on the laptop, HR/HRV are simulated and tagged as such (`GET /api/metric-sources`). All patient data except Armel's live session is synthetic. Not a medical device.

## Verification
`python3 bridge/selftest.py` → 41/41 checks (synthetic signals, false positives) · `npx tsc --noEmit` clean · `npm run build` passes.

## Run it in 2 minutes
```bash
git clone https://github.com/Leo-is-thinking/neuropulse && cd neuropulse
cp .env.example .env.local   # all keys optional
npm install && npm run dev   # http://localhost:3000
```
