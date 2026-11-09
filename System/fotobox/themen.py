"""Themen: eine einzige Quelle für Farben und Schriften.

Die Oberfläche bekommt die Werte über /api/konfig, die Postkarte nutzt dieselben
Werte. Ein neues Thema = ein neuer Eintrag in THEMEN.
"""

THEMEN = {
    "elegant": {
        "titel": "Elegant",
        "schrift": "GreatVibes-Regular.ttf", "schrift_name": "Great Vibes", "name_gr": 8.2,
        "farben": {"bg": "#15120f", "flaeche": "#211c17", "linie": "#3a322a", "text": "#f6f1ea",
                   "leise": "#a89e92", "akzent": "#e3b96b", "akzent_text": "#1d160d",
                   "licht1": "rgba(227,185,107,.16)", "licht2": "rgba(180,120,90,.12)", "name_farbe": "#f6f1ea"},
        "karte": {"bg": "#f6f1ea", "name": "#2a221a", "text": "#7a6a58"},
        "deko": "licht",
    },
    "minimal": {
        "titel": "Minimalistisch",
        "schrift": "Parisienne-Regular.ttf", "schrift_name": "Parisienne", "name_gr": 7.4,
        "farben": {"bg": "#f7f5f2", "flaeche": "#ffffff", "linie": "#dcd7d0", "text": "#1c1a17",
                   "leise": "#6f6a63", "akzent": "#1c1a17", "akzent_text": "#ffffff",
                   "licht1": "transparent", "licht2": "transparent", "name_farbe": "#1c1a17"},
        "karte": {"bg": "#ffffff", "name": "#1c1a17", "text": "#6f6a63"},
        "deko": "linie",
    },
    "sommer": {
        "titel": "Sommer",
        "schrift": "Pacifico-Regular.ttf", "schrift_name": "Pacifico", "name_gr": 6.2,
        "farben": {"bg": "#fff4e4", "flaeche": "#ffffff", "linie": "#f2d6b3", "text": "#2b2320",
                   "leise": "#7d6458", "akzent": "#ff6b4a", "akzent_text": "#ffffff",
                   "licht1": "rgba(255,190,70,.45)", "licht2": "rgba(40,190,180,.30)", "name_farbe": "#e2512f"},
        "karte": {"bg": "#fff4e4", "name": "#e2512f", "text": "#7d6458"},
        "deko": "sonne",
    },
    "winter": {
        "titel": "Winter",
        "schrift": "PinyonScript-Regular.ttf", "schrift_name": "Pinyon Script", "name_gr": 7.2,
        "farben": {"bg": "#0e1a2b", "flaeche": "#16263c", "linie": "#2a3f5c", "text": "#eef4fb",
                   "leise": "#9db0c8", "akzent": "#cfe3f7", "akzent_text": "#0e1a2b",
                   "licht1": "rgba(150,190,240,.18)", "licht2": "rgba(220,235,255,.10)", "name_farbe": "#ffffff"},
        "karte": {"bg": "#0e1a2b", "name": "#ffffff", "text": "#9db0c8"},
        "deko": "schnee",
    },
}


def thema(name: str) -> dict:
    return THEMEN.get(name, THEMEN["elegant"])
