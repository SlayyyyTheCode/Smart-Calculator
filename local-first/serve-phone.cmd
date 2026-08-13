@echo off
REM Double-click this to open Smart Planner on your phone.
REM Leave the window open - closing it stops the server.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve-phone.ps1"
echo.
echo Server stopped.
pause
