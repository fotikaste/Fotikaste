#!/usr/bin/env bash
# Fotobox auf dem Raspberry Pi aktualisieren – ohne Tippen.
# Liegt auf dem USB-Stick als «Fotobox aktualisieren.sh» neben dem Ordner «Fuer-Raspberry-Pi».
# Am Pi: im Dateimanager doppelklicken → «Execute in Terminal».
#
# Was es macht:
#  1. Neue Version vom Stick nach ~/fotobox kopieren (Fotos und Einstellungen in ~/fotobox-daten bleiben)
#  2. Prüfen, dass alles richtig angekommen ist
#  3. Pi neu starten
set -u
STICK="$(cd "$(dirname "$0")" && pwd)"
QUELLE="$STICK/Fuer-Raspberry-Pi/fotobox"
ZIEL="$HOME/fotobox"

ende() { echo; read -r -p "$1 – Enter drücken zum Schliessen." _; exit "${2:-1}"; }

echo "Fotobox aktualisieren"
echo "  von: $QUELLE"
echo "  nach: $ZIEL"
echo
[ -f "$QUELLE/fotobox/__main__.py" ] || ende "FEHLER: Neue Version auf dem Stick nicht gefunden"
[ -d "$ZIEL" ] || ende "FEHLER: $ZIEL fehlt – zuerst einmal installieren.sh ausführen"

cp -rf "$QUELLE/." "$ZIEL/" || ende "FEHLER beim Kopieren"
# Linux-Skripte dürfen keine Windows-Zeilenenden haben (Sicherheitsnetz)
sed -i 's/\r$//' "$ZIEL"/raspberry/*.sh "$ZIEL"/raspberry/*.service 2>/dev/null
sync

# Jede Datei vom Stick muss gleich auf dem Pi liegen (alte Zusatzdateien auf dem Pi sind egal)
UNTERSCHIEDE="$(diff -rq --strip-trailing-cr --exclude=__pycache__ "$QUELLE" "$ZIEL" 2>&1 | grep -v "^Only in $ZIEL")"
if [ -z "$UNTERSCHIEDE" ]; then
  echo "✓ Neue Version ist vollständig kopiert."
else
  echo "Unterschiede:"; echo "$UNTERSCHIEDE" | head -20
  ende "FEHLER: Kopie stimmt nicht mit dem Stick überein"
fi
[ -f "$ZIEL/VERSION" ] && echo "  Version: $(cat "$ZIEL/VERSION")"

echo
echo "Jetzt startet der Pi neu (dafür wird evtl. dein Passwort gefragt)."
echo "USB-Stick danach abziehen."
read -r -p "Enter drücken zum Neustarten …" _
sudo reboot
