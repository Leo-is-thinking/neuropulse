#!/usr/bin/env python3
"""99% <-> Vexo band bridge.

Band -> backend : wrist accel -> tremor frequency (Goertzel 3-8 Hz) -> POST /api/live-event
Backend -> band : POST http://127.0.0.1:8765/actuate  (set VEXO_WEBHOOK_URL to that)
                  amber double blink on the LED + voice cue played on this laptop.

  python3 bridge/bridge.py 72                 real band, Bluetooth (double-tap the band first)
  python3 bridge/bridge.py 72 --usb           real band, USB-C cable
  python3 bridge/bridge.py --sim              pretend band, no hardware
  python3 bridge/bridge.py --sim --fake-tremor 5.3 --fake-hr     demo signals without a patient

Close the Vexo dashboard tab first: one program per band.
The band has NO haptic motor, NO speaker, NO heart-rate sensor. Mapping:
  haptic double  -> LED amber double blink
  voice cue      -> laptop speaker (afplay on macOS)
  heart rate     -> simulated (--fake-hr)
The mic turns the LED blue and locks it, so the mic is OFF unless --mic is given
(and is paused while an actuation runs).
"""
import argparse
import base64
import json
import math
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.environ.get("VEXO_KIT") or os.path.join(HERE, "..", "vexo-open-kit")
sys.path.insert(0, os.path.join(KIT, "python"))
from vexo_open.sync import Band, short_errors  # noqa: E402

short_errors()

RATE = 50          # motion samples / s
WINDOW_S = 2.0     # analysis window
AMBER = "#ffbf00"


# ---------- signal ----------
def goertzel(x, fs, f):
    w = 2 * math.pi * f / fs
    c = 2 * math.cos(w)
    s1 = s2 = 0.0
    for v in x:
        s0 = v + c * s1 - s2
        s2, s1 = s1, s0
    return math.sqrt(max(s1 * s1 + s2 * s2 - c * s1 * s2, 0.0)) * 2 / len(x)


def dominant(samples, fs):
    """samples: |accel| in g. Returns (freq_hz, amplitude_g) in 3..8 Hz, or None."""
    n = len(samples)
    if n < fs:  # < 1 s of data
        return None
    m = sum(samples) / n
    x = [(v - m) * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i, v in enumerate(samples)]  # Hann
    best = max(((f / 10, goertzel(x, fs, f / 10)) for f in range(30, 81)), key=lambda t: t[1])
    return best[0], best[1] * 2  # *2 undoes Hann loss (~0.5 mean)


