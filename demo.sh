#!/bin/zsh
# ONE command for the demo:  ./demo.sh        (Ctrl+C = quit everything)
cd "$(dirname "$0")" || exit 1
pkill -f band_toggle.py; pkill -f live_streams.py
trap 'pkill -f live_streams.py; pkill -f "next dev"; echo "\nstopped."; exit 0' INT TERM
cat <<'T'
==============================================
  99% live demo
  1. Page : http://localhost:3000/patient/armel
  2. DOUBLE-TAP the band  -> START (rising jingle, blue LED x1)
     page badge: "Bracelet connected"
  3. DOUBLE-TAP again     -> STOP  (falling jingle, blue LED x2)
     page badge: "Bracelet disconnected"
  Ctrl+C here = quit everything
==============================================
T
python3 -u bridge/band_toggle.py 72
