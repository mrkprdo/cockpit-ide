@echo off
setlocal

set "APP=%~dp0..\CockpitIDE.exe"
if exist "%APP%" (
  rem Plain `start` — no PowerShell string interpolation. The old
  rem `-Command "Start-Process '%APP%' -ArgumentList '%*'"` executed any
  rem argument containing a single quote as PowerShell code.
  start "" "%APP%" %*
  goto :end
)

if exist "%~dp0..\scripts\launch.js" (
  node "%~dp0..\scripts\launch.js" %*
  goto :end
)

echo Cockpit IDE not found. Build or install first.
exit /b 1

:end
endlocal