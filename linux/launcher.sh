#!/bin/sh
# Amin-Lab -Pro - start the service if needed and open a standalone window.
URL="http://localhost:3000"

if command -v systemctl >/dev/null 2>&1; then
  if ! systemctl is-active --quiet amin-lab-pro.service; then
    if ! systemctl start amin-lab-pro.service >/dev/null 2>&1; then
      echo "Warning: could not start amin-lab-pro.service (try: sudo systemctl start amin-lab-pro)"
    fi
  fi
fi

i=0
ready=0
while [ "$i" -lt 40 ]; do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
  else
    # No curl available: fall back to a TCP probe via /dev/tcp
    if (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
      exec 3<&- 3>&-
      ready=1
      break
    fi
  fi
  i=$((i + 1))
  sleep 0.5
done

if [ "$ready" -eq 0 ]; then
  echo "Amin-Lab -Pro is not responding on $URL"
  echo "Start the service with: sudo systemctl start amin-lab-pro"
fi

for browser in google-chrome-stable google-chrome chromium chromium-browser microsoft-edge microsoft-edge-stable brave-browser; do
  if command -v "$browser" >/dev/null 2>&1; then
    exec "$browser" --app="$URL" --window-size=1340,900
  fi
done

if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$URL"
fi

echo "Amin-Lab -Pro is running at $URL"
