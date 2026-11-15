"""Pure, hardware-free algorithms: Vexo band signals -> 99% metrics.

Every class takes timestamps `t` (seconds) from the caller, so the same code runs on the real band,
the simulator and in tests. No I/O here. See selftest.py for the proof of each algorithm.

Band reality: accel/gyro, tap events, activity (steps), BLE RSSI, mic loudness. No PPG, no haptics.
"""
import math
from collections import deque

# ---------- spectral helpers ----------

def goertzel(x, fs, f):
    w = 2 * math.pi * f / fs
    c = 2 * math.cos(w)
    s1 = s2 = 0.0
    for v in x:
        s0 = v + c * s1 - s2
        s2, s1 = s1, s0
    return math.sqrt(max(s1 * s1 + s2 * s2 - c * s1 * s2, 0.0)) * 2 / len(x)


def spectrum(samples, fs, lo=2.0, hi=13.0, step=0.1):
    """Hann-windowed amplitude spectrum (g) of |accel|, DC removed. Returns [(hz, amp)]."""
    n = len(samples)
    m = sum(samples) / n
    x = [(v - m) * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i, v in enumerate(samples)]
    out, f = [], lo
    while f <= hi + 1e-9:
        out.append((round(f, 2), 2 * goertzel(x, fs, f)))  # *2 undoes Hann loss
        f += step
    return out


# ---------- 1. Tremor + dyskinesia ----------

