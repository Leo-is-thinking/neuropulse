# 99% — Terminal 1 Brief (Backend, Data Schema, 7-Day Dataset & API Routes)

## Project
99% — Closed-Loop "Zero-UI" Clinical OS for Parkinson's Disease (VexoHack YC).
- Language: all UI text, medical metrics, logs, and AI outputs in ENGLISH.
- Stack: Next.js (App Router), TypeScript, Tailwind CSS, Lucide-React.

## Product Vision & End-to-End Flow
Neurologists manage Parkinson's patients who wear a screenless Vexo wristband (no smartphone or screen interaction required from the patient).

1. **Patient Roster (`/`)**: circular patient avatars with urgency status rings; doctor clicks "Henri M. (74)".
2. **7-Day Raw Data Cockpit (`/patient/[id]` – View 1)**: 7 days (Mon–Sun) + a live real-time column across 7 sensor streams, plus a live stream from the physical Vexo wristband.
3. **Cross-Modal AI Entanglement (View 2)**: doctor clicks "Generate AI Synthesis & Recommendations".
   - 3D-perspective articulated hand/wrist replaying the 16:40 tremor spike (5.3 Hz) synced with shattering-glass audio.
   - 3D-perspective vocal cords (glottis) visualizer: Parkinson's vocal fold atrophy / hypophonia (Speech Rate drop vs healthy baseline — blind spot for motor-only trackers).
   - Gemini correlates multiple streams to a high confidence score (e.g. 96%) and explicitly rejects false positives (e.g. Wednesday 08:15 toothbrushing motion with normal heart rate).
4. **Clinical Report & 1-Click Action (View 3 & 4)**: plain-English findings with clickable `[Verify in Raw Data]` links back to tables; 1-click recommendations (shift afternoon Levodopa 17:00 → 18:00 + morning outdoor walk nudge).
5. **Closed-Loop Execution**: applying the protocol generates an updated digital prescription AND sends an actuation command (Amber LED + double haptic vibration + ElevenLabs voice prompt) to the wristband, arming automatic intake verification (wrist-to-mouth gesture + water sound + post-dose tremor drop).

## The 7 Data Streams
1. **Voice (Hypophonia & Engagement)**: `Speech Rate` (words/10s vs 22.0 healthy baseline) + `Daily Verbal Engagement` (min/day, % trend) — Vexo mic / ElevenLabs.
2. **Tremor & Dyskinesia (IMU)**: `Tremor Burden` (% awake time, 4–6 Hz resting tremor) & `Dyskinesia Index` (post-dose involuntary movements) + peak windows.
3. **Balance & Falls (IMU)**: `Fall & Instability Events` (confirmed falls, near-fall stumbles, freezing of gait).
4. **Sleep & Nocturia (IMU + night window)**: `Nocturia Wake-Ups` (bathroom trips/night) & sleep fragmentation.
5. **Mobility & Outdoor Time (Steps + Bluetooth RSSI)**: `Active Steps` + `Outdoor Time` (min away from home base).
6. **Acoustic Environment (ElevenLabs Audio Tagging)**: `Acoustic Context Tags` (`Crowd_Stress`, `Object_Drop_Glass_Break`, `Pill_Water`).
7. **Cardiac Biometrics (PPG)**: `Cardiac Stress & Arrhythmia` (BPM, HRV, extrasystoles).
- Composite: `Verified Med Adherence` = LED/haptic cue + hand-to-mouth gesture + water sound + post-dose tremor reduction.

## Collaboration & Anti-Loop Rules (CRITICAL)
- Keep architecture simple, modular, fast to iterate (no over-engineered 3D libs or fragile abstractions).
- Work strictly within assigned files — zero merge conflicts across the 4 terminals.
- BEFORE writing full code: briefly outline the approach and ask 2–3 focused questions (UX details, data realism, hardware setup); build step by step.

---

## YOUR ROLE — Terminal 1: Backend, Data Schema, 7-Day Parkinson's Dataset & API Routes

**Scope (only these files):**
- `src/types/clinical.ts`
- `src/data/patientsSeed.ts`
- `src/lib/clinicalStore.ts`
- `src/app/api/**/*`

**Goal:** shared TypeScript contracts, a realistic 7-day + Live dataset for 4 Parkinson's patients, an HMR-safe in-memory store, and API endpoints.

**Primary demo case — Henri M., 74:**
- Tuesday 16:40 pre-dose wearing-off + glass drop (5.3 Hz tremor spike)
- Wednesday 08:15 toothbrushing false positive (normal heart rate)
- High nocturia
- Vocal atrophy / hypophonia

**API endpoints:**
- `GET /api/patients` & `GET /api/patients/[id]`
- `POST /api/live-event` — ingests real-time wrist tremor, heart rate, voice snippet, or acoustic tag into the "Live" column
- `POST /api/analyze` — Gemini API if `GEMINI_API_KEY` is set, with instant deterministic clinical fallback; returns cross-modal entanglement links, confidence score, rejected false positives, plain-English findings with raw-data cell pointers, and actionable recommendations
- `POST /api/actuate-wrist` — updates Levodopa schedule, generates updated prescription object, triggers Vexo wristband webhook / ElevenLabs voice cue

**First step:** propose the data structure and ask 2–3 quick questions to confirm clinical details or environment keys before generating files.
