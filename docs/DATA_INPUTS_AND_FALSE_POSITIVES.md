# NeuroPulse — Wristband Data Inputs & Anti-False-Positive Matrix

## 1. Data inputs & retained clinical metrics

| # | Raw stream | Sensor / source | Retained metric (UI) | Clinical role |
|---|---|---|---|---|
| 1 | Voice — articulation rate | Continuous mic (Vexo + ElevenLabs STT) | `Speech Rate` (words / 10 s vs healthy baseline 22.0) | Detects vocal atrophy (hypophonia) and motor slowing without an active test |
| 2 | Voice — daily social volume | Continuous mic (speaker diarization) | `Daily Verbal Engagement` (min spoken/day, % trend) | Objective measure of social isolation and dopamine-linked apathy |
| 3 | Kinematics — tremor & dyskinesia | Wrist IMU (accel + gyro) | `Tremor Burden` (% awake time, 4–6 Hz) & `Dyskinesia Index` + **Hour of first tremor after drug intake** | Real treatment-efficacy curve (On/Off, wearing-off before next dose) |
| 4 | Kinematics — balance & falls | Wrist IMU (impact > 2.5 G + orientation) | `Fall & Instability Events` (falls + stumbles / week) + **Hours between drug intake and fall** | Balance loss and hip-fracture risk before a serious accident |
| 5 | Sleep — night wake-ups | Wrist IMU + circadian clock (23:00–06:00) | `Nocturia Wake-Ups` (bathroom trips / night) | Nocturia (60–80 % of PD patients) and sleep fragmentation |
| 6 | Mobility — walking & outings | Pedometer + Bluetooth RSSI distance | `Active Steps` (steps/day) & `Outdoor Time` (min away from home) | Checks whether the patient walks outside (only proven lever to slow neurodegeneration) |
| 9 | Therapeutic adherence (composite) | LED/vibration actuation + IMU + audio | `Verified Med Adherence` (% confirmed doses) | Confirms intake without patient click (glass-to-mouth gesture + water sound + tremor drop) |

## 2. Anti-false-positive cross-check matrix (Gemini engine)

| Detected clinical event | Primary signal | Confirmation signals (cross-check) | False positive eliminated | Reliability |
|---|---|---|---|---|
| Dyskinesia (overdose) | IMU: large irregular movements | Timing (45–90 min after confirmed intake) + Voice (normal or fast rate) | Confusing overdose with underdose (tremor) | 92 % |
| Validated medication intake | Actuation: LED + vibration at scheduled time | IMU (glass-to-mouth gesture < 5 min) + Audio (`Pill_Water`) + tremor drop at +35 min | Missed manual entry on smartphone | 96 % |

## 3. Schema implications (Terminal 1)
- New derived fields: `firstTremorAfterDoseMin`, `hoursDoseToFall`.
- `Dose` events: scheduled / actuated / confirmed (gesture + water + tremor drop at +35 min).
- Analyze output must carry a per-finding `reliability` score and `rejectedFalsePositives[]`.
