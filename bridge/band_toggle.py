#!/usr/bin/env python3
"""Double-tap toggle. Leave this running in one terminal.
 double-tap band (idle)      -> site + bridge + Deepgram start, LED blue x1
 double-tap band (running)   -> bridge stops, mic released, LED blue x2
Usage: python3 -u bridge/band_toggle.py [band number, default 72]
"""
import asyncio, os, subprocess, sys, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NUM = sys.argv[1] if len(sys.argv) > 1 else "72"
NAME = f"Vexo-HACK-{NUM}"
COOLDOWN = 3  # bridge stays connected; it only exits on Ctrl+C or a lost link


def load_env():
    for f in (".env", ".env.local"):
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            for line in open(p):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def site_up():
    try:
        urllib.request.urlopen("http://localhost:3000", timeout=3)
        return True
    except Exception:
        return False


def ensure_site():
    if site_up():
        return
    print("[toggle] starting site...")
    subprocess.Popen(["npm", "run", "dev"], cwd=ROOT, stdout=open("/tmp/neuropulse_site.log", "w"), stderr=subprocess.STDOUT)
    for _ in range(90):
        if site_up():
            break
        time.sleep(1)
    try:
        urllib.request.urlopen("http://localhost:3000/patient/armel", timeout=60)  # warm-up compile
    except Exception:
        pass


async def wait_for_band():
    """Return the moment the band advertises (callback, no fixed scan window)."""
    from bleak import BleakScanner
    found = asyncio.Event()

    def cb(device, adv):
        if (device.name or adv.local_name or "") == NAME:
            found.set()

    async with BleakScanner(cb):
        await found.wait()


def beep(name):
    subprocess.Popen(["afplay", "-v", "4", os.path.join(ROOT, "bridge", "sounds", f"{name}.wav")])


def main():
    load_env()
    if not os.environ.get("DEEPGRAM_API_KEY"):
        sys.exit("DEEPGRAM_API_KEY missing in .env")
    print(f"[toggle] ready. Double-tap {NAME} to START, double-tap again to STOP. Ctrl+C quits.")
    while True:
        try:
            asyncio.run(wait_for_band())
        except Exception as ex:
            print(f"[toggle] scan error: {str(ex)[:80]}")
            time.sleep(3)
            continue
        pass  # bridge announces "Band connected" once linked
        print("[toggle] band seen -> starting")
        ensure_site()
        p = subprocess.run([sys.executable, "-u", os.path.join(ROOT, "bridge", "live_streams.py"), NUM,
                            "--api", "http://localhost:3000", "--stt"] + (["--debug-motion"] if os.environ.get("NP_DEBUG") else []), cwd=ROOT)
        print(f"[toggle] bridge ended (code {p.returncode}). Cooldown {COOLDOWN}s.")
        time.sleep(COOLDOWN)
        print("[toggle] ready again.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[toggle] bye")
