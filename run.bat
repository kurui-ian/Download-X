@echo off
title DLX - Download Manager
echo Starting DLX Download Manager...
if exist "%~dp0release\win-unpacked\DLX.exe" (
  start "" "%~dp0release\win-unpacked\DLX.exe"
) else (
  call "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
)
