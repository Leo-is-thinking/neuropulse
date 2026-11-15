# 99%

Closed-loop clinical cockpit for **Parkinson's and Alzheimer's** follow-up, built around the **Vexo Open band**.

The band streams wrist motion, microphone and light data. 99% turns these streams into clinical signals (tremor, dyskinesia, speech, sleep, falls), cross-checks them against the medication schedule, produces an AI-assisted synthesis for the clinician, and closes the loop by sending a nudge back to the patient's wrist.

**Live demo (simulated data, no hardware needed): <https://neuropulse-demo.netlify.app>** · Pitch and submission text: [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

> Hackathon submission. Demo patient: **Henri M., 74** (`henri-m`), Parkinson's, wearing-off pattern. A second patient, **Armel**, is the live-band page fed in real time by the physical band.

## What it does

1. **Capture** – a Python bridge reads the band over Bluetooth (or USB) and posts typed events to the web app.
2. **Detect** – on-device algorithms (`bridge/algos.py`): resting tremor (3–14 Hz incl. strong shakes), dyskinesia, posture (seated / standing / walking / hand behind back), walking, speech rate (Deepgram), with persistence gating and false-positive filters (e.g. toothbrushing is rejected).
3. **Analyse** – `/api/analyze` correlates events with the levodopa schedule. Gemini if a key is set, otherwise a deterministic fallback engine (reproducible demo, no network needed).
4. **Act** – recommendations (e.g. shift the 17:00 dose to 18:00, add a morning walk) generate a prescription and trigger the wrist: LED double blink + ElevenLabs voice cue.
5. **Model** – the *Modelization* page (`/modelization`, `?patient=armel` for live data) replays tremor episodes in 3D from the band's own motion and compares voice recordings over time (speech rate, silence share, volume, fade) with key takeaways for the clinician.
6. **Verify** – the loop re-checks the next dose (hand-to-mouth gesture, water sound, post-dose tremor drop).

## Quick start

Requirements: Node 20+, Python 3.9+ (`pip install bleak` for the real band).

```bash
cp .env.example .env.local      # all keys optional
npm install
npm run dev                     # http://localhost:3000
```

Open <http://localhost:3000>, choose **Henri M.**, click **Generate AI Synthesis**, then **Continue to Clinical Report** and apply the recommendations.
Backup trigger during a live demo: `Shift+T` (simulated tremor 5.3 Hz + glass break + HR 96).

### Simulated band (no hardware)

```bash
python3 bridge/live_streams.py --scenario tuesday --clock 16:34 --fake-hr --api http://localhost:3000
```

### Real band

1. Close any Vexo dashboard tab (one program per band).
2. Double-tap the band (LED blinks blue for 60 s).
3. Check: `python3 bridge/live_streams.py 72 --check` (`72` = number on your band's bag).
4. Stream: `python3 bridge/live_streams.py 72 --api http://localhost:3000 [--mic] [--stt]`
5. Open the live patient page: values refresh every 2 s.

**One-command demo**: `./demo.sh` starts the site and a watcher on the band. Start/stop live data from the **patient page button** or by double-tapping the band (rising/falling jingle, blue LED blink; arm-motion false taps are rejected). The patient page shows a "Bracelet connected / disconnected" badge. When live stops, in-progress phrases and tremor episodes are frozen and stay replayable in Modelization. A slow-speech alert fires under 100 words/min. `bridge/start-band.sh [stop|status|logs]` restarts site + bridge + Deepgram speech rate in one go.

More options (USB, calibration, flags): [`bridge/README.md`](bridge/README.md).

### Voice clips (Henri M.)

Henri's voice samples are simulated: `scripts/gen_voices.py` generates `public/voices/*.wav` with Deepgram Aura TTS, then degrades them progressively (slower, longer pauses, quieter, fading within a sentence) to mimic hypophonia. Regenerate with `DEEPGRAM_API_KEY=... python3 scripts/gen_voices.py` (needs `numpy`). Armel's voice data is real (band microphone + Deepgram).

## Environment variables

See [`.env.example`](.env.example). Without keys, every engine falls back to deterministic or simulated output.

| Variable | Use |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI clinical synthesis |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Voice cue on the laptop |
| `VEXO_WEBHOOK_URL`, `VEXO_WEBHOOK_TOKEN` | Actuation webhook served by the bridge |
| `DEEPGRAM_API_KEY` | Band microphone speech-to-text (bridge `--stt`), voice clip generation |

## Repository layout

```
src/                  Next.js 15 app (TypeScript, Tailwind 4, three.js)
  app/                pages + API routes (analyze, live-event, actuate-wrist, ...)
  components/         cockpit, clinical report, live panels, 3D hand
  data/               seed patients, roster, check-ups
  lib/                stores, bridge client
  types/clinical.ts   shared data contract
bridge/               Python bridge: band -> API (BLE/USB), algorithms, selftest
scripts/              Node launcher for the bridge, voice clip generator
public/               static assets, simulated voice clips (voices/)
docs/                 data inputs, false-positive handling, work briefs
orchestration/        team coordination: ownership, contracts, demo canon, status
vexo-open-kit/        vendored Vexo Open kit (MIT, unmodified) used by the bridge
```

## Tests and checks

```bash
npx tsc --noEmit                      # types
npm run build                         # production build
python3 bridge/selftest.py            # algorithm proofs (synthetic signals, false positives)
```

## Hardware limits (honest disclosure)

The band has **no haptic motor, no speaker and no heart-rate sensor**.

- "Double vibration" = LED amber double blink.
- Voice cue plays on the laptop speaker.
- Heart rate, HRV and extrasystoles are simulated (`--fake-hr`) and tagged as such. The source of every metric is listed at `GET /api/metric-sources`.

## Further reading

- [`orchestration/DEMO_CANON.md`](orchestration/DEMO_CANON.md) – exact demo numbers and timeline
- [`orchestration/CONTRACTS.md`](orchestration/CONTRACTS.md) – API shapes and event flow
- [`docs/DATA_INPUTS_AND_FALSE_POSITIVES.md`](docs/DATA_INPUTS_AND_FALSE_POSITIVES.md) – signals and rejection logic

## Disclaimer

Research prototype for a hackathon. Not a medical device. All patient data is synthetic.

## License

MIT, see [`LICENSE`](LICENSE). `vexo-open-kit/` keeps its own MIT license.