# ---------- backend ----------
def post(api, path, body):
    data = json.dumps(body).encode()
    for attempt in range(3):  # Next dev can fail a request while it recompiles: retry before giving up
        try:
            req = urllib.request.Request(api + path, data, {"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10).read()
            return
        except Exception as e:  # backend down must never kill the bridge
            if attempt == 2:
                print("  [api]", path, "failed:", e)
            else:
                time.sleep(0.5)


class State:
    band = None
    mic = False
    on_reset = None  # set by live_streams: zero the day's counters, live OFF
    on_live = None  # set by live_streams: live ON/OFF from the site
    lock = threading.Lock()


def play(audio_b64):
    if not audio_b64:
        return
    f = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    f.write(base64.b64decode(audio_b64))
    f.close()
    subprocess.Popen(["afplay", f.name] if sys.platform == "darwin" else ["ffplay", "-nodisp", "-autoexit", f.name],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def actuate(cmd):
    """LED amber, two blinks. Mic (blue lock) is paused around it."""
    with State.lock:
        band = State.band
        if State.mic:
            band.configure(mic_level=False)
        band.set_led(AMBER, pattern="blink", period=400)
        time.sleep(1.6)  # ~2 blinks at 400 ms period
        band.set_led(AMBER)  # steady amber = waiting for the dose
        State.mic = False  # mic stays off after a cue so the amber LED is not locked out
    play(cmd.get("audioBase64"))
    print("  [wrist] amber cue sent; voice:", cmd.get("voiceText"))
    print("  [wrist] adherence armed for", cmd.get("arm", {}).get("dueAt"))


def serve(port):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path not in ("/actuate", "/reset", "/live"):
                self.send_response(404); self.end_headers(); return
            try:
                cmd = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                if self.path == "/reset":
                    if State.on_reset:
                        State.on_reset()
                elif self.path == "/live":
                    if State.on_live:
                        State.on_live(bool(cmd.get("on")))
                else:
                    actuate(cmd)
                code, out = 200, {"ok": True}
            except Exception as e:
                code, out = 500, {"ok": False, "error": str(e)}
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(out).encode())

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"Listening for actuation on http://127.0.0.1:{port}/actuate")


# ---------- main ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("number", nargs="?", type=int, help="band number (72)")
    ap.add_argument("--usb", action="store_true")
    ap.add_argument("--sim", action="store_true")
    ap.add_argument("--api", default="http://localhost:3000")
    ap.add_argument("--patient", default="henri-m")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--mic", action="store_true", help="enable mic loudness -> glass-break tag (locks LED to blue)")
    ap.add_argument("--min-amp", type=float, default=0.03, help="min tremor amplitude in g to report")
    ap.add_argument("--fake-tremor", type=float, metavar="HZ", help="replace band motion with a synthetic tremor")
    ap.add_argument("--fake-hr", action="store_true", help="post simulated heart rate (band has no PPG)")
    a = ap.parse_args()
    if not a.sim and a.number is None:
        ap.error("give a band number or --sim")

    transport = "sim" if a.sim else ("serial" if a.usb else "ble")
    band = Band.connect(a.number or 72, transport)
    State.band = band
    print("Connected to", band.name)

    buf, last_post = [], [0.0]
    # contract: real hardware -> "band"; --sim / synthetic signals -> "sim"
    band_src = "sim" if a.sim else "band"
    tremor_src = "sim" if (a.sim or a.fake_tremor) else "band"

    def on_motion(m):
        buf.append(math.sqrt(m.ax ** 2 + m.ay ** 2 + m.az ** 2))
        if len(buf) < int(RATE * WINDOW_S):
            return
        res = dominant(buf, RATE)
        del buf[: RATE]  # slide 1 s
        if res and res[1] >= a.min_amp and 4.0 <= res[0] <= 6.0 and time.time() - last_post[0] > 2:
            last_post[0] = time.time()
            print(f"  tremor {res[0]:.1f} Hz  amp {res[1]:.3f} g")
            post(a.api, "/api/live-event", {"patientId": a.patient, "type": "tremor", "value": res[0], "amplitude": round(res[1], 3), "source": tremor_src})

    if a.fake_tremor:
        def fake():
            t = 0.0
            while True:
                class M: pass
                m = M(); m.ax = m.ay = 0.0; m.az = 1.0 + 0.1 * math.sin(2 * math.pi * a.fake_tremor * t)
                on_motion(m)
                t += 1 / RATE
                time.sleep(1 / RATE)
        threading.Thread(target=fake, daemon=True).start()
        print(f"Synthetic {a.fake_tremor} Hz tremor (band motion ignored)")
    else:
        band.on("motion", on_motion)
        band.configure(motion=RATE, sensors="accel", events=True)

    # double-tap = patient manually confirms the dose (water-sound stand-in)
    def on_double_tap(_e):
        print("  double-tap -> Pill_Water confirm")
        post(a.api, "/api/live-event", {"patientId": a.patient, "type": "acoustic", "tag": "Pill_Water", "context": "double_tap_confirm", "source": band_src})
    if not a.fake_tremor:
        band.on("double-tap", on_double_tap)

    if a.mic:
        quiet = [True]

        def on_level(e):
            lvl = getattr(e, "level", 0)
            if lvl > 0.8 and quiet[0]:
                quiet[0] = False
                print("  loud transient -> Object_Drop_Glass_Break")
                post(a.api, "/api/live-event", {"patientId": a.patient, "type": "acoustic", "tag": "Object_Drop_Glass_Break", "source": band_src})
            elif lvl < 0.3:
                quiet[0] = True
        band.on("mic-level", on_level)
        band.configure(mic_level=0.1)
        State.mic = True

    if a.fake_hr:
        def hr():
            import random
            while True:
                post(a.api, "/api/live-event", {"patientId": a.patient, "type": "heart_rate", "value": 72 + random.randint(-3, 6), "source": "sim"})
                time.sleep(3)
        threading.Thread(target=hr, daemon=True).start()

    serve(a.port)
    print("Running. Ctrl+C to stop.")
    try:
        band.wait(None)
    except KeyboardInterrupt:
        pass
    band.disconnect()


if __name__ == "__main__":
    main()
