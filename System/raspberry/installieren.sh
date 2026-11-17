#!/usr/bin/env bash
# Fotobox auf dem Raspberry Pi einrichten.
#
# Aufruf (als normaler Benutzer, NICHT mit sudo):   bash installieren.sh
# Das Programm fragt einmal nach deinem Passwort (für sudo) und braucht einmalig Internet.
# Es darf mehrmals ausgeführt werden (z. B. nach einem Update) – es richtet nur ein, was fehlt.
#
# Was es macht:
#  1. Pakete installieren: gphoto2 (Kamera), CUPS + Gutenprint (Drucker DNP DS620), Chromium, Python
#  2. Python-Umgebung ~/.fotobox-venv mit den Paketen aus requirements.txt
#  3. Datenordner ~/fotobox-daten (Fotos, Datenbank, Protokoll) – bleibt bei Updates erhalten
#  4. Dienst «fotobox»: startet beim Einschalten automatisch und nach einem Absturz neu
#  5. Kiosk: Browser im Vollbild ohne Leisten, Desktop-Anmeldung automatisch, kein Bildschirmschoner
#  6. Kamera-Sperre lösen: Linux soll die Kamera nicht als «Speicherkarte» öffnen (GVFS)
#  7. Alte Taster-Einträge entfernen (seit 2026-11-17 Bedienung nur per Touchscreen)
#  8. Drucker einrichten, falls der DNP DS620 schon eingesteckt und eingeschaltet ist
#
# Stand 2026-11-16: in Ubuntu (WSL) teilweise geprüft (Drucker-Teil mit echtem DS620), auf echtem Raspberry Pi NOCH NICHT getestet.
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEM="$(cd "$HIER/.." && pwd)"
VENV="$HOME/.fotobox-venv"
DATEN="$HOME/fotobox-daten"
PORT=8080
BENUTZER="$(id -un)"

