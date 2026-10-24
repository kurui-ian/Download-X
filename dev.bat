@echo off
title DLX - Development (Live Hot-Reload)
setlocal enabledelayedexpansion

set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"

echo ===================================================
echo     DLX - Development Mode (Live Hot-Reload)
echo ===================================================
echo.
echo Any changes you save in src/renderer (React, Tailwind, JSX)
echo will instantly hot-reload live inside the DLX window.
echo.

call npm run dev
if errorlevel 1 (
    echo.
    echo [DLX ERROR] Dev server exited with an error.
    pause
)
