# File Ownership

| Terminal | Role | Owns (only these) |
|---|---|---|
| **T1** | Backend, schema, dataset, API | `src/types/clinical.ts`, `src/data/patientsSeed.ts`, `src/lib/clinicalStore.ts`, `src/app/api/**` |
| **T2** | Vexo hardware bridge, actuation, demo controls | `src/lib/vexoBridge.ts`, `scripts/vexo-bridge.mjs`, `src/components/LiveVexoWidget.tsx`, `bridge/**`, `vexo-open-kit/**` |
| **T3** *(assumed — confirm in STATUS.md)* | App shell, roster, 7-day raw-data cockpit | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/patient/**`, `src/app/globals.css`, `src/components/RawDataTables.tsx`, other roster/cockpit components, `package.json`, `tailwind.config.*`, `tsconfig.json`, `next.config.*` |
| **T4** | AI entanglement visuals, report, prescription UI | `src/components/VibratingHand.tsx`, `VocalCordVisualizer.tsx`, `EntanglementView.tsx`, `ClinicalReportView.tsx`, `PrescriptionModal.tsx` |
| **Orchestrator** | This hub | `orchestration/**`, `docs/**` |

## Integration points (who calls whom)
- T3's `patient/[id]/page.tsx` mounts T4's `EntanglementView` / `ClinicalReportView` and T2's `LiveVexoWidget` (in `layout.tsx` or page). T3 does the mounting; T4/T2 export default components with the props in `CONTRACTS.md`.
- T4 never fetches by itself except `PrescriptionModal` → `POST /api/actuate-wrist` (callback prop preferred; see CONTRACTS).
- `[Verify in Raw Data]` → T4 calls `onVerify(cellId)`; T3 scrolls/highlights the cell with that `id`.
