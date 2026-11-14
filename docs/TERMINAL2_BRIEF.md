# NeuroPulse — Terminal 2 Brief (Vexo Wristband Hardware Bridge, Audio/Haptic Actuation & Live Demo Controls)

(Global context: see `TERMINAL1_BRIEF.md`.)

**Scope (only these files):**
- `src/lib/vexoBridge.ts`
- `scripts/vexo-bridge.mjs`
- `src/components/LiveVexoWidget.tsx`

**Goal:** bridge the physical Vexo wristband and the web app — live sensor capture on stage AND real hardware actuation when the doctor updates the protocol.

1. **Incoming stream:** capture wrist motion (~4–6 Hz Parkinsonian tremor bursts) and mic/ambient events from the band (Web Serial, WebSocket, or local webhook); push to `POST /api/live-event`; notify the UI to refresh in real time.
2. **Outgoing actuation:** on "Apply Protocol & Sync Vexo Band", send LED + double-vibration command to the band and play the ElevenLabs cloned caregiver/protocol voice reminder.
3. **Floating demo widget (`LiveVexoWidget.tsx`):** discreet bottom-right pill showing live wrist Hz / connection status, plus a backup trigger (`Shift + T` or button) to simulate a live tremor + glass-break event if wireless drops during the demo.

**Before coding, ask 2–3 questions:** how the band is connected (USB Serial, BLE/WebSocket, or webhook) and how the live demo trigger should behave.
