"""Eingesteckte USB-Sticks finden (für den Export der Fotos).

Raspberry Pi / Linux: Der Desktop hängt Sticks automatisch unter /media/<benutzer>/<name> ein.
Windows: Wechseldatenträger (Laufwerkstyp «removable»), z. B. D:\\.
Nur diese Ordner sind als Exportziel erlaubt – nie ein beliebiger Pfad aus dem Browser.
"""
from __future__ import annotations

import getpass
import os
import shutil
import sys
from pathlib import Path


def _linux() -> list[Path]:
    try:
        benutzer = getpass.getuser()
    except Exception:  # noqa: BLE001
        return []
    gefunden = []
    for basis in (Path("/media") / benutzer, Path("/run/media") / benutzer, Path("/media")):
        try:
            for p in sorted(basis.iterdir()):
                if p.is_dir() and os.path.ismount(p) and p not in gefunden:
                    gefunden.append(p)
        except OSError:
            continue
    return gefunden


def _windows() -> list[Path]:
    import ctypes
    k = ctypes.windll.kernel32
    maske = k.GetLogicalDrives()
    gefunden = []
    for i in range(26):
        if maske & (1 << i):
            wurzel = f"{chr(65 + i)}:\\"
            if k.GetDriveTypeW(ctypes.c_wchar_p(wurzel)) == 2:   # 2 = DRIVE_REMOVABLE
                gefunden.append(Path(wurzel))
    return gefunden


def _name(p: Path) -> str:
    if sys.platform.startswith("win"):
        import ctypes
        puffer = ctypes.create_unicode_buffer(261)
        if ctypes.windll.kernel32.GetVolumeInformationW(ctypes.c_wchar_p(str(p)), puffer, 261,
                                                        None, None, None, None, 0):
            return f"{puffer.value or 'USB-Stick'} ({str(p)[:2]})"
        return str(p)[:2]
    return p.name


def usb_sticks() -> list[dict]:
    """[{pfad, name, frei_mb}] aller beschreibbaren USB-Sticks."""
    try:
        kandidaten = _windows() if sys.platform.startswith("win") else _linux()
    except Exception:  # noqa: BLE001 – lieber keine Sticks als ein Absturz der Betriebsseite
        return []
    sticks = []
    for p in kandidaten:
        try:
            frei = shutil.disk_usage(p).free // 1_000_000
        except OSError:
            continue   # z. B. Kartenleser ohne Karte
        if os.access(p, os.W_OK):
            sticks.append({"pfad": str(p), "name": _name(p), "frei_mb": frei})
    return sticks


def auf_stick_schreiben_abschliessen():
    """Alles wirklich auf den Stick schreiben, damit er danach abgezogen werden darf."""
    if hasattr(os, "sync"):
        os.sync()
