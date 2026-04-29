#!/bin/bash
# Keep Next.js dev server alive - robust version
cd /home/z/my-project

while true; do
  # Check if port 3000 is actually serving
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
    sleep 5
    continue
  fi
  
  # Port not responding - kill all remnants and restart
  kill $(pgrep -f "next dev" 2>/dev/null) 2>/dev/null
  sleep 2
  
  # Ensure port is free
  fuser -k 3000/tcp 2>/dev/null
  sleep 1
  
  echo "[$(date)] (Re)starting dev server..."
  NODE_OPTIONS="--max-old-space-size=1024" node node_modules/.bin/next dev -p 3000 > /tmp/nextdev.log 2>&1 &
  
  # Wait up to 30s for it to be ready
  for i in $(seq 1 15); do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
      echo "[$(date)] Dev server ready!"
      break
    fi
  done
  sleep 5
done
