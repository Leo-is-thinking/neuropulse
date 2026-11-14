# NeuroPulse — Orchestration Hub

Single source of truth for the 4 Claude terminals. **Read this folder before every work session. Update `STATUS.md` after every milestone.**

| File | Purpose |
|---|---|
| `OWNERSHIP.md` | Who owns which files. Never edit a file you do not own. |
| `DESIGN_SYSTEM.md` | Locked visual language (clean clinical, light). No terminal changes it alone. |
| `CONTRACTS.md` | API shapes, shared types, event flow between terminals. |
| `DEMO_CANON.md` | The exact demo numbers/times every screen must show. |
| `STATUS.md` | Live board: done / doing / blocked / needs-from-others. |
| `DECISIONS.md` | Append-only log of decisions (date, who, why). |
| `MESSAGES.md` | Append-only inbox between terminals (requests, answers). |
| `prompts/TERMINAL_N_START.md` | Paste into terminal N to (re)start it with full context. |

## Rules (apply to all 4 terminals)
1. **Ownership is strict.** Need a change in someone else's file → write a request in `MESSAGES.md`, do not edit it.
2. **Shared contracts (`src/types/clinical.ts`) are owned by T1.** Others import only. Need a new field → request it.
3. **Design is locked** in `DESIGN_SYSTEM.md`. Use the tokens/classes listed there. No new colors, fonts or radii without a `DECISIONS.md` entry.
4. **English only** in UI, logs, AI output.
5. **No duplicate work.** Check `STATUS.md` + `OWNERSHIP.md` before creating a file.
6. **Verify before declaring done:** `npx tsc --noEmit` and `npx next build` must pass (once `package.json` exists).
7. **Demo numbers come from `DEMO_CANON.md`.** Never hardcode a different number; read from API data where possible.
8. Keep it simple: no 3D libraries, no new heavy dependencies without a `DECISIONS.md` entry.

## Flow
`Band (T2) → POST /api/live-event (T1) → store (T1) → GET /api/patients/[id] → UI (T3, T4)`
`UI (T4) → POST /api/analyze (T1) → Analysis → T4 views → POST /api/actuate-wrist (T1) → webhook → Band (T2)`
