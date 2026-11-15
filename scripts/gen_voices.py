"""Generate voice clips (macOS `say`) with progressive hypophonia: slower, flatter, quieter, longer pauses, fading."""
import json, subprocess, wave, os, re
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "voices")
SR = 24000
VOICE = "aura-2-apollo-en"  # Deepgram Aura 2, needs DEEPGRAM_API_KEY
SENT = {
    "m6": "I called my daughter this morning, she is coming on Sunday with the kids.",
    "w3": "The doctor wants to see me again, I need to find a time that works.",
    "Mon": "I slept badly again, I will have coffee and sit by the window.",
    "Tue": "Could you bring me a glass of water, my hands are not steady.",
    "Wed": "The neighbour brought bread, I told her to come in for a moment.",
    "Thu": "I got stuck at the doorway again, my feet would not move.",
    "Fri": "We are going to the market later, if the weather stays dry.",
    "Sat": "There were too many people at the shop, I wanted to leave.",
    "Sun": "My son phoned, he will visit next week with the grandchildren.",
}


def tts(text):
    raw = subprocess.run(
        ["curl", "-sf", "-X", "POST", f"https://api.deepgram.com/v1/speak?model={VOICE}&encoding=linear16&container=wav&sample_rate={SR}",
         "-H", "Authorization: Token " + os.environ["DEEPGRAM_API_KEY"], "-H", "Content-Type: application/json",
         "-d", json.dumps({"text": text})], capture_output=True, check=True).stdout
    return np.frombuffer(raw[44:], dtype=np.int16).astype(np.float32) / 32768

def stretch(x, f, win=1024):
    """WSOLA time-stretch by factor f (>1 = slower), keeps pitch."""
    if f <= 1.001:
        return x
    hop = win // 2
    w = np.hanning(win)
    n = int(len(x) * f)
    out = np.zeros(n + win); norm = np.zeros(n + win)
    pos_in = 0.0; prev = 0
    for pos_out in range(0, n, hop):
        c = int(pos_in)
        lo = max(0, c - 256)
        best, bi = -1e9, c
        ref = x[prev + hop: prev + hop + win] if prev + hop + win <= len(x) else None
        for cand in range(lo, min(len(x) - win, c + 256), 32):
            if ref is None:
                break
            sc = float(np.dot(x[cand: cand + win], ref))
            if sc > best: best, bi = sc, cand
        if c + win > len(x): break
        seg = x[bi: bi + win]
        out[pos_out: pos_out + win] += seg * w; norm[pos_out: pos_out + win] += w
        prev = bi; pos_in += hop / f
    norm[norm < 1e-3] = 1
    return (out / norm)[:n]

def widen_gaps(x, extra):
    """Lengthen the quietest word gaps with silence (more pauses between words)."""
    fr = 480
    e = np.array([np.sqrt(np.mean(x[i:i + fr] ** 2)) for i in range(0, len(x) - fr, fr)])
    thr = 0.12 * e.max()
    out, i = [], 0
    quiet = e < thr
    while i < len(e):
        if quiet[i]:
            j = i
            while j < len(e) and quiet[j]: j += 1
            out.append(x[i * fr: j * fr])
            if 2 <= j - i <= 20: out.append(np.zeros(int(SR * extra)))
            i = j
        else:
            j = i
            while j < len(e) and not quiet[j]: j += 1
            out.append(x[i * fr: j * fr]); i = j
    return np.concatenate(out)

def build(sentence, t):
    gain = 10 ** (-8 * t / 20)
    fade = 0.1 + 0.45 * t
    chunks = []
    for c in [c.strip() for c in sentence.split(",") if c.strip()]:
        x = tts(c + ",")
        x = stretch(x, 1 + 0.8 * t)
        if t > 0.3: x = widen_gaps(x, 0.25 * t)
        x = x * np.linspace(1, 1 - fade, len(x)) ** 1.5
        chunks += [x, np.zeros(int(SR * (0.15 + 0.7 * t)))]
    y = np.concatenate(chunks)
    y = y / np.max(np.abs(y)) * 0.9 * gain
    return (y * 32767).astype(np.int16)

def save(name, y):
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())

os.makedirs(OUT, exist_ok=True)
for key, s in SENT.items():
    if key == "m6":
        save("m6", build(s, 0.0))
    elif key == "w3":
        save("w3", build(s, 0.41))
    else:
        for lvl in range(3):
            save(f"{key}-{lvl}", build(s, lvl / 2))
print("ok")
