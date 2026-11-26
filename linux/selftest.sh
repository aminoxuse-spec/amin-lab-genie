#!/bin/sh
# Amin-Lab -Pro .deb self-test - run on Ubuntu 22.04+ / Debian 12+.
#   sudo sh linux/selftest.sh [path/to/amin-lab-pro_1.5.3_amd64.deb]
set -u

DEB="${1:-release/amin-lab-pro_1.5.3_amd64.deb}"
PORT=3000
FAIL=0

section() { printf '\n===== %s =====\n' "$1"; }

section "system"
. /etc/os-release 2>/dev/null || true
echo "${PRETTY_NAME:-unknown} $(uname -r) $(uname -m)"

section "install"
dpkg -i "$DEB" || apt-get -f install -y
if [ $? -ne 0 ]; then
  echo "[FAIL] package installation failed"
  exit 1
fi
dpkg -l amin-lab-pro | tail -2

section "service"
if [ -d /run/systemd/system ]; then
  systemctl is-enabled amin-lab-pro || { echo "[FAIL] service not enabled"; FAIL=1; }
  systemctl restart amin-lab-pro.service >/dev/null 2>&1 || true
  sleep 2
  if ! systemctl is-active --quiet amin-lab-pro; then
    echo "[FAIL] service is not active"
    systemctl status --no-pager -l amin-lab-pro 2>&1 | head -20
    FAIL=1
  else
    echo "[OK] service is active"
  fi
else
  echo "systemd not running in this environment (container/WSL without systemd)"
fi

section "http"
READY=0
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS -m 3 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -eq 0 ]; then
  echo "[FAIL] /api/health did not respond within 15s"
  FAIL=1
else
  echo "[OK] /api/health = 200"
fi

printf 'login page: '
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:${PORT}/" || { echo "[FAIL] login page unreachable"; FAIL=1; }
printf 'stylesheet: '
curl -sS -m 5 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:${PORT}/style.css" || { echo "[FAIL] stylesheet unreachable"; FAIL=1; }

section "installed files"
ls -l /opt/amin-lab-pro/runtime/bin/node /usr/bin/amin-lab-pro \
  /usr/share/applications/amin-lab-pro.desktop \
  /lib/systemd/system/amin-lab-pro.service 2>&1

section "data"
ls -l /var/lib/amin-lab-pro 2>&1 | head -10
if [ -f /var/lib/amin-lab-pro/first-run-credentials.txt ]; then
  echo "first-run credentials file exists (contents not printed for security)"
fi

section "logs"
if [ -d /run/systemd/system ]; then
  journalctl -u amin-lab-pro -n 40 --no-pager 2>&1 | tail -40
else
  echo "(run manually) sudo -u aminlab env DATA_DIR=/var/lib/amin-lab-pro CLIENT_DIR=/opt/amin-lab-pro/client/src /opt/amin-lab-pro/runtime/bin/node /opt/amin-lab-pro/server/dist/index.js"
fi

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "===== SELF-TEST FAILED ====="
  exit 1
fi
echo
echo "===== SELF-TEST PASSED ====="