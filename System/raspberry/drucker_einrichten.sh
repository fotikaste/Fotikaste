#!/usr/bin/env bash
# Richtet den DNP DS620 in CUPS ein (Name «DS620», Gutenprint-Treiber, 10x15 cm).
# Voraussetzung: Drucker per USB eingesteckt und eingeschaltet, Papier eingelegt.
# Aufruf: bash drucker_einrichten.sh      (darf mehrmals ausgeführt werden)
# Rückgabe 0 = eingerichtet, 1 = Drucker nicht gefunden / Fehler.
#
# Stand 2026-11-11: ohne echten Drucker geschrieben – beim ersten echten Lauf genau prüfen.
set -uo pipefail
NAME="DS620"

if ! command -v lpadmin >/dev/null; then echo "    CUPS ist nicht installiert (zuerst installieren.sh)"; exit 1; fi

# 1) Anschluss suchen. Gutenprint meldet DNP-Drucker als «gutenprint53+usb://dnp-ds620/…»
URI="$(sudo lpinfo -v 2>/dev/null | awk '{print $2}' | grep -iE 'ds620|ds-620' | grep -i gutenprint | head -1)"
[ -z "$URI" ] && URI="$(sudo lpinfo -v 2>/dev/null | awk '{print $2}' | grep -iE 'ds620|ds-620' | head -1)"
if [ -z "$URI" ]; then
  echo "    Kein DNP DS620 gefunden. Ist er eingesteckt und eingeschaltet?"
  echo "    Alle erkannten Anschlüsse:"; sudo lpinfo -v 2>/dev/null | grep -i usb | sed 's/^/      /'
  exit 1
fi
echo "    Anschluss: $URI"

# 2) Treiber suchen (Gutenprint-Eintrag für den DS620)
TREIBER="$(lpinfo -m 2>/dev/null | grep -i 'dnp-ds620' | grep -vi simple | awk '{print $1}' | head -1)"
[ -z "$TREIBER" ] && TREIBER="$(lpinfo -m 2>/dev/null | grep -i 'ds620' | awk '{print $1}' | head -1)"
if [ -z "$TREIBER" ]; then echo "    Kein Treiber für den DS620 gefunden (printer-driver-gutenprint installiert?)"; exit 1; fi
echo "    Treiber: $TREIBER"

# 3) Einrichten und freigeben
# abort-job: Bei einem Druckerfehler wird der Auftrag abgebrochen (Fotobox meldet «fehlgeschlagen»,
# der Betreiber entscheidet über einen Nachdruck). So druckt nie ein alter Auftrag später unbemerkt nach.
sudo lpadmin -p "$NAME" -E -v "$URI" -m "$TREIBER" -o printer-error-policy=abort-job || exit 1
sudo cupsenable "$NAME"; sudo cupsaccept "$NAME"

# 4) Papiergrösse 10x15 cm. Gutenprint nennt sie normalerweise «w288h432» (4x6 Zoll).
GROESSEN="$(lpoptions -p "$NAME" -l 2>/dev/null | grep -i '^PageSize')"
if echo "$GROESSEN" | grep -qw 'w288h432'; then
  sudo lpadmin -p "$NAME" -o PageSize=w288h432
  echo "    Papiergrösse: w288h432 (10x15 cm)"
else
  echo "    ACHTUNG: «w288h432» nicht in der Liste. Verfügbare Grössen:"
  echo "$GROESSEN" | sed 's/^/      /'
  echo "    → Den passenden Namen auf der Betriebsseite unter «druck_medium» eintragen bzw. Claude fragen."
fi
lpstat -p "$NAME"
exit 0
