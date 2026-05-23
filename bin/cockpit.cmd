@echo off
setlocal
if exist "%~dp0..\CockpitIDE.exe" (
  start "" "%~dp0..\CockpitIDE.exe" %*
) else if exist "%~dp0..\scripts\launch.js" (
  node "%~dp0..\scripts\launch.js" %*
) else (
  echo Cockpit IDE not found. Build or install first.
  exit /b 1
)
endlocal
