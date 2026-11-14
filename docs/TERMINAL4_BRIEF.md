# NeuroPulse — Terminal 4 Brief (AI Entanglement Visualizer, Clinical Report & Closed-Loop Prescription/Sync UI)

(Global context: see `TERMINAL1_BRIEF.md`.)

**Scope (only these files):**
- `src/components/VibratingHand.tsx`
- `src/components/VocalCordVisualizer.tsx`
- `src/components/EntanglementView.tsx`
- `src/components/ClinicalReportView.tsx`
- `src/components/PrescriptionModal.tsx`

**Goal:** high-impact clinical reasoning and action screens.

1. **`VibratingHand.tsx`** — lightweight CSS-3D + SVG/Canvas articulated hand/wrist wearing the Vexo band, oscillating at the detected tremor frequency (5.3 Hz). `16:00–17:00` mini timeline + replay button; synthesizes a realistic glass-shatter sound via Web Audio API at the `16:40` spike.
2. **`VocalCordVisualizer.tsx`** — 3D-perspective anatomical cross-section of the vocal folds showing Parkinson's atrophy / hypophonia (`11.2 words/10s` vs `22.0` baseline, `-38%` daily speech time). Highlights the multimodal advantage over motor-only trackers.
3. **`EntanglementView.tsx`** — Gemini connects 3D Hand (5.3 Hz) + Glass Break audio + Vocal Fold atrophy + Cardiac surge (+22 bpm) + Nocturia (5 wake-ups) into a `96% Confidence Score`; shows the rejected Wednesday `08:15 AM` toothbrushing false positive.
4. **`ClinicalReportView.tsx` & `PrescriptionModal.tsx`** — plain-English findings with `[Verify in Raw Data]` callbacks; 1-click adjustments (Levodopa 17:00 → 18:00 + outdoor walk cue); instant updated digital prescription preview; live Vexo actuation confirmation (LED + double vibration + closed-loop intake verification status).

**Before generating:** outline how 3D visuals stay lightweight/responsive; ask 2–3 questions on interactions and visual feel.