class MotionAnalyzer:
    """|accel| stream -> per-second window result + rolling tremor burden and dyskinesia index.

    tremor window  : spectral peak in 4-6 Hz, amplitude >= min_amp, peak dominates 2-9 Hz band (>=35 % of energy)
    dyskinesia win : large (>= dysk_amp) but NOT peaky (< 35 % energy in one 1 Hz bin) = irregular choreic motion
    awake          : window has any movement (std > still_std) - stillness (sleep/rest) is excluded from the burden
    tremor_burden  : % of awake windows in the last `horizon_s` that are tremor windows
    dyskinesia_idx : 0-10, 10 x fraction of awake windows that are dyskinetic
    """

    def __init__(self, fs=50, win_s=2.0, hop_s=1.0, min_amp=0.04, dysk_amp=0.15, still_std=0.01, horizon_s=86400,
                 tremor_persist=4, dysk_persist=4, tremor_lo=3.0, tremor_hi=14.0, offset=(0, 0, 0)):
        self.off = list(offset)  # (awake, tremor, dysk) windows already counted earlier today
        self.t_lo, self.t_hi = tremor_lo, tremor_hi
        self.fs, self.win, self.hop = fs, int(fs * win_s), int(fs * hop_s)
        # a window only counts as tremor/dyskinesia after N consecutive candidate windows (~N s): kills one-off gestures
        self.tp, self.dp, self.t_run, self.d_run = tremor_persist, dysk_persist, 0, 0
        self.min_amp, self.dysk_amp, self.still_std, self.horizon = min_amp, dysk_amp, still_std, horizon_s
        self.buf, self.since = deque(maxlen=self.win), 0
        self.miss, self.run_big = 0, False
        self.vec = deque(maxlen=self.win)
        self.run_hz = 0.0
        self.hist = deque()  # (t, awake, tremor, dysk)
        self.totals = tuple(self.off)

    def feed(self, t, ax, ay, az, walking=False):
        """walking=True (band activity says walk/run): step harmonics are not tremor, voluntary arm swing is not dyskinesia."""
        self.buf.append(math.sqrt(ax * ax + ay * ay + az * az))
        self.vec.append((ax, ay, az))
        self.since += 1
        if len(self.buf) < self.win or self.since < self.hop:
            return None
        self.since = 0
        x = list(self.buf)
        mean = sum(x) / len(x)
        std = math.sqrt(sum((v - mean) ** 2 for v in x) / len(x))
        spec = spectrum(x, self.fs)
        total = sum(a * a for _, a in spec) or 1e-12
        hz, amp = max(spec, key=lambda s: s[1])
        peak_share = sum(a * a for f, a in spec if abs(f - hz) <= 0.5) / total
        awake = std > self.still_std
        # voluntary motion (0.5-2.5 Hz: arm swing, steps, reaching) must not dwarf the tremor peak
        xm = [v - mean for v in x]
        vol = max(2 * goertzel(xm, self.fs, f / 10) for f in range(5, 26, 2))
        steady = self._steady_posture()  # forearm not rotating: scratching, drinking, brushing, reaching all rotate it
        # clean periodic shake (one sharp peak, real amplitude): the band's activity classifier calls it "walk", it is not
        strong = steady and self.t_lo <= hz <= self.t_hi and amp >= 0.15 and peak_share >= 0.6 and amp >= vol
        if strong:
            walking = False
        loud = amp >= 0.4 and peak_share >= 0.25  # a violent, periodic shake: the arm moves with it, posture check does not apply
        cand_t = (awake and not walking and (steady or loud) and self.t_lo <= hz <= self.t_hi and amp >= self.min_amp
                  and peak_share >= (0.25 if amp >= 0.25 else 0.35) and amp >= 0.5 * vol)
        if cand_t and self.t_run and abs(hz - self.run_hz) > 8.0:
            self.t_run = 0  # frequency wandered: a real rest tremor is steady, a scratch is not
        if cand_t and self.t_run == 0:
            self.run_hz = hz
        cand_d = awake and not walking and steady and not cand_t and std * math.sqrt(2) >= self.dysk_amp and peak_share < 0.35
        self.why = dict(hz=round(hz, 2), amp=round(amp, 3), share=round(peak_share, 2), vol=round(vol, 3), std=round(std, 3),
                        steady=steady, strong=strong, walking=walking, awake=awake, cand_t=cand_t, run=self.t_run)
        if cand_t:
            self.run_big = (self.run_big if self.t_run else True) and amp >= 0.25  # every window of the run was a strong shake
            self.t_run, self.miss = self.t_run + 1, 0
        elif self.t_run > 0 and self.miss < 1:  # one weak window inside a shake does not break it
            self.miss += 1
        else:
            self.t_run, self.miss = 0, 0
        self.d_run = self.d_run + 1 if cand_d else 0
        need = self.tp - 1 if self.run_big else self.tp  # a clear, strong shake is confirmed 1 s sooner
        tremor, dysk = self.t_run >= need, self.d_run >= self.dp
        self.hist.append([t, awake, tremor, dysk])
        # back-fill: the run that just got confirmed also counts for its earlier windows
        if self.t_run == need or self.d_run == self.dp:
            idx = 2 if self.t_run == need else 3
            for h in list(self.hist)[-need:]:
                h[idx] = True
        while self.hist and self.hist[0][0] < t - self.horizon:
            self.hist.popleft()
        a = sum(1 for h in self.hist if h[1]) + self.off[0]
        tt = sum(1 for h in self.hist if h[2]) + self.off[1]
        dd = sum(1 for h in self.hist if h[3]) + self.off[2]
        self.totals = (a, tt, dd)
        return {
            "hz": hz, "amp": amp, "grav": tuple(sum(c[i] for c in self.vec) / len(self.vec) for i in range(3)), "tremor": tremor, "dysk": dysk, "awake": awake,
            "tremor_burden": round(100 * tt / a, 1) if a else 0.0,
            "dyskinesia_index": round(10 * dd / a, 1) if a else 0.0,
        }


    def _steady_posture(self, max_deg=30.0, blocks=4):
        """True when the gravity direction stays within max_deg of its window mean (arm resting, not moving through space)."""
        v = list(self.vec)
        n = len(v) // blocks
        if n < 5:
            return True
        means = [tuple(sum(c[i] for c in v[b * n:(b + 1) * n]) / n for i in range(3)) for b in range(blocks)]
        ref = tuple(sum(m[i] for m in means) / blocks for i in range(3))
        return all(tilt_deg(*m, ref) <= max_deg for m in means)

    def recent_burden(self, t, window_s=20):
        """Tremor burden (% of awake windows) over the last `window_s` seconds. 0 when the wrist is at rest."""
        h = [x for x in self.hist if x[0] >= t - window_s and x[1]]
        return round(100 * sum(1 for x in h if x[2]) / len(h), 1) if h else 0.0


