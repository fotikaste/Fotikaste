#!/usr/bin/env bash
# Wird beim Desktop-Start aufgerufen (~/.config/labwc/autostart).
# Wartet, bis die Fotobox antwortet, und öffnet dann Chromium im Vollbild (Kiosk).
# Wird Chromium geschlossen oder stürzt ab, startet es nach 3 s wieder.
URL="http://127.0.0.1:8080/?kiosk=1"
BROWSER="$(command -v chromium || command -v chromium-browser)"

for i in $(seq 1 120); do
  curl -fs "http://127.0.0.1:8080/api/konfig" >/dev/null 2>&1 && break
  sleep 1
done

while true; do
  "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run \
    --disable-session-crashed-bubble --disable-features=Translate --password-store=basic \
    --incognito "$URL"
  sleep 3
done
