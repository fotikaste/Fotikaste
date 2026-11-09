@echo off
chcp 65001 >nul
title Fotobox
cd /d "%~dp0System"

if not exist ".venv\Scripts\python.exe" (
    echo Erster Start: Python-Umgebung wird eingerichtet. Das braucht einmalig Internet und etwa eine Minute ...
    py -3 -m venv .venv
    ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
)

echo.
echo  Fotobox startet. Der Browser oeffnet sich gleich automatisch.
echo  Gaeste:     http://127.0.0.1:8080/
echo  Betrieb:    http://127.0.0.1:8080/betrieb
echo.
echo  BEENDEN: dieses Fenster schliessen oder Strg+C druecken.
echo.
".venv\Scripts\python.exe" -m fotobox
echo.
echo Die Fotobox wurde beendet.
pause
