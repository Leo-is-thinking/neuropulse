#!/bin/zsh
# One command: (re)start site + bridge + Deepgram. Usage: bridge/start-band.sh [stop|status|logs]
cd "$(dirname "$0")/.." || exit 1
LOG=/tmp/neuropulse; mkdir -p $LOG
case "$1" in
  stop)   pkill -f "next dev"; pkill -f live_streams.py; echo "stopped"; exit 0;;
  status) curl -s -o /dev/null -w "site: %{http_code}\n" localhost:3000
          pgrep -f live_streams.py >/dev/null && echo "bridge: running" || echo "bridge: DOWN"
          tail -n 8 $LOG/bridge.log; exit 0;;
  logs)   tail -f $LOG/bridge.log; exit 0;;
esac
set -a; [ -f .env ] && . ./.env; [ -f .env.local ] && . ./.env.local; set +a
[ -z "$DEEPGRAM_API_KEY" ] && { echo "DEEPGRAM_API_KEY missing in .env"; exit 1; }
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Token $DEEPGRAM_API_KEY" https://api.deepgram.com/v1/projects)
[ "$code" = 200 ] && echo "Deepgram key OK" || { echo "Deepgram key rejected (HTTP $code)"; exit 1; }
pkill -f "next dev"; pkill -f live_streams.py; sleep 2
rm -rf .next
nohup npm run dev > $LOG/site.log 2>&1 &
echo -n "site"; for i in {1..60}; do curl -s -o /dev/null localhost:3000 && break; echo -n .; sleep 1; done; echo " up"
curl -s -o /dev/null localhost:3000/patient/armel   # warm-up compile
echo ">>> Double-tap band NOW (blue LED), close Vexo dashboard tabs. Bridge starts in 5 s."; sleep 5
nohup python3 -u bridge/live_streams.py 72 --api http://localhost:3000 --stt > $LOG/bridge.log 2>&1 &
sleep 15; tail -n 12 $LOG/bridge.log
echo; echo "Page: http://localhost:3000/patient/armel   | logs: bridge/start-band.sh logs"
