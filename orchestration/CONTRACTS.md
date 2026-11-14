# Contracts

Types: `src/types/clinical.ts` (T1). Import as `import type { Patient, Analysis, ... } from "@/types/clinical"`.

## API (all JSON, all owned by T1)
| Route | In | Out |
|---|---|---|
| `GET /api/patients` | — | `PatientSummary[]` |
| `GET /api/patients/[id]` | — | `Patient` (cells[], events[], schedule, prescriptionVersion, adherenceArmed, wristLog) |
| `POST /api/live-event` | `LiveEventInput` `{patientId, type: "tremor"\|"heart_rate"\|"voice"\|"acoustic"\|"fall", value?, amplitude?, tag?, context?, ts?}` | `{cells: Cell[], event: TimelineEvent}` or `{error}` |
| `POST /api/analyze` | `{patientId}` | `Analysis` (`confidence` 0..1, `links`, `rejected`, `crossChecks`, `findings[{text, cellRefs, reliability?}]`, `recommendations`, `source`) |
| `POST /api/actuate-wrist` | `{patientId, recommendationIds?: string[]}` (ids: `rec-shift-pm`, `rec-walk`; omit = apply all) | `ActuationResult` (`prescription`, `command`, `vexo{delivered,simulated,detail}`, `voice{...}`) |
| `POST /api/reset` | — | reload Henri demo dataset |
| `GET /api/data-source` | — | `DataSourceState` `{dataset:"henri-demo", live:{enabled,lastEventAt,lastSource,bandEvents,simEvents}}` |
| `POST /api/data-source` | `{action:"load_demo"\|"clear_live"\|"live_on"\|"live_off", patientId?}` | `DataSourceState` (clear_live also `{cleared}`) |

Cell pointers: `${patientId}.${day lowercase}.${stream}.${metric}` e.g. `henri-m.tue.tremor.tremor_burden`. Live column day = `live`.
Streams: `voice | tremor | balance | sleep | mobility | acoustic | cardiac | adherence`.
New metrics: `tremor.first_tremor_after_dose` (min), `balance.hours_dose_to_fall` (h).

## Component props (T4 exports, T3 mounts)
```ts
// EntanglementView.tsx
export default function EntanglementView(props: { patient: Patient; analysis: Analysis }): JSX.Element;
// ClinicalReportView.tsx
export default function ClinicalReportView(props: {
  patient: Patient; analysis: Analysis;
  onVerify: (cellId: string) => void;            // T3 scrolls/highlights the raw-data cell
  onApply: (recIds: string[]) => Promise<ActuationResult>; // T3 or T4 wires POST /api/actuate-wrist
}): JSX.Element;
// PrescriptionModal.tsx
export default function PrescriptionModal(props: { result: ActuationResult; onClose: () => void }): JSX.Element;
// VibratingHand.tsx
export default function VibratingHand(props: { hz: number; spikeTime: string; windowStart?: string; windowEnd?: string }): JSX.Element;
// VocalCordVisualizer.tsx
export default function VocalCordVisualizer(props: { speechRate: number; baseline: number; engagementDeltaPct: number }): JSX.Element;
// LiveVexoWidget.tsx (T2)
export default function LiveVexoWidget(props: { patientId: string; onLiveEvent?: () => void }): JSX.Element;
```
If a prop needs to change: post in `MESSAGES.md` first, then update this file in the same entry.

## Live refresh
After any `POST /api/live-event`, the UI re-fetches `GET /api/patients/[id]`. T2 calls `onLiveEvent` after a successful post so T3 can refetch (T3 may also poll every 2 s on `/patient/[id]`).

## Hardware bridge (T2)
Bridge → `POST /api/live-event`. Backend → bridge: `VEXO_WEBHOOK_URL=http://127.0.0.1:8765/actuate` (set by T2 docs). No API keys yet: Gemini + ElevenLabs are simulated; fallback engine is deterministic.

## Two independent inputs (user decision 2026-11-14)
1. **Dataset** = Henri M. 7-day demo/backup set (`load_demo`). Always available, deterministic.
2. **Live column** = real Vexo band via bridge. `POST /api/live-event` with `source:"band"` (default). Demo/backup trigger (Shift+T) must send `source:"sim"`. `clear_live` wipes only Live; `live_off` pauses intake (409 `live_disabled`).
UI (T3/T2) should show the source badge: "Band live" / "Simulated" / "Demo dataset".
