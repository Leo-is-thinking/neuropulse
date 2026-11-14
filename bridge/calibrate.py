#!/usr/bin/env python3
"""Calibrate the tremor detector on YOUR wrist before the demo. Posts nothing to the app.

  python3 bridge/calibrate.py 72            real band, Bluetooth (double-tap first)
  python3 bridge/calibrate.py 72 --usb

For each gesture you do it for 20 s, then it reports how often it was flagged as tremor / dyskinesia and says
PASS/FAIL against what the demo needs. Tune bridge/algos.py (MotionAnalyzer min_amp / persist) if a line FAILs.
"""
import argparse, sys, time

import bridge as B
from algos import MotionAnalyzer

SCENES = [  # label, instruction, must_be_tremor
    ("rest", "Arm resting on the table, still. Do nothing.", False),
    ("fake tremor", "Rest the forearm on the table, shake the HAND steadily at ~5 shakes/second.", True),
    ("scratching", "Scratch your head or arm normally.", False),
    ("drinking", "Pick up a glass, drink, put it down, repeat.", False),
    ("typing", "Type on the keyboard / use the mouse.", False),
    ("walking", "Walk around the room.", False),
    ("gesturing", "Talk and gesture with the wrist hand.", False),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("number", nargs="?", type=int, default=72)
    ap.add_argument("--usb", action="store_true")
    ap.add_argument("--seconds", type=int, default=20)
    ap.add_argument("--only", nargs="+", metavar="SCENE", help="rerun only these scenes, e.g. --only \"fake tremor\" drinking")
    a = ap.parse_args()
    band = B.Band.connect(a.number, "serial" if a.usb else "ble")
    print("Connected to", band.name)
    mot = MotionAnalyzer(fs=B.RATE if hasattr(B, "RATE") else 50)
    st = {"state": "still", "n": 0, "t": 0, "d": 0, "hz": []}
    band.on("activity", lambda e: st.__setitem__("state", e.state))

    def on_motion(m):
        r = mot.feed(time.time(), m.ax, m.ay, m.az, walking=st["state"] in ("walk", "run"))
        if r:
            st["n"] += 1
            st["t"] += r["tremor"]
            st["d"] += r["dysk"]
            if r["tremor"]:
                st["hz"].append(r["hz"])

    band.on("motion", on_motion)
    band.configure(motion=50, sensors="accel", events=True, activity=True)
    bad = 0
    scenes = [s for s in SCENES if not a.only or s[0] in a.only]
    if not scenes:
        sys.exit("No such scene. Names: " + ", ".join(s[0] for s in SCENES))
    for label, text, want in scenes:
        input(f"\n[{label}] {text}\n  Press Enter, then do it for {a.seconds} s... ")
        mot.__init__(fs=50)
        st.update(n=0, t=0, d=0, hz=[])
        time.sleep(a.seconds)
        n = max(st["n"], 1)
        pt, pd = 100 * st["t"] / n, 100 * st["d"] / n
        ok = pt >= 60 if want else pt <= 10
        bad += not ok
        hz = f" at {sum(st['hz'])/len(st['hz']):.1f} Hz" if st["hz"] else ""
        print(f"  tremor {pt:.0f}%{hz}   dyskinesia {pd:.0f}%   -> {'PASS' if ok else 'FAIL'} (want tremor {'HIGH' if want else 'LOW'})")
    band.disconnect()
    print(f"\n{len(scenes) - bad}/{len(scenes)} scenes OK")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
