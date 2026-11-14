# Vexo band → NeuroPulse (live)

One-time: `python3 -m pip install bleak` (done on this Mac). `.env.local` already points `VEXO_WEBHOOK_URL` to the bridge.

1. Terminal A: `npm run dev` (http://localhost:3000)
2. Close any Vexo dashboard tab (one program per band).
3. Double-tap the band (LED blinks blue for 60 s).
4. Terminal B, diagnostic: `python3 bridge/live_streams.py 72 --check` (add `--mic` to test the mic)
5. Terminal B, live: `python3 bridge/live_streams.py 72 --api http://localhost:3000 [--mic]`
6. Open http://localhost:3000/patient/henri-m → Live column updates every 2 s.
7. Click "Generate AI Synthesis" → apply protocol → LED goes amber (2 blinks) + voice on laptop.

No band: `python3 bridge/live_streams.py --scenario tuesday --clock 16:34 --fake-hr`
USB-C instead of Bluetooth: add `--usb` (no RSSI → no outdoor time).
Source table: GET /api/metric-sources. Algorithm proofs: `python3 bridge/selftest.py [--api URL]`.
Speech rate, HR, HRV, extrasystoles are simulated (no sensor): never posted live unless `--fake-hr` / `--fake-voice`.