def band_to_arm(x, y, z):
    """Vexo band axes -> forearm frame used by the app (x toward the hand, y across the wrist toward the ulna,
    z out of the back of the wrist). Measured on Armel's wrist (calibration 2026-11-14, band on the LEFT wrist):
    arm hanging reads +1 g on band +y (so +y points to the elbow), thumb up reads +1 g on band +x (thumb side),
    palm down reads +1 g on band -z (back of the wrist). Proper rotation, so it works for accel and gyro."""
    return (-y, -x, -z)


class TremorEpisodes:
    """Groups confirmed tremor windows into episodes (start..end) with frequency, amplitude and wrist orientation.

    Closes an episode after `gap` consecutive windows without tremor. Pitch/roll come from the mean gravity vector
    in the band frame (standard accelerometer convention), so different postures give different numbers.
    """

    def __init__(self, gap=3, min_windows=2):
        self.gap, self.min_w = gap, min_windows
        self.cur, self.quiet = [], 0

    @staticmethod
    def kind(hz):
        if hz < 4.0:
            return "slow 3.5-4 Hz"
        if hz <= 6.2:
            return "rest-like 4-6 Hz"
        return "fast 6-14 Hz"

    def feed(self, t, r):
        if r is None:
            return None
        if r["tremor"]:
            self.quiet = 0
            self.cur.append((t, r["hz"], r["amp"], r["grav"]))
            return None
        if not self.cur:
            return None
        self.quiet += 1
        if self.quiet < self.gap:
            return None
        ep = self._close()
        self.cur, self.quiet = [], 0
        return ep

    def _close(self):
        c = self.cur
        if len(c) < self.min_w:
            return None
        hz = sorted(x[1] for x in c)
        amp = [x[2] for x in c]
        g = band_to_arm(*(sum(x[3][i] for x in c) / len(c) for i in range(3)))
        n = math.sqrt(sum(v * v for v in g)) or 1e-9
        gx, gy, gz = (v / n for v in g)
        mhz = hz[len(hz) // 2]
        return dict(start=c[0][0] - 3.0, end=c[-1][0] + 1.0, windows=len(c), hz=round(mhz, 1),
                    hz_min=round(hz[0], 1), hz_max=round(hz[-1], 1),
                    amp=round(sum(amp) / len(amp), 3), amp_peak=round(max(amp), 3),
                    pitch=round(math.degrees(math.atan2(gx, math.sqrt(gy * gy + gz * gz))), 0),  # + = hand up
                    roll=round(math.degrees(math.atan2(gy, gz)), 0),
                    gravity=[round(gx, 2), round(gy, 2), round(gz, 2)], kind=self.kind(mhz))


# ---------- 2. Balance & falls ----------

class FallDetector:
    """|accel| stream (g, >= 50 Hz) -> 'fall' | 'near_fall' | None.

    fall      : free-fall dip (< 0.4 g for >= 80 ms) then impact > 2.5 g within 1 s, then ~still for 2 s
    near_fall : free-fall dip then recovery impact 1.6-2.5 g, wearer keeps moving (stumble)
    Cooldown 5 s.
    """

    def __init__(self, fs=50, impact_g=2.5, stumble_g=1.6, cooldown_s=5):
        self.fs, self.impact, self.stumble, self.cool = fs, impact_g, stumble_g, cooldown_s
        self.dip_since = None
        self.dip_end = None
        self.last = -1e9
        self.pending = None  # (t_impact, peak, samples_after)
        self.after = []

    def feed(self, t, ax, ay, az):
        m = math.sqrt(ax * ax + ay * ay + az * az)
        res = None
        if self.pending:
            self.after.append((t, m))
            self.pending[1] = max(self.pending[1], m) if t - self.pending[0] < 0.5 else self.pending[1]
            if t - self.pending[0] >= 2.0:
                t_imp, peak = self.pending
                tail = [v for (ts, v) in self.after if ts - t_imp >= 0.5] or [1.0]  # let the impact ring-down settle
                mean = sum(tail) / len(tail)
                still = math.sqrt(sum((v - mean) ** 2 for v in tail) / len(tail)) < 0.08
                res = "fall" if (peak >= self.impact and still) else "near_fall"
                self.pending, self.after = None, []
                self.last = t
            return res
        if t - self.last < self.cool:
            return None
        if m < 0.4:
            self.dip_since = self.dip_since if self.dip_since is not None else t
            self.dip_end = t
        elif self.dip_since is not None:
            dur = (self.dip_end or t) - self.dip_since
            if dur >= 0.08 and t - self.dip_end <= 1.0 and m >= self.stumble:
                self.pending, self.after = [t, m], []
                self.dip_since = None
            elif t - (self.dip_end or t) > 1.0:
                self.dip_since = None
        return None


# ---------- 3. Sleep & nocturia ----------

class NocturiaCounter:
    """Night window + activity -> bathroom trips.

    trip = after >= still_s of stillness inside the night window, >= min_steps steps within 90 s.
    Cooldown 15 min. `night(hour)` default 23:00-06:00. Call .rollover() at wake-up to read & reset.
    """

    def __init__(self, still_s=1200, min_steps=8, cooldown_s=900, night=lambda h: h >= 23 or h < 6):
        self.still_s, self.min_steps, self.cool, self.night = still_s, min_steps, cooldown_s, night
        self.still_since = None
        self.steps = deque()  # (t, lifetime_steps)
        self.last_trip = -1e9
        self.trips = 0
        self.fragments = 0

    def feed(self, t, hour, state, steps):
        """state: 'still'|'walk'|'run' (band activity); steps: lifetime steps. Returns True on a new trip."""
        if not self.night(hour):
            self.still_since = None
            self.steps.clear()
            return False
        self.steps.append((t, steps))
        while self.steps and self.steps[0][0] < t - 90:
            self.steps.popleft()
        if state == "still":
            if self.still_since is None:
                self.still_since = t
            return False
        was_still = self.still_since is not None and t - self.still_since >= self.still_s
        walked = self.steps[-1][1] - self.steps[0][1] >= self.min_steps
        if was_still and walked and t - self.last_trip >= self.cool:
            self.trips += 1
            self.last_trip = t
            self.still_since = None
            return True
        if state != "still" and walked:
            self.still_since = None
        return False

    def rollover(self):
        n, self.trips = self.trips, 0
        return n


# ---------- 4. Mobility & outdoor time ----------

class MobilityTracker:
    """Activity events -> steps today; BLE RSSI to the laptop (home base) -> outdoor minutes.

    outdoor = RSSI below `away_dbm` (default -80) for >= 60 s, or no link for >= 60 s while still counting steps
    (the band keeps counting steps offline: lifetime step counter jumps on reconnect).
    """

    def __init__(self, away_dbm=-80, confirm_s=60, state_path=None):
        self.away, self.confirm = away_dbm, confirm_s
        self.state_path = state_path  # keeps the day's starting counter across bridge restarts
        self.first_steps = None
        self.carry, self.last_life = 0, None
        self.steps_today = 0
        self.away_since = None
        self.outdoor_s = 0.0
        self.last_t = None
        self.is_away = False

    def _load(self):
        import datetime, json
        try:
            d = json.load(open(self.state_path))
            if d.get("date") == datetime.date.today().isoformat():
                return d
        except (OSError, ValueError):
            pass
        return {}

    def _save(self):
        import datetime, json
        if not self.state_path:
            return
        try:
            d = self._load()
            d.update(date=datetime.date.today().isoformat(), first=self.first_steps, carry=self.carry, last=self.last_life)
            json.dump(d, open(self.state_path, "w"))
        except OSError:
            pass

    def on_steps(self, lifetime):
        """Steps today = carry + (lifetime - first). The band counter can restart (reboot / reconnect): then what was
        counted so far is carried over, so the day only ever goes up."""
        if self.first_steps is None:
            d = self._load() if self.state_path else {}
            self.first_steps, self.carry, self.last_life = d.get("first"), d.get("carry", 0), d.get("last")
            if self.first_steps is None:
                self.first_steps = lifetime
            if self.last_life is None:
                self.last_life = lifetime
        if lifetime < self.last_life:  # counter went back: bank the steps counted so far
            self.carry += max(0, self.last_life - self.first_steps)
            self.first_steps = lifetime
        if lifetime != self.last_life or self.steps_today == 0:
            self.last_life = lifetime
            self.steps_today = self.carry + max(0, lifetime - self.first_steps)
            self._save()
        return self.steps_today

    def on_link(self, t, rssi):
        """rssi None = no reading. Returns outdoor minutes so far."""
        far = rssi is None or rssi <= self.away
        if far:
            self.away_since = self.away_since if self.away_since is not None else t
        else:
            self.away_since = None
        was_away = self.is_away
        self.is_away = far and self.away_since is not None and t - self.away_since >= self.confirm
        if self.last_t is not None and (self.is_away and was_away):
            self.outdoor_s += t - self.last_t
        elif self.is_away and not was_away:
            self.outdoor_s += self.confirm  # back-fill the confirmation period
        self.last_t = t
        return round(self.outdoor_s / 60, 1)


# ---------- 5. Voice ----------

class VoiceMeter:
    """Mic loudness -> daily verbal engagement (minutes of voiced time); words -> speech rate.

    voiced : level >= voiced_level for the sample (band sends mic-level 10x/s)
    engagement_min : cumulative voiced minutes
    speech_rate : words / minute, computed over voiced time only (a pause is not slow speech):
                  rate = words * 60 / voiced_seconds in the last window. `add_words(t, n)` comes from the
                  transcript (Deepgram/ElevenLabs STT). Without STT the bridge simulates it (clearly flagged).
    """

    def __init__(self, voiced_level=0.08, window_s=60):
        self.vl, self.window = voiced_level, window_s
        self.voiced = deque()  # (t, dt) voiced chunks
        self.words = deque()   # (t, n)
        self.total_voiced_s = 0.0
        self.last_t = None
        self.spoken = deque()  # (t, words, speaking_seconds) from the transcript's own word timestamps

    def on_level(self, t, level):
        dt = 0.0 if self.last_t is None else min(t - self.last_t, 1.0)
        self.last_t = t
        if level >= self.vl:
            self.voiced.append((t, dt))
            self.total_voiced_s += dt
        while self.voiced and self.voiced[0][0] < t - self.window:
            self.voiced.popleft()
        return round(self.total_voiced_s / 60, 2)

    def add_words(self, t, n):
        self.words.append((t, n))
        while self.words and self.words[0][0] < t - self.window:
            self.words.popleft()

    def add_spoken(self, t, n, secs):
        """n words that took `secs` seconds to say (word start/end from the STT). Immune to noise, drinking, silence."""
        if n >= 3 and secs >= 1.0:
            self.spoken.append((t, n, secs))
        while self.spoken and self.spoken[0][0] < t - self.window:
            self.spoken.popleft()

    def speech_rate(self, now=None):
        if self.spoken:
            if now is not None and self.spoken[-1][0] < now - self.window:
                return None
            w = sum(n for _, n, _ in self.spoken)
            s = sum(sec for _, _, sec in self.spoken)
            return round(w * 60 / s, 1) if s >= 3 else None
        v = sum(dt for _, dt in self.voiced)
        w = sum(n for _, n in self.words)
        return round(w * 60 / v, 1) if v >= 5 and w > 0 else None


# ---------- 6. Acoustic context ----------

class AcousticTagger:
    """Mic loudness level 0..1 (10 Hz) -> 'Object_Drop_Glass_Break' | 'Crowd_Stress' | None.

    glass : onset jump >= 0.5 in one sample, peak >= 0.8, and level falls below 0.3 within 0.8 s (impulsive)
    crowd : level between 0.25-0.7 for >= 20 s with high variation (std >= 0.08) = babble, not a sustained tone
    Heuristic stand-in for ElevenLabs/audio tagging: swap `tag()` for a real classifier with the same contract.
    """

    def __init__(self, cooldown_s=5):
        self.prev = 0.0
        self.peak_t = None
        self.hist = deque()
        self.last = {"glass": -1e9, "crowd": -1e9}
        self.cool = cooldown_s

    def tag(self, t, level):
        out = None
        if level - self.prev >= 0.5 and level >= 0.8 and t - self.last["glass"] > self.cool:
            self.peak_t = t
        elif self.peak_t is not None:
            if level < 0.3 and t - self.peak_t <= 0.8:
                out = "Object_Drop_Glass_Break"
                self.last["glass"] = t
                self.peak_t = None
            elif t - self.peak_t > 0.8:
                self.peak_t = None
        self.prev = level
        self.hist.append((t, level))
        while self.hist and self.hist[0][0] < t - 20:
            self.hist.popleft()
        if out is None and len(self.hist) >= 190 and t - self.last["crowd"] > 60:
            lv = [v for _, v in self.hist]
            m = sum(lv) / len(lv)
            sd = math.sqrt(sum((v - m) ** 2 for v in lv) / len(lv))
            if 0.25 <= m <= 0.7 and sd >= 0.08:
                out = "Crowd_Stress"
                self.last["crowd"] = t
        return out


# ---------- 7. Composite adherence ----------

def tilt_deg(ax, ay, az, ref):
    """Angle (deg) between the current gravity vector and the reference (resting) vector."""
    d = ax * ref[0] + ay * ref[1] + az * ref[2]
    n = math.sqrt(ax * ax + ay * ay + az * az) * math.sqrt(sum(r * r for r in ref)) or 1e-9
    return math.degrees(math.acos(max(-1.0, min(1.0, d / n))))


class AdherenceVerifier:
    """After the wrist cue, confirm intake without any patient click.

    hand_to_mouth        : forearm lifts > lift_deg from rest and comes back within 2-10 s, inside `gesture_window_s` of the cue
    water_sound          : external (Pill_Water tag / double-tap stand-in) within the same window
    post_dose_tremor_drop: tremor burden in the `post` window <= drop_ratio x burden in the `pre` window (default 50 %)
    led_haptic_cue       : set by arm()
    """

    def __init__(self, gesture_window_s=300, lift_deg=50, drop_ratio=0.5):
        self.gw, self.lift, self.drop = gesture_window_s, lift_deg, drop_ratio
        self.armed_at = None
        self.ref = None
        self.up_since = None
        self.done = {}
        self.pre_burden = None

    def arm(self, t, rest_vec, pre_burden):
        self.armed_at, self.ref, self.pre_burden = t, rest_vec, pre_burden
        self.up_since, self.done = None, {"led_haptic_cue": True}
        return ["led_haptic_cue"]

    def on_motion(self, t, ax, ay, az):
        if self.armed_at is None or "hand_to_mouth" in self.done or t - self.armed_at > self.gw:
            return []
        a = tilt_deg(ax, ay, az, self.ref)
        if a >= self.lift and self.up_since is None:
            self.up_since = t
        elif a < self.lift * 0.5 and self.up_since is not None:
            dur = t - self.up_since
            self.up_since = None
            if 2.0 <= dur <= 10.0:
                self.done["hand_to_mouth"] = True
                return ["hand_to_mouth"]
        return []

    def on_water(self, t):
        if self.armed_at is None or "water_sound" in self.done or t - self.armed_at > self.gw:
            return []
        self.done["water_sound"] = True
        return ["water_sound"]

    def on_burden(self, post_burden):
        if self.armed_at is None or "post_dose_tremor_drop" in self.done or self.pre_burden is None:
            return []
        if self.pre_burden > 0 and post_burden <= self.pre_burden * self.drop:
            self.done["post_dose_tremor_drop"] = True
            return ["post_dose_tremor_drop"]
        return []

    @property
    def verified(self):
        return len(self.done) == 4
