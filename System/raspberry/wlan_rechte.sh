#!/usr/bin/env bash
# Erlaubt dem Fotobox-Dienst, das WLAN zu ändern (für «Internet einrichten» am Touchscreen).
# Ohne diese Regel darf nur, wer am Desktop angemeldet ist, ein WLAN wählen – nicht der Dienst im Hintergrund.
# Die Regel gilt NUR für den Benutzer der Fotobox und NUR für NetworkManager (WLAN/Netzwerk).
# Aufruf: sudo bash wlan_rechte.sh <benutzer>     (darf mehrmals ausgeführt werden)
#
# Stand 2026-11-18: Polkit-Regel nach offizieller polkit-Dokumentation (JavaScript-Regeln, polkit ab 0.106).
# Auf dem echten Pi NOCH NICHT getestet.
set -euo pipefail
BENUTZER="${1:?Benutzername fehlt}"
REGEL=/etc/polkit-1/rules.d/50-fotobox-wlan.rules

if ! command -v nmcli >/dev/null; then
  echo "    NetworkManager (nmcli) fehlt – «Internet einrichten» funktioniert dann nicht"; exit 0
fi
mkdir -p /etc/polkit-1/rules.d
cat > "$REGEL" <<REGEL
// Fotobox: Dienst darf WLAN einrichten (angelegt von wlan_rechte.sh)
polkit.addRule(function(action, subject) {
    if (subject.user == "$BENUTZER" && action.id.indexOf("org.freedesktop.NetworkManager.") == 0) {
        return polkit.Result.YES;
    }
});
REGEL
chmod 644 "$REGEL"
echo "    WLAN-Einrichtung für «$BENUTZER» erlaubt ($REGEL)"
