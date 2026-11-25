# Teststrategie

| Ebene | Werkzeug | Was |
|---|---|---|
| Unit | Vitest | Preisberechnung (Rappen, Rabatte, MWST an/aus), Zeitrechnung Europe/Zurich inkl. Sommer-/Winterzeit-Wechsel, Token, Rechnungssummen |
| Integration | Vitest + lokale Supabase (Docker) oder Test-Projekt | Buchung end-to-end in der DB, **zwei gleichzeitige Buchungen → genau eine gewinnt**, abgelaufene Holds, Storno, RLS: Kunde A ≠ Kunde B, Staff ohne Finanzen, Gast ohne Token |
| API | Vitest + **Fotobox-Simulator** | Geräte-Login, falsches/widerrufenes Token, fremdes Event, Upload, Doppel-Upload (idempotent), Abbruch mitten im Upload, Wiederholungen |
| E2E | Playwright | Buchung am Handy (375 px) und Desktop, Portal per Magic Link (Test-Postfach), Admin mit 2FA, abgelaufener Foto-Link |
| Qualität | Lighthouse CI, axe | Performance, Barrierefreiheit (WCAG 2.2 AA), SEO |
| Mails | Outbox im Testmodus | Bestätigung genau einmal, auch wenn der Job zweimal läuft |

## Fotobox-Simulator (`tools/fotobox-simulator/`)
Kommandozeilenprogramm, das wie ein Gerät spricht: Config holen, Fotos (Testbilder) hochladen, Heartbeat,
Verbindungsabbruch simulieren (`--offline 60s`), Fehler erzwingen (`--corrupt`, `--duplicate`, `--expired-token`).

## Regel
Kein Test wird als bestanden gemeldet, ohne dass er tatsächlich lief. Ergebnisse mit Datum in `PROGRESS.md`.
