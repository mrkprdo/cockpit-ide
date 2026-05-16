@echo off
setlocal

set "APP=%~dp0..\CockpitIDE.exe"
if exist "%APP%" (
  if "%*"=="" (
    powershell -NoProfile -Command "Start-Process '%APP%' -WindowStyle Normal"
  ) else (
    powershell -NoProfile -Command "Start-Process '%APP%' -ArgumentList '%*' -WindowStyle Normal"
  )
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