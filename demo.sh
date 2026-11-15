#!/bin/zsh
# ONE command for the demo:  ./demo.sh        (Ctrl+C = quit everything)
cd "$(dirname "$0")" || exit 1
pkill -f band_toggle.py; pkill -f live_streams.py
lsof -ti tcp:3000 tcp:3001 | xargs kill 2>/dev/null; sleep 1  # free the site ports (no stale dev server)
trap 'pkill -f live_streams.py; pkill -f "next dev"; echo "\nstopped."; exit 0' INT TERM
cat <<'T'
==============================================
  99% live demo
  1. Page : http://localhost:3000/patient/armel
  2. Site buttons: "Clear data" (reset) then "Start live" / "Stop live"
  Ctrl+C here = quit everything
==============================================
T
python3 -u bridge/band_toggle.py 72