schritt() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ok()      { printf '    \033[32m✓\033[0m %s\n' "$*"; }
hinweis() { printf '    \033[33m!\033[0m %s\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Bitte NICHT mit sudo starten, sondern so:  bash installieren.sh"; exit 1
fi
if [ ! -f "$SYSTEM/fotobox/__main__.py" ]; then
  echo "Fotobox-Programm nicht gefunden in $SYSTEM"; exit 1
fi
IST_PI=0
if grep -qi "raspberry pi" /proc/device-tree/model 2>/dev/null; then IST_PI=1; fi

schritt "1/8 Pakete installieren (braucht Internet, dauert einige Minuten)"
sudo apt-get update
PAKETE=(gphoto2 python3-gphoto2 python3-venv python3-pip cups printer-driver-gutenprint curl)
if [ "$IST_PI" -eq 1 ]; then
  # Chromium heisst auf Raspberry Pi OS «chromium» (früher «chromium-browser»)
  if apt-cache show chromium >/dev/null 2>&1; then PAKETE+=(chromium); else PAKETE+=(chromium-browser); fi
fi
sudo apt-get install -y "${PAKETE[@]}"
sudo usermod -aG lpadmin,plugdev "$BENUTZER"
ok "Pakete installiert, Benutzer $BENUTZER darf Drucker verwalten (lpadmin) und die Kamera nutzen (plugdev)"

schritt "2/8 Python-Umgebung $VENV"
if [ ! -x "$VENV/bin/python" ]; then
  # --system-site-packages: damit das per apt installierte «gphoto2»-Paket sichtbar ist
  python3 -m venv --system-site-packages "$VENV"
fi
"$VENV/bin/pip" install --quiet -r "$SYSTEM/requirements.txt"
"$VENV/bin/python" -c "import flask, PIL, waitress, segno, gphoto2" && ok "Python-Pakete vollständig"

schritt "3/8 Datenordner $DATEN"
mkdir -p "$DATEN"
NEU=0; [ -f "$DATEN/fotobox.db" ] || NEU=1
( cd "$SYSTEM" && "$VENV/bin/python" - "$DATEN" "$NEU" <<'PY'
import sys
from pathlib import Path
from fotobox.store import Store
daten, neu = Path(sys.argv[1]), sys.argv[2] == "1"
s = Store(daten / "fotobox.db")
if neu:  # nur beim ersten Mal: echte Kamera und echten Drucker vorwählen
    s.setze_einstellung("kamera_modus", "gphoto2")
    s.setze_einstellung("drucker_modus", "cups")
    print("    Neue Datenbank: Kamera = gphoto2, Drucker = CUPS (änderbar auf der Betriebsseite)")
else:
    print("    Bestehende Datenbank behalten (Einstellungen und Zähler bleiben)")
PY
)
ok "Fotos, Datenbank und Protokoll liegen in $DATEN"

schritt "4/8 Dienst «fotobox» (Autostart und Neustart nach Absturz)"
sed -e "s|@BENUTZER@|$BENUTZER|g" -e "s|@SYSTEM@|$SYSTEM|g" -e "s|@VENV@|$VENV|g" \
    -e "s|@DATEN@|$DATEN|g" -e "s|@PORT@|$PORT|g" "$HIER/fotobox.service" \
  | sudo tee /etc/systemd/system/fotobox.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable fotobox.service >/dev/null
sudo systemctl restart fotobox.service
for i in $(seq 1 30); do
  curl -fs "http://127.0.0.1:$PORT/api/konfig" >/dev/null 2>&1 && break
  sleep 1
done
if curl -fs "http://127.0.0.1:$PORT/api/konfig" >/dev/null 2>&1; then
  ok "Fotobox läuft auf http://127.0.0.1:$PORT/"
else
  hinweis "Fotobox antwortet noch nicht. Nachsehen mit:  journalctl -u fotobox -n 50"
fi

schritt "5/8 Kiosk (Vollbild-Browser beim Start)"
if [ "$IST_PI" -eq 1 ]; then
  # Laut offizieller Raspberry-Pi-Anleitung: Programme beim Desktop-Start in ~/.config/labwc/autostart
  mkdir -p "$HOME/.config/labwc"
  AUTOSTART="$HOME/.config/labwc/autostart"
  touch "$AUTOSTART"
  sed -i '/# fotobox-kiosk/d' "$AUTOSTART"
  echo "bash \"$HIER/kiosk-start.sh\" &  # fotobox-kiosk" >> "$AUTOSTART"
  if command -v raspi-config >/dev/null; then
    sudo raspi-config nonint do_boot_behaviour B4 && ok "Automatische Anmeldung am Desktop eingeschaltet"
    sudo raspi-config nonint do_blanking 1 && ok "Bildschirmschoner aus" || hinweis "Bildschirmschoner nicht abschaltbar – bitte in raspi-config prüfen"
  fi
  ok "Kiosk eingerichtet ($AUTOSTART)"
else
  hinweis "Kein Raspberry Pi erkannt – Kiosk übersprungen"
fi

schritt "6/8 Kamera-Sperre lösen (GVFS)"
# Der Dateimanager-Dienst würde die Kamera als Laufwerk öffnen und damit für gphoto2 blockieren.
if systemctl --user mask gvfs-gphoto2-volume-monitor.service >/dev/null 2>&1; then
  systemctl --user stop gvfs-gphoto2-volume-monitor.service >/dev/null 2>&1 || true
  ok "gvfs-gphoto2-volume-monitor ausgeschaltet"
else
  hinweis "GVFS-Dienst nicht gefunden (ist auf diesem System evtl. nicht vorhanden – dann gut)"
fi
pkill -f gvfsd-gphoto2 >/dev/null 2>&1 || true

schritt "7/8 Alte Taster-Einträge entfernen (Bedienung jetzt per Touchscreen)"
CONFIG=""
for k in /boot/firmware/config.txt /boot/config.txt; do [ -f "$k" ] && CONFIG="$k" && break; done
if [ -n "$CONFIG" ] && grep -q '^# fotobox-taster-anfang' "$CONFIG" 2>/dev/null; then
  sudo sed -i '/^# fotobox-taster-anfang/,/^# fotobox-taster-ende/d' "$CONFIG"
  ok "Taster-Block aus $CONFIG entfernt"
else
  ok "Keine Taster-Einträge vorhanden – nichts zu tun"
fi

schritt "8/8 Drucker DNP DS620"
if bash "$HIER/drucker_einrichten.sh"; then
  ok "Drucker eingerichtet"
else
  hinweis "Drucker noch nicht eingerichtet. Später: Drucker einstecken, einschalten, dann  bash $HIER/drucker_einrichten.sh"
fi

printf '\n\033[1;32mFertig.\033[0m Bitte den Raspberry Pi jetzt neu starten:  sudo reboot\n'
printf 'Danach startet die Fotobox von selbst im Vollbild. Betrieb: Tastatur anschliessen, Strg+Umschalt+B.\n'
