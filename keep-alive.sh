#!/bin/bash
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    echo "[$(date)] Restarting..." >> /tmp/keepalive.log
    kill $(pgrep -f "next dev" 2>/dev/null) 2>/dev/null
    sleep 2
    fuser -k 3000/tcp 2>/dev/null
    sleep 1
    NODE_OPTIONS="--max-old-space-size=1024" node /home/z/my-project/node_modules/.bin/next dev -p 3000 > /tmp/nextdev.log 2>&1 &
  fi
  sleep 5
done
