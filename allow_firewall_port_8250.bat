@echo off
echo =======================================================
echo   Enabling LAN Access for AI Marker (Port 8250)
echo =======================================================
echo.
netsh advfirewall firewall add rule name="AI Marker Web Server (Port 8250)" dir=in action=allow protocol=TCP localport=8250
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Inbound firewall rule for Port 8250 has been added!
    echo Other devices on your Wi-Fi/LAN can now access:
    echo   http://192.168.50.10:8250
) else (
    echo.
    echo [ERROR] Please right-click this file and select 'Run as administrator'.
)
echo.
pause
