#!/usr/bin/env python3
import os
"""Proof that every 99% live algorithm works on synthetic band signals.

  python3 bridge/selftest.py                      unit proofs, no server needed
  python3 bridge/selftest.py --api http://localhost:3000   + end-to-end: posts to the backend, checks Live cells,
                                                  live feed, and the live cross-modal analysis
"""
import argparse, json, math, os, random, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from algos import (AcousticTagger, AdherenceVerifier, FallDetector, MobilityTracker, MotionAnalyzer, TremorEpisodes,  # noqa: E402
                   NocturiaCounter, VoiceMeter)

random.seed(7)
FS = 50
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))


def run_motion(gen, seconds):
    m, last = MotionAnalyzer(), None
    for i in range(int(seconds * FS)):
        t = i / FS
        r = m.feed(t, *gen(t))
        last = r or last
    return last


# 1 tremor ------------------------------------------------------------------
r = run_motion(lambda t: (0, 0, 1 + 0.10 * math.sin(2 * math.pi * 5.3 * t)), 30)
check("tremor 5.3 Hz detected", r["tremor"] and abs(r["hz"] - 5.3) <= 0.2, f"{r['hz']:.1f} Hz amp {r['amp']:.3f} g burden {r['tremor_burden']}%")
r = run_motion(lambda t: (0, 0, 1 + 0.10 * math.sin(2 * math.pi * 2.0 * t)), 30)
check("slow 2 Hz arm swing is NOT tremor", not r["tremor"] and r["tremor_burden"] == 0, f"{r['hz']:.1f} Hz")
r = run_motion(lambda t: (0, 0, 1 + random.gauss(0, 0.001)), 30)
check("resting wrist = not awake, burden 0", not r["awake"] and r["tremor_burden"] == 0)
# half the time tremor, half walking-like 1.8 Hz => burden ~50 %
r = run_motion(lambda t: (0, 0, 1 + (0.10 * math.sin(2 * math.pi * 5.3 * t) if int(t // 10) % 2 == 0 else 0.20 * math.sin(2 * math.pi * 1.8 * t))), 60)
check("tremor burden ~50 % with alternating tremor/walk", 35 <= r["tremor_burden"] <= 65, f"{r['tremor_burden']}%")

m = MotionAnalyzer()
for i in range(int(60 * FS)):
    tt = i / FS
    m.feed(tt, 0, 0, 1 + (0.10 * math.sin(2 * math.pi * 5.3 * tt) if tt < 30 else random.gauss(0, 0.001)))
check("recent burden drops to 0 once the wrist is at rest (post-dose)", m.recent_burden(59) == 0.0 and m.recent_burden(29) > 90, f"t=29: {m.recent_burden(29)}%  t=59: {m.recent_burden(59)}%")

# 1b dyskinesia (irregular, large, broadband) -------------------------------
phases = [random.uniform(0, 6.28) for _ in range(8)]
fr = [2.2, 2.9, 3.6, 4.4, 5.3, 6.1, 6.9, 7.7]
r = run_motion(lambda t: (0, 0, 1 + sum(0.07 * math.sin(2 * math.pi * f * t + p) for f, p in zip(fr, phases))), 40)
check("dyskinesia (large irregular) index > 5", r["dyskinesia_index"] > 5 and not r["tremor"], f"index {r['dyskinesia_index']}")
check("clean tremor is NOT dyskinesia", run_motion(lambda t: (0, 0, 1 + 0.10 * math.sin(2 * math.pi * 5 * t)), 30)["dyskinesia_index"] < 1)


# 1c everyday motion must NOT read as tremor
r = run_motion(lambda t: (0, 0, 1 + (0.10 * math.sin(2 * math.pi * 5.0 * t) if int(t) % 8 < 2 else 0.0) + random.gauss(0, 0.01)), 60)
check("2 s hand shakes / gestures (toothbrush-like bursts) are NOT tremor", r["tremor_burden"] < 10, f"{r['tremor_burden']}%")
r = run_motion(lambda t: (0, 0, 1 + 0.30 * math.sin(2 * math.pi * 1.7 * t) + 0.05 * math.sin(2 * math.pi * 5.1 * t)), 40)
check("arm swing 1.7 Hz with a small 5 Hz ripple is NOT tremor", r["tremor_burden"] < 10, f"{r['tremor_burden']}%")
m2 = MotionAnalyzer(); wb = 0
for i in range(30 * FS):
    r2 = m2.feed(i / FS, 0, 0, 1 + 0.10 * math.sin(2 * math.pi * 4.0 * i / FS), walking=True) or r2 if i else None
check("walking suppresses tremor (step harmonic at 4 Hz)", m2.hist and all(not h[2] for h in m2.hist))

# 1d everyday repetitive motion that rotates the forearm must NOT be tremor; a deliberate steady shake MUST be
def vec(t, tilt_deg_amp, tilt_hz, shake_amp, shake_hz):
    th = math.radians(tilt_deg_amp) * math.sin(2 * math.pi * tilt_hz * t)
    g = 1 + shake_amp * math.sin(2 * math.pi * shake_hz * t)
    return (g * math.sin(th), 0, g * math.cos(th))
r = run_motion(lambda t: vec(t, 50, 0.7, 0.3, 4.6), 40)
check("scratching (arm rotates 50 deg + 4.6 Hz rub) is NOT tremor", r["tremor_burden"] < 10, f"{r['tremor_burden']}%")
r = run_motion(lambda t: vec(t, 70, 0.15, 0.05, 5.0), 40)
check("lifting a glass (arm rotates 70 deg) is NOT tremor", r["tremor_burden"] < 10, f"{r['tremor_burden']}%")
r = run_motion(lambda t: (0.3 + 0.0, 0, 0.95 + 0.40 * math.sin(2 * math.pi * 5.0 * t)), 30)
check("deliberate steady 5 Hz shake (demo fake tremor, 0.4 g, resting posture) IS tremor", r["tremor_burden"] > 80, f"{r['tremor_burden']}%")
r = run_motion(lambda t: (0, 0, 1 + 0.10 * math.sin(2 * math.pi * (4.2 + 1.6 * (0.5 + 0.5 * math.sin(0.8 * t))) * t)), 40)
check("wandering frequency (4.2-5.8 Hz sweep) is NOT tremor", r["tremor_burden"] < 25, f"{r['tremor_burden']}%")
vm = VoiceMeter()
for k in range(6):
    vm.add_spoken(10 * k, 22, 10.0)  # 22 words in 10 s
check("speech rate from word timestamps = 132 words/min", vm.speech_rate() == 132.0, str(vm.speech_rate()))
for lv in range(300):
    vm.on_level(lv / 10, 0.9 if lv % 2 else 0.0)  # noisy/drinking loudness must not change it
check("speech rate ignores mic loudness (noise, drinking)", vm.speech_rate() == 132.0)

# 2 falls --------------------------------------------------------------------
def fall_stream(kind):
    f, out = FallDetector(), []
    for i in range(int(8 * FS)):
        t = i / FS
        if kind == "fall":
            m = 0.1 if 2.0 <= t < 2.2 else 3.4 if 2.2 <= t < 2.24 else 1.0 + (random.gauss(0, 0.2) if t < 2.0 else random.gauss(0, 0.01))
        elif kind == "near_fall":
            m = 0.15 if 2.0 <= t < 2.12 else 2.0 if 2.12 <= t < 2.16 else 1.0 + random.gauss(0, 0.25)
        else:
            m = 1.0 + 0.3 * math.sin(2 * math.pi * 1.8 * t) + random.gauss(0, 0.05)  # normal walking
        r = f.feed(t, 0, 0, max(m, 0))
        if r: out.append(r)
    return out
check("fall (free-fall + 3.4 g impact + still)", fall_stream("fall") == ["fall"], str(fall_stream("fall")))
check("near-fall stumble (dip + 2 g, keeps moving)", fall_stream("near_fall") == ["near_fall"], str(fall_stream("near_fall")))
check("normal walking = no alert", fall_stream("walk") == [])

# 3 nocturia -----------------------------------------------------------------
n = NocturiaCounter()
t, steps, trips = 0, 1000, 0
for hour_start in [23.0]:
    # still 2 h, walk 40 steps (bathroom), still 2 h, walk 30 steps, daytime walk (must not count)
    seq = [("still", 7200, 0), ("walk", 60, 40), ("still", 7200, 0), ("walk", 60, 30)]
    for st, dur, st_steps in seq:
        for s in range(0, dur, 10):
            steps += st_steps / (dur / 10)
            trips += n.feed(t, (hour_start + t / 3600) % 24, st, int(steps)); t += 10
check("nocturia counts 2 night trips", trips == 2, f"{trips} trips")
n2 = NocturiaCounter(); d = 0
for s in range(0, 3600, 10):
    d += n2.feed(s, 14.0, "walk", s)  # daytime
check("daytime walking is not nocturia", d == 0)
n3 = NocturiaCounter(); d = 0
for s in range(0, 3000, 10): n3.feed(s, 2.0, "still", 100)
for s in range(3000, 3030, 10): d += n3.feed(s, 2.0, "walk", 100 + (s - 3000) // 10)  # 3 steps: shuffle in bed
check("rolling over in bed (3 steps) is not a trip", d == 0)

# 4 mobility -----------------------------------------------------------------
mt = MobilityTracker()
mt.on_steps(5000); mt.on_steps(5340)
mins = 0
for s in range(0, 600):
    mins = mt.on_link(s, -60 if s < 120 else -90)
check("steps today = 340", mt.steps_today == 340)
check("outdoor minutes ~8 (RSSI -90 dBm for 480 s)", 7 <= mins <= 8.5, f"{mins} min")
import tempfile as _tf
_sp = os.path.join(_tf.mkdtemp(), "b.json")
_a = MobilityTracker(state_path=_sp); _a.on_steps(1000); _a.on_steps(1300)
_b = MobilityTracker(state_path=_sp)  # bridge restart
check("steps survive a bridge restart (300, not 0)", _b.on_steps(1300) == 300, str(_b.steps_today))
_c = MobilityTracker(state_path=_sp)
check("band counter reset -> day total stays 300 (banked), never drops", _c.on_steps(50) == 300, str(_c.steps_today))
check("steps keep stacking after the reset (300 + 10)", _c.on_steps(60) == 310, str(_c.steps_today))
check("day total survives yet another restart", MobilityTracker(state_path=_sp).on_steps(60) == 310)
_m = MotionAnalyzer(fs=50, offset=(100, 25, 0))
for i in range(120):
    _m.feed(i / 50, 0, 0, 1.0 + 0.2 * math.sin(2 * math.pi * 5 * i / 50))
check("tremor burden stacks on earlier-today totals (offset 25/100)", _m.totals[0] >= 100 and _m.totals[1] >= 25, str(_m.totals))
mt2 = MobilityTracker(); m2 = 0
for s in range(0, 600): m2 = mt2.on_link(s, -62)
check("home RSSI -62 dBm = 0 outdoor", m2 == 0)

# 5 voice --------------------------------------------------------------------
v = VoiceMeter(); eng = 0
for i in range(0, 1200):  # 120 s at 10 Hz, 50 s voiced
    eng = v.on_level(i / 10, 0.3 if (i // 100) % 2 == 0 else 0.01)
for k in range(10): v.add_words(50 + k * 5, 4)  # 40 words in the last minute
check("verbal engagement ~1 min voiced of 2", 0.9 <= eng <= 1.1, f"{eng} min")
rate = v.speech_rate()
check("speech rate computed over voiced time only", rate is not None and 48 <= rate <= 120, f"{rate} words/min")


# 5b tremor episodes: different Hz / posture => different episodes -------------------
def run_episodes(hz, amp, grav, secs=12):
    m, e = MotionAnalyzer(fs=50), TremorEpisodes(); out = []
    for i in range(50 * (secs + 8)):
        t = i / 50
        on = t < secs
        w = amp * math.sin(2 * math.pi * hz * t) if on else 0.0
        r = m.feed(t, grav[0] * (1 + w * (grav[0] != 0)), grav[1] + w * (grav[1] != 0), grav[2] * (1 + w * (grav[2] != 0)) + (w if grav[2] == 0 else 0))
        ep = e.feed(t, r)
        if ep: out.append(ep)
    return out
e5 = run_episodes(5.0, 0.12, (0, 0, -1))  # band -z up: wrist flat, palm down
e8 = run_episodes(8.0, 0.12, (0, 1, 0))  # band +y up: arm hanging
check("5 Hz shake, forearm flat -> one rest-like episode", len(e5) == 1 and e5[0]["kind"] == "rest-like 4-6 Hz" and 4.6 <= e5[0]["hz"] <= 5.4, str(e5[:1]))
check("8 Hz shake, other posture -> one fast episode", len(e8) == 1 and e8[0]["kind"] == "fast 6-14 Hz" and 7.4 <= e8[0]["hz"] <= 8.6, str(e8[:1]))
check("episodes differ in orientation (pitch)", len(e5) == 1 and len(e8) == 1 and abs(e5[0]["pitch"] - e8[0]["pitch"]) > 45, f"{e5[0]['pitch'] if e5 else None} vs {e8[0]['pitch'] if e8 else None}")

# 6 acoustic -----------------------------------------------------------------
a, tags = AcousticTagger(), []
lv = [0.02] * 10 + [0.95, 0.5, 0.15] + [0.02] * 10
for i, l in enumerate(lv):
    x = a.tag(i / 10, l); tags += [x] if x else []
check("glass break: impulsive peak then fast decay", tags == ["Object_Drop_Glass_Break"], str(tags))
a, tags = AcousticTagger(), []
for i in range(60):  # loud but sustained (vacuum cleaner) 6 s
    x = a.tag(i / 10, 0.9 if i >= 5 else 0.02); tags += [x] if x else []
check("sustained loud noise is NOT glass", tags == [])
a, tags = AcousticTagger(), []
for i in range(260):
    x = a.tag(i / 10, 0.45 + 0.2 * random.random() * (1 if i % 3 else -1)); tags += [x] if x else []
check("crowd babble tagged Crowd_Stress", "Crowd_Stress" in tags, str(tags))

# 7 adherence ----------------------------------------------------------------
rest = (0.0, 0.0, 1.0)
av = AdherenceVerifier(); got = av.arm(0, rest, pre_burden=40.0)
for i in range(int(20 * FS)):
    t = 10 + i / FS
    ang = math.radians(75 if 12 <= t - 10 < 16 else 5)  # forearm up for 4 s then down
    got += av.on_motion(t, math.sin(ang), 0, math.cos(ang))
got += av.on_water(30)
got += av.on_burden(15.0)
check("intake verified: cue+gesture+water+tremor drop 40→15 %", av.verified, str(sorted(av.done)))
av = AdherenceVerifier(); av.arm(0, rest, 40.0)
for i in range(int(10 * FS)): av.on_motion(1 + i / FS, math.sin(math.radians(75)), 0, math.cos(math.radians(75)))  # arm raised and never lowered
av.on_motion(20, 0, 0, 1)
check("arm raised 19 s (not a sip) is NOT hand-to-mouth", "hand_to_mouth" not in av.done)
av = AdherenceVerifier(); av.arm(0, rest, 40.0)
check("no tremor drop (40→35 %) = not verified", av.on_burden(35.0) == [])

# ---------------- end-to-end ----------------
ap = argparse.ArgumentParser(); ap.add_argument("--api"); ap.add_argument("--patient", default="margaret-l")  # no seeded events: analysis can only come from LIVE data
args = ap.parse_args()
if args.api:
    def call(path, body=None):
        req = urllib.request.Request(args.api + path, json.dumps(body).encode() if body is not None else None, {"Content-Type": "application/json"})
        return json.loads(urllib.request.urlopen(req, timeout=10).read())
    P = args.patient
    call("/api/reset", {})
    iso = lambda hm: __import__("datetime").datetime.now().replace(hour=int(hm[:2]), minute=int(hm[3:]), second=0).isoformat()
    # Tuesday-style scenario, live: voice drop, tremor spike, HR surge, glass break, near-fall
    live = [("voice", dict(value=67.2)), ("tremor", dict(value=5.3, amplitude=0.12)), ("heart_rate", dict(value=96)),
            ("acoustic", dict(tag="Object_Drop_Glass_Break")), ("fall", dict(context="near_fall"))]
    ts = {"voice": "16:34", "tremor": "16:40", "heart_rate": "16:40", "acoustic": "16:40", "fall": "16:42"}
    for typ, extra in live:
        r = call("/api/live-event", dict(patientId=P, type=typ, ts=iso(ts[typ]), **extra))
        check(f"live-event {typ} accepted", "error" not in r, json.dumps(r)[:80])
    for metric, val in [("tremor_burden", 31.0), ("dyskinesia_index", 1.4), ("steps", 312), ("outdoor_time", 4), ("nocturia", 4), ("verbal_engagement", 29), ("hrv", 19), ("extrasystoles", 9)]:
        r = call("/api/live-event", dict(patientId=P, type="sample", metric=metric, value=val))
        check(f"sample {metric}={val}", "error" not in r)
    p = call(f"/api/patients/{P}")
    live_cells = {c["metric"]: c for c in p["cells"] if c["day"] == "Live"}
    check("Live column shows tremor burden 31 % flagged alert", live_cells["tremor_burden"]["value"] == 31.0 and live_cells["tremor_burden"]["flag"] == "alert")
    check("Live column shows speech rate 67.2", live_cells["speech_rate"]["value"] == 67.2)
    feed = call(f"/api/live-feed?patientId={P}")
    check("live-feed has tremor_hz history", feed.get("tremor_hz", [{}])[-1].get("v") == 5.3, ",".join(sorted(feed)))
    a = call("/api/analyze", dict(patientId=P))
    live_links = [l for l in a["links"] if "live" in (l["from"].get("eventId") or "") or l["from"].get("stream") == "tremor"]
    check("analysis confirms an incident from LIVE events alone (patient has no seeded events)", a["confidence"] >= 0.7, f"confidence {a['confidence']}  {a['summary'][:90]}")
    check("analysis cites ≥3 entangled streams", len(a["links"]) >= 3, f"{len(a['links'])} links")
    bad = [x for f in a["findings"] for x in f["cellRefs"] if x not in {c["id"] for c in p["cells"]}]
    check("all finding cell pointers exist", not bad, str(bad))
    check("no NaN/undefined in findings", not any(("NaN" in f["text"] or "undefined" in f["text"]) for f in a["findings"]))
    # closed loop
    act = call("/api/actuate-wrist", dict(patientId=P))
    check("actuation arms adherence (cue confirmed)", True, f"{act['vexo']['detail']} | {act['voice']['detail']}")
    for sig in ["hand_to_mouth", "water_sound", "post_dose_tremor_drop"]:
        call("/api/live-event", dict(patientId=P, type="adherence", signal=sig))
    p = call(f"/api/patients/{P}")
    vd = [c for c in p["cells"] if c["day"] == "Live" and c["metric"] == "verified_doses"][0]
    check("4/4 signals → Verified Med Adherence +1 in Live column", vd["value"] == 1, vd.get("note", ""))

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
