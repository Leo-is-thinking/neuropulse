#!/usr/bin/env python3
"""NeuroPulse live pipeline: Vexo band -> algos.py -> POST /api/live-event -> dashboard Live column.

Wires EVERY metric (see algos.py) and the closed-loop adherence verifier. Reuses bridge.py for the
LED/voice actuation server (POST http://127.0.0.1:8765/actuate).

  python3 bridge/live_streams.py 72 --api http://localhost:3000            real band over Bluetooth
  python3 bridge/live_streams.py 72 --usb                                 real band over USB-C (no RSSI/outdoor)
  python3 bridge/live_streams.py --sim --scenario tuesday --clock 16:34   pretend band + scripted Tuesday incident
  python3 bridge/live_streams.py 72 --mic --fake-hr --fake-voice          real motion + mic, simulated HR/speech

Honest sources:
  REAL  : tremor, dyskinesia, falls, steps, nocturia, outdoor (RSSI), verbal engagement + acoustic tags (--mic), adherence gesture
  SIM   : heart rate / HRV / extrasystoles (band has no PPG) via --fake-hr ; speech rate (needs STT) via --fake-voice
"""
import argparse, datetime, math, os, random, sys, threading, time

import bridge as B  # LED/voice actuation server + band connect (same folder)
from algos import (AcousticTagger, AdherenceVerifier, FallDetector, MobilityTracker, MotionAnalyzer,
                   NocturiaCounter, TremorEpisodes, VoiceMeter)

