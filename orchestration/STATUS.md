# STATUS BOARD
_Update your row after every milestone. Format: `YYYY-MM-DD HH:MM`._

| Terminal | State | Done | Doing | Blocked / needs |
|---|---|---|---|---|
| **T1** Backend | ✅ done 2026-11-14 | Types, seed (4 patients), store, 6 API routes, cross-checks (92/96%), new metrics; `tsc` + `next build` pass in temp scaffold; seed aligned to DEMO_CANON | live-event `sample`/`adherence` types, `/api/live-feed`, live-incident analysis, `bridge/algos.py` + `selftest.py` + `live_streams.py` (see MESSAGES) | `stage` (Hoehn & Yahr) field | — |
| **T2** Vexo bridge | 🟡 in progress (seen: `bridge/bridge.py`, `vexo-open-kit/`) | — | `vexoBridge.ts`, `LiveVexoWidget.tsx` | Confirm: scope vs `bridge/bridge.py`; report real-band limits in widget |
| **T3** App shell/cockpit | 🟡 code done, awaiting T2/T4 components | Scaffold, roster `/`, cockpit `/patient/[id]` (tabs, LIVE col, verify highlight, CTA, onApply), RawDataTables; roster verified 200 | integration build | `LiveVexoWidget` (T2), `EntanglementView` + `ClinicalReportView` (T4) for `tsc`/`next build`; `stage` field (T1) |
| **T4** Visuals/report | ✅ code done 2026-11-14 | `VibratingHand`, `VocalCordVisualizer`, `EntanglementView`, `ClinicalReportView`, `PrescriptionModal` (replaced T3 stubs); `tsc` + `next build` pass | visual QA in browser pending | Needs eyes-on check at `/patient/henri-m` → Generate AI Synthesis |

## Open items
- [ ] T3: confirm scope in OWNERSHIP.md (assumed).
- [ ] Anyone: create Next.js scaffold (`package.json`, `layout.tsx`) — **T3 owns it**.
- [ ] Integration test once all 4 land: roster → Henri → analyze → apply → wrist log.
