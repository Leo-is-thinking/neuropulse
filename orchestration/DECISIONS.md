# Decisions (append-only)

- 2026-11-14 · Orchestrator · **Design = clean clinical, light** (slate + teal, status colors only for flags). Matches T3's existing code. Locked in DESIGN_SYSTEM.md. Reason: user asked "ambiance clinique propre".
- 2026-11-14 · Orchestrator · Strength/voice-volume metric **dropped** (can't be measured). Reason: user.
- 2026-11-14 · Orchestrator · All data is **demo data**; goal is a working platform where inputs can be swapped for real band data later. No API keys: Gemini/ElevenLabs/Vexo webhook are simulated with deterministic fallback.
- 2026-11-14 · T1 · Seed aligned to demo canon (speech 11.2, nocturia 5 Tue, engagement 47→29 = −38%).
- 2026-11-14 · Orchestrator · No 3D library. CSS-3D + SVG only.
- 2026-11-14 · Orchestrator · Levodopa default schedule stays 08:00/12:30/17:00. Shift recommendation 17:00→18:00 per brief (clinically an earlier dose is also arguable — flagged in `fallback.ts`).
- 2026-11-14 · Orchestrator/T1 · **Two inputs kept separate**: 7-day Henri demo dataset (backup, loadable any time) vs Live column fed by the real band bridge; events tagged `source: band|sim`; endpoints `/api/data-source`.
