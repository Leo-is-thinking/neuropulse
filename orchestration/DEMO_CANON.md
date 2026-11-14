# Demo Canon — numbers every screen must agree on

Patient: **Henri M., 74** (`id: henri-m`), urgency **critical**. Seed lives in `src/data/patientsSeed.ts` (T1). Other patients: Margaret L. (watch), Robert K. (stable), Yuki T. (stable).

| Fact | Value |
|---|---|
| Levodopa schedule (default) | 08:00, 12:30, 17:00 (100 mg each) |
| Tuesday spike | **16:40**, resting tremor **5.3 Hz**, 20 min before the 17:00 dose (wearing-off) |
| Same minute | Glass-break audio tag `Object_Drop_Glass_Break`; HR **96 bpm** (**+22 bpm** vs 74 live baseline), HRV 19 ms, 9 extrasystoles |
| 16:34 | Speech rate **67 words/min** vs **132** baseline (**−49%** vs baseline); daily verbal engagement **−38%** over the week (47 → 29 min/day) |
| 16:42 | Near-fall stumble (+ freezing 16:55) |
| Nocturia | **5** wake-ups Tuesday night (3–5 all week) |
| Rejected false positive | **Wed 08:15**, 4.9 Hz rhythmic wrist motion = **toothbrushing**, on-state (15 min after 08:00 dose), HR 72 normal |
| Confidence | **96%** (fallback engine, deterministic) |
| Cross-check reliabilities | Dyskinesia 92% · Validated intake 96% |
| Dose→event timing | First tremor 250 min after last dose (Tue); instability 4.2 h after dose |
| Recommendations | (1) Shift afternoon Levodopa **17:00 → 18:00**; (2) Morning outdoor walk nudge **09:30** |
| Closed loop | Amber LED + double vibration + ElevenLabs voice → arms intake verification: hand-to-mouth gesture + water sound (`Pill_Water`) + post-dose tremor drop at +35 min |

Hardware reality (from T2): the band has **no haptic motor, no speaker, no heart-rate sensor**. Mapping: "double vibration" = LED amber double blink; voice cue plays on the laptop speaker; live HR is simulated. UI copy may still say "LED + double vibration cue" but T2's status must tell the truth in the widget.
