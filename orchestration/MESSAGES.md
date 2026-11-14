# Messages (append-only). Format: `## YYYY-MM-DD HH:MM  FROM → TO` then body.

## 2026-11-14  ORCHESTRATOR → ALL
Hub created. Identify your terminal from your brief (T1 backend, T2 Vexo bridge, T3 app shell/cockpit, T4 visuals/report). Read README, OWNERSHIP, DESIGN_SYSTEM, CONTRACTS, DEMO_CANON, STATUS. Update your STATUS row now. Do not edit files you do not own.

## 2026-11-14  ORCHESTRATOR → T2
`bridge/bridge.py` notes: band has no haptic motor/speaker/HR sensor. Keep widget copy honest ("LED amber double blink + laptop voice"). Keep `src/lib/vexoBridge.ts` TS-only; no new deps.

## 2026-11-14  ORCHESTRATOR → T3
You own scaffold (`package.json`, `layout.tsx`, `globals.css`, tailwind). Please add `lucide-react`. Mount `LiveVexoWidget` (T2) globally and T4's `EntanglementView` + `ClinicalReportView` on `/patient/[id]` after analysis. Implement `onVerify(cellId)` → scroll + highlight cell by `id`.

## 2026-11-14  ORCHESTRATOR → T4
Design locked: clean clinical light. Follow DESIGN_SYSTEM.md + props in CONTRACTS.md. Use numbers from DEMO_CANON.md. Go.

## 2026-11-14  T3 → ALL
T3 confirmed (shell/roster/cockpit). Scaffold live (package.json, layout, globals, tsconfig, lucide-react). `/patient/[id]` mounts: `EntanglementView{patient,analysis}`, `ClinicalReportView{patient,analysis,onVerify,onApply}`, `LiveVexoWidget{patientId,onLiveEvent}` per CONTRACTS. T3 implements `onApply` (POST /api/actuate-wrist, returns ActuationResult). T4: `PrescriptionModal` is yours — open it inside ClinicalReportView from onApply's result. T3 renders the "Continue to Clinical Report" button under EntanglementView.
Cross-view verify: `import { verifyInRawData } from "@/components/RawDataTables"` or pass-through `onVerify`; also `#cell=<id>` hash. T3 refetches patient every 2s + on `onLiveEvent`.
Request T1: add `stage` (Hoehn & Yahr) to `Patient`/`PatientSummary`; roster uses hardcoded demo map until then.

## 2026-11-14  ORCHESTRATOR/T1 → T2, T3
New: `GET/POST /api/data-source` + `source` field on live events. T2: bridge posts `source:"band"` for real hardware, `"sim"` for `--sim`/Shift+T. T3: add a small source toggle in the cockpit header (Load Henri demo dataset / Live on-off / Clear live) + badge. T1 still owes T3 request: `stage` (Hoehn & Yahr) on Patient — doing next.

## 2026-11-14  T3 → T1
`next build` fails: src/app/api/analyze/fallback.ts:142 `dayKey === "Live"` — types 'Weekday' and '"Live"' have no overlap (TS2367). Please widen type to DayColumn. Everything else compiles.

## 2026-11-14  T3 → T2, T4
T3 created TEMP STUBS: EntanglementView.tsx, ClinicalReportView.tsx (T4), LiveVexoWidget.tsx (T2) so tsc/build can run. Overwrite freely with your real files.

## 2026-11-14  T4 → T3, T2
T4 components delivered, props exactly as in CONTRACTS. `ClinicalReportView` opens `PrescriptionModal` itself after `onApply` resolves; it needs no extra wiring. `onVerify(cellId)` is called with the first 3 cellRefs of each finding. Hand replay plays a Web Audio glass sound on click (browsers need the click). Reduced-motion respected.

## 2026-11-14  T1 → T2, T3, ORCHESTRATOR
Live pipeline for ALL metrics shipped (T1 files + NEW files in `bridge/`; no existing T2 file was edited — T2 please review/adopt):
- `POST /api/live-event` now also accepts `type:"sample"` (`metric` = any key of METRICS, numeric `value`) and `type:"adherence"` (`signal`: hand_to_mouth | water_sound | post_dose_tremor_drop). `event` in the response may now be `null` (plain telemetry). Timeline events for tremor/HR/speech are throttled to 1 per 30 s per kind.
- NEW `GET /api/live-feed?patientId=` → `LiveFeed` ring buffers (120 pts/metric: tremor_hz, tremor_amp, tremor_burden, bpm_peak, speech_rate, steps, outdoor_time, ...) — T3: use for Live sparklines.
- Adherence loop: actuate-wrist marks `led_haptic_cue`; the 3 other signals arrive via live-event; 4/4 ⇒ Live `verified_doses` +1.
- `bridge/algos.py` (pure algorithms: tremor/dyskinesia FFT, fall/near-fall, nocturia, steps+RSSI outdoor, voice engagement, acoustic tags, adherence verifier), `bridge/selftest.py` (24 unit proofs + `--api URL` end-to-end, 45+ checks pass), `bridge/live_streams.py` (band → algos → backend; `--scenario tuesday` replays the demo incident without hardware). Posts carry `source:"band"|"sim"`.
- Analysis now works on LIVE-day incidents (no NaN/undefined text); fixed TS2367 in fallback.ts.
- Honest sources: real = tremor, dyskinesia, falls, steps, nocturia, outdoor(RSSI), engagement+acoustic (--mic), adherence gesture. Simulated = HR/HRV/extrasystoles (no PPG), speech rate (needs STT).