RATE = 50


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("number", nargs="?", type=int)
    ap.add_argument("--usb", action="store_true")
    ap.add_argument("--sim", action="store_true")
    ap.add_argument("--api", default="http://localhost:3000")
    ap.add_argument("--patient", default=None, help="default: armel (real band) / henri-m (--scenario)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--mic", action="store_true", help="mic loudness: engagement + acoustic tags (locks LED blue)")
    ap.add_argument("--demo-incident", action="store_true", help="fake HR/speech react to a tremor (96 bpm, 67 words/min) for stage demos; off = healthy values")
    ap.add_argument("--debug-motion", action="store_true", help="print every motion window verdict (why tremor was/was not detected)")
    ap.add_argument("--stt-lang", default="multi", help="Deepgram language: multi (fr/en/...), fr, en")
    ap.add_argument("--stt", action="store_true", help="REAL speech rate: band mic -> Deepgram (needs DEEPGRAM_API_KEY; sound leaves the laptop; implies --mic)")
    ap.add_argument("--fake-hr", action="store_true")
    ap.add_argument("--fake-voice", action="store_true")
    ap.add_argument("--clock", help="HH:MM: pretend it is this time (timestamps sent to the backend)")
    ap.add_argument("--night", action="store_true", help="treat now as night (nocturia window on)")
    ap.add_argument("--drop-after", type=float, default=35 * 60, help="seconds after cue to judge tremor drop (35 min real; 60 for demos)")
    ap.add_argument("--check", action="store_true", help="connect, listen 12 s, report which streams arrive, exit (posts nothing)")
    ap.add_argument("--scenario", choices=["tuesday"], help="synthetic band input: scripted Tuesday 16:40 incident")
    a = ap.parse_args()
    if a.patient is None:
        a.patient = "henri-m" if a.scenario else "armel"
    if not a.sim and a.number is None and not a.scenario:
        ap.error("give a band number, --sim or --scenario")

    if a.check:
        return run_check(a)

    t_start = time.time()
    base_dt = datetime.datetime.now()
    if a.clock:
        h, m = map(int, a.clock.split(":"))
        base_dt = base_dt.replace(hour=h, minute=m, second=0, microsecond=0)

    def sim_now():
        return base_dt + datetime.timedelta(seconds=time.time() - t_start)

    import queue
    q = queue.Queue(maxsize=500)
    source = "sim" if (a.sim or a.scenario) else "band"

    def worker():  # HTTP never blocks the band's handler thread
        while True:
            B.post(a.api, "/api/live-event", q.get())

    threading.Thread(target=worker, daemon=True).start()

    def post(body):
        try:
            q.put_nowait({"patientId": a.patient, "ts": sim_now().isoformat(), "source": source, **body})
        except queue.Full:
            pass

    last = {}

    def every(key, secs):
        n = time.time()
        if n - last.get(key, 0) >= secs:
            last[key] = n
            return True
        return False

    # ---- algorithms ----
    epi = TremorEpisodes()
    mot, fall, mob = MotionAnalyzer(fs=RATE), FallDetector(fs=RATE), MobilityTracker(state_path=None if (a.sim or a.scenario) else os.path.join(os.path.dirname(os.path.abspath(__file__)), ".steps_baseline.json"))
    noc = NocturiaCounter(night=lambda h: True) if a.night else NocturiaCounter()
    voice, acou, adh = VoiceMeter(), AcousticTagger(), AdherenceVerifier()
    st = {"rest": (0.0, 0.0, 1.0), "burden": 0.0, "recent": 0.0, "state": "still", "steps": 0, "armed_t": None, "judged": False}

    def on_motion(t, ax, ay, az):
        st["rest"] = st["rest"] if adh.armed_at is not None else (ax, ay, az)
        r = mot.feed(t, ax, ay, az, walking=st["state"] in ("walk", "run"))
        f = fall.feed(t, ax, ay, az)
        if f:
            print(f"  [balance] {f}")
            post(dict(type="fall", context=f))
        for sig in adh.on_motion(t, ax, ay, az):
            print(f"  [adherence] {sig}")
            post(dict(type="adherence", signal=sig))
        if r:
            if a.debug_motion and (r["awake"] or r["tremor"]):
                print("  [motion]", mot.why)
            ep = epi.feed(t, r)
            if ep:
                print(f"  [episode] {ep['kind']}  {ep['hz']} Hz  {ep['amp']} g  {ep['end'] - ep['start']:.0f} s  pitch {ep['pitch']:.0f} roll {ep['roll']:.0f}")
                post(dict(type="tremor_episode", episode=dict(ep, start=datetime.datetime.fromtimestamp(ep["start"]).astimezone().isoformat(), end=datetime.datetime.fromtimestamp(ep["end"]).astimezone().isoformat())))
            st["burden"] = r["tremor_burden"]
            st["recent"] = mot.recent_burden(t)
            post(dict(type="tremor", value=round(r["hz"], 1) if r["tremor"] else 0.0, amplitude=round(r["amp"], 3) if r["tremor"] else 0.0))
            if every("motion_samples", 2):
                post(dict(type="sample", metric="tremor_burden", value=r["tremor_burden"]))
                post(dict(type="sample", metric="dyskinesia_index", value=r["dyskinesia_index"]))
            if r["tremor"]:
                print(f"  [tremor] {r['hz']:.1f} Hz  {r['amp']:.3f} g  burden {r['tremor_burden']}%")
        if adh.armed_at is not None and not st["judged"] and t - adh.armed_at >= a.drop_after:
            st["judged"] = True
            for sig in adh.on_burden(st["recent"]):
                print(f"  [adherence] {sig}  (recent burden {adh.pre_burden}% -> {st['recent']}%)")
                post(dict(type="adherence", signal=sig))

    def on_activity(e):
        st["state"], st["steps"] = e.state, e.steps
        day = mob.on_steps(e.steps)
        h = sim_now().hour
        if noc.feed(time.time(), h, e.state, e.steps):
            print("  [sleep] bathroom trip", noc.trips)
            post(dict(type="sample", metric="nocturia", value=noc.trips))
        if every("steps", 2):
            post(dict(type="sample", metric="steps", value=day))

    def on_link(e):
        mins = mob.on_link(time.time(), getattr(e, "rssi", None))
        if every("outdoor", 2):
            post(dict(type="sample", metric="outdoor_time", value=mins))

    def on_level(t, level):
        eng = voice.on_level(t, level)
        if every("engagement", 2):
            post(dict(type="sample", metric="verbal_engagement", value=eng))
        tag = acou.tag(t, level)
        if tag:
            print(f"  [acoustic] {tag}")
            post(dict(type="acoustic", tag=tag))
        if a.fake_voice is False:
            sr = voice.speech_rate(time.time())
            if sr is not None and every("speech", 2):
                post(dict(type="voice", value=sr))

    def on_double_tap(_e=None):
        print("  [tap] double-tap = water-sound stand-in")
        post(dict(type="acoustic", tag="Pill_Water", context="double_tap_confirm"))
        for sig in adh.on_water(time.time()):
            post(dict(type="adherence", signal=sig))

    # ---- actuation hook: arm verifier when the backend sends the cue ----
    orig_actuate = B.actuate

    def actuate_and_arm(cmd):
        orig_actuate(cmd)
        adh.arm(time.time(), st["rest"], max(st["burden"], 1.0))
        st["judged"] = False
        print(f"  [adherence] armed: cue sent, gesture + water + tremor drop to be verified (judge in {a.drop_after:g}s, pre-burden {st['burden']}%)")

    B.actuate = actuate_and_arm
    B.serve(a.port)

    # ---- sources ----
    band = None
    if not a.scenario:
        band = B.Band.connect(a.number or 72, "sim" if a.sim else ("serial" if a.usb else "ble"))
        B.State.band = band
        print("Connected to", band.name)
        band.on("motion", lambda m: on_motion(time.time(), m.ax, m.ay, m.az))
        band.on("activity", on_activity)
        band.on("double-tap", on_double_tap)
        cfg = dict(motion=RATE, sensors="accel", events=True, activity=True)
        if not a.usb and not a.sim:
            cfg["link"] = True
        band.configure(**cfg)
        if not a.usb and not a.sim:
            band.on("link", on_link)
        if a.stt:
            a.mic = True
            sys.path.insert(0, os.path.join(B.KIT, "examples", "python"))
            import speech  # vexo-open-kit/examples/python/speech.py

            class TimedDeepgram(speech.DeepgramSpeech):
                """Also reads Deepgram's word timestamps: rate = words / seconds actually spoken."""
                def _message(self, m):
                    if m.get("type") == "Results" and m.get("is_final"):
                        w = [x for x in ((m.get("channel", {}).get("alternatives") or [{}])[0].get("words") or [])
                             if x.get("confidence", 1) >= 0.6]
                        if len(w) >= 3:
                            voice.add_spoken(time.time(), len(w), w[-1]["end"] - w[0]["start"])
                    super()._message(m)

            cur = {"ears": None}

            def on_text(text, final):
                if final and text.strip():
                    print(f"  [speech] {len(text.split())} words: {text.strip()[:60]}")

            def open_stt():
                e = TimedDeepgram(language=a.stt_lang)
                e.start(on_text)
                cur["ears"] = e

            def feed_audio(ev):
                e = cur["ears"]
                if e is not None:
                    try:
                        e.feed(ev.opus, ev.seq)
                    except Exception:
                        pass  # socket dropped: the watchdog below reopens it

            def stt_watchdog():  # Deepgram drops idle/long sockets: reconnect forever, never stop the bridge
                while True:
                    time.sleep(2)
                    e = cur["ears"]
                    if e is None or e._done.is_set() or getattr(e, "error", None):
                        try:
                            open_stt()
                            print("  [speech] Deepgram (re)connected")
                        except Exception as ex:
                            print(f"  [speech] Deepgram unavailable, retrying: {str(ex)[:80]}")
                            time.sleep(3)

            try:
                open_stt()
            except Exception as ex:
                print(f"  [speech] Deepgram start failed ({str(ex)[:80]}); will keep retrying")
            threading.Thread(target=stt_watchdog, daemon=True).start()
            band.on("audio", feed_audio)
            band.configure(audio=True)
            print("STT on: the band microphone is sent to Deepgram. Tell people nearby.")
        if a.mic:
            band.on("mic-level", lambda e: on_level(time.time(), getattr(e, "level", 0.0)))
            band.configure(mic_level=0.1)
            B.State.mic = True
    else:
        B.State.band = band = B.Band.connect(72, "sim")
        threading.Thread(target=scenario_tuesday, args=(on_motion, on_level, on_double_tap, post), daemon=True).start()

    if a.fake_hr:
        def hr():
            surge = [False]
            while True:
                base = 74 + random.randint(-2, 3)
                bpm = 96 if (a.demo_incident and st["recent"] > 20) else base
                post(dict(type="heart_rate", value=bpm, source="sim"))
                if every("hrv", 2):
                    post(dict(type="sample", metric="hrv", value=19 if bpm >= 90 else 30, source="sim"))
                    post(dict(type="sample", metric="extrasystoles", value=9 if bpm >= 90 else 1, source="sim"))
                time.sleep(2)
        threading.Thread(target=hr, daemon=True).start()
    if a.fake_voice or a.scenario:
        def vv():
            while True:
                post(dict(type="voice", value=round(random.uniform(65, 71) if (a.demo_incident or a.scenario) and st["recent"] > 20 else random.uniform(115, 150), 1), source="sim"))
                time.sleep(2)
        threading.Thread(target=vv, daemon=True).start()

    print("Running. Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    if band is not None and not a.scenario:
        band.disconnect()


def run_check(a):
    """First-connection diagnostic: which band streams really arrive, at what rate. Posts nothing."""
    ble = not a.usb and not a.sim
    band = B.Band.connect(a.number or 72, "sim" if a.sim else ("serial" if a.usb else "ble"))
    print("Connected to", band.name)
    n = {"motion": 0, "activity": 0, "link": 0, "mic-level": 0, "tap": 0, "double-tap": 0}
    seen = {}
    mot = MotionAnalyzer(fs=RATE)
    last = {}

    def cnt(k):
        def f(e):
            n[k] += 1
            seen[k] = e
        return f

    def on_motion(m):
        n["motion"] += 1
        r = mot.feed(time.time(), m.ax, m.ay, m.az)
        if r:
            last.update(r)

    band.on("motion", on_motion)
    for k in ("activity", "tap", "double-tap"):
        band.on(k, cnt(k))
    cfg = dict(motion=RATE, sensors="accel", events=True, activity=True)
    if ble:
        cfg["link"] = True
        band.on("link", cnt("link"))
    if a.mic:
        band.on("mic-level", cnt("mic-level"))
        cfg["mic_level"] = 0.1
    band.configure(**cfg)
    print("Listening 12 s. Shake the wrist at ~5 Hz for a few seconds, then double-tap the band...")
    band.wait(12)
    band.disconnect()
    ok = True

    def line(name, good, detail):
        nonlocal ok
        ok = ok and good
        print(("PASS " if good else "FAIL ") + name + " — " + detail)

    line("motion stream", n["motion"] >= 12 * RATE * 0.7, f"{n['motion'] / 12:.0f} samples/s (want ~{RATE})")
    if last:
        print(f"     last window: {last['hz']:.1f} Hz, {last['amp']:.3f} g, awake={last['awake']}, burden {last['tremor_burden']}%")
    line("activity (steps)", n["activity"] >= 5, f"{n['activity']} events, steps={getattr(seen.get('activity'), 'steps', '?')}, state={getattr(seen.get('activity'), 'state', '?')}")
    if ble:
        line("link (RSSI → outdoor)", n["link"] >= 5, f"{n['link']} events, rssi={getattr(seen.get('link'), 'rssi', '?')} dBm")
    else:
        print("SKIP link/RSSI — Bluetooth only (outdoor time unavailable over USB)")
    line("double-tap (water stand-in)", n["double-tap"] >= 1, f"{n['double-tap']} double-taps, {n['tap']} taps")
    if a.mic:
        line("mic loudness", n["mic-level"] >= 20, f"{n['mic-level']} readings, level={getattr(seen.get('mic-level'), 'level', '?')}")
    print("\nALL STREAMS OK" if ok else "\nSome streams missing: see FAIL lines")
    return 0 if ok else 1


def scenario_tuesday(on_motion, on_level, on_double_tap, post):
    """Synthetic band input: 10 s calm, 5.3 Hz tremor 25 s, glass break, near-fall, then calm."""
    dt, t = 1 / RATE, 0.0
    t0 = time.time()
    rnd = random.Random(3)
    print("Scenario: calm 0-10 s, tremor 10-35 s, glass 14 s, near-fall 16 s, [apply protocol ~45 s], sip gesture 70 s, water 75 s")
    sent_glass = sent_fall = False
    fall_t0 = None
    while t < 100:
        now = time.time()
        z = 1.0 + rnd.gauss(0, 0.003)
        ax = 0.0
        if 10 <= t < 35:
            z += 0.10 * math.sin(2 * math.pi * 5.3 * t)
        if 70 <= t < 74:  # forearm lifts to mouth for 4 s
            ang = math.radians(75)
            ax, z = math.sin(ang), math.cos(ang)
        if 75 <= t < 75 + dt:
            on_double_tap()
        if 16 <= t < 16.12:
            z = 0.15
        elif 16.12 <= t < 16.16:
            z = 2.0
        on_motion(now, ax, 0.0, z)
        if int(t * 10) != int((t - dt) * 10):  # 10 Hz mic level
            lv = 0.02
            glass = [0.95, 0.5, 0.12]
            k = int(round((t - 14) * 10))
            if 0 <= k < 3:
                lv = glass[k]
            on_level(now, lv)
        t += dt
        time.sleep(max(0.0, t0 + t - time.time()))  # deadline scheduling: stay on real time


if __name__ == "__main__":
    main()
