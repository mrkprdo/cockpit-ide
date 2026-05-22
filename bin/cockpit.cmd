@echo off
setlocal
"%~dp0..\CockpitIDE.exe" %*
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
endlocal
