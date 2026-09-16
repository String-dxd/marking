@echo off
cd /d "%~dp0"
if exist "tallus.exe" (
    start "" "tallus.exe" %*
    exit
)
start "" ".venv\Scripts\pythonw.exe" "tallus_desktop.py" %*
