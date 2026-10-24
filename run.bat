@echo off
title DLX - Download Manager
setlocal enabledelayedexpansion

:: Ensure Node.js and Git are on the PATH if installed in standard locations
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"

echo ===================================================
echo             DLX - Download Manager
echo ===================================================
echo.

:: 1. Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo [DLX] Dependencies not found. Installing node_modules...
    call npm install
    if errorlevel 1 (
        echo [DLX ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: 2. Check if built output exists (dist and dist-electron)
if not exist "%~dp0dist\index.html" (
    echo [DLX] Compiling renderer bundle...
    call npm run build:renderer
)
if not exist "%~dp0dist-electron\main\index.js" (
    echo [DLX] Compiling main process bundle...
    call npm run build:main
)

:: 3. Check for release binary first, or launch via Electron
if exist "%~dp0release\win-unpacked\DLX.exe" (
    echo [DLX] Starting packaged DLX Desktop binary...
    start "" "%~dp0release\win-unpacked\DLX.exe"
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
    echo [DLX] Launching DLX Desktop via Electron...
    call "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
) else (
    echo [DLX] Launching via npx electron...
    call npx electron "%~dp0."
    if errorlevel 1 (
        echo [DLX ERROR] Failed to start DLX.
        pause
        exit /b 1
    )
)

echo [DLX] Application launched successfully.
exit /b 0
