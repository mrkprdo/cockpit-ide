; Cockpit IDE — NSIS installer script
; Build: makensis /DVERSION="x.y.z" /DOUTDIR="out" /DSRCDIR="out\CockpitIDE-win32-x64" scripts\installer.nsi

Unicode True
!include "MUI2.nsh"

;--------------------------------
; Definitions (injected by pack.js via /D flags)

!ifndef VERSION
  !define VERSION "0.0.1-dev"
!endif
!ifndef OUTDIR
  !define OUTDIR "out"
!endif
!ifndef SRCDIR
  !define SRCDIR "out\CockpitIDE-win32-x64"
!endif
!ifndef ICONPATH
  !define ICONPATH "public\cockpit_ide_icon.ico"
!endif

;--------------------------------
; Installer metadata

Name "Cockpit IDE"
OutFile "${OUTDIR}\CockpitIDESetup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\CockpitIDE"
InstallDirRegKey HKCU "Software\CockpitIDE" "InstallDir"
RequestExecutionLevel user

;--------------------------------
; MUI configuration

!define MUI_ICON "${ICONPATH}"
!define MUI_UNICON "${ICONPATH}"
!define MUI_WELCOMEPAGE_TITLE "Cockpit IDE ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "The IDE for developers who think spatially.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\CockpitIDE.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Cockpit IDE"
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Add Cockpit IDE to PATH"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION AddToPath
!define MUI_LICENSEPAGE_CHECKBOX

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Install

Section "Cockpit IDE" SecMain
  SectionIn RO

  ; Kill running instance before overwrite
  ExecWait 'taskkill /F /IM CockpitIDE.exe' $0

  SetOutPath "$INSTDIR"
  File /r "${SRCDIR}\*.*"

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\Cockpit IDE.lnk" "$INSTDIR\CockpitIDE.exe" \
    "" "$INSTDIR\CockpitIDE.exe" 0

  ; Start Menu
  CreateDirectory "$SMPROGRAMS\Cockpit IDE"
  CreateShortcut "$SMPROGRAMS\Cockpit IDE\Cockpit IDE.lnk" "$INSTDIR\CockpitIDE.exe" \
    "" "$INSTDIR\CockpitIDE.exe" 0
  CreateShortcut "$SMPROGRAMS\Cockpit IDE\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; bin launcher
  CreateDirectory "$INSTDIR\bin"
  FileOpen $0 "$INSTDIR\bin\cockpit.cmd" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 'start "" "%~dp0..\CockpitIDE.exe" %*$\r$\n'
  FileClose $0

  ; Uninstaller + Add/Remove Programs entry
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr  HKCU "Software\CockpitIDE" "InstallDir" "$INSTDIR"
  WriteRegStr  HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "DisplayName" "Cockpit IDE"
  WriteRegStr  HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "DisplayVersion" "${VERSION}"
  WriteRegStr  HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "Publisher" "Cockpit IDE"
  WriteRegStr  HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr  HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "DisplayIcon" "$INSTDIR\CockpitIDE.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE" \
    "NoRepair" 1
SectionEnd

Function AddToPath
  nsExec::ExecToLog 'powershell.exe -NonInteractive -Command "$$b = ''$INSTDIR\bin''; $$p = [Environment]::GetEnvironmentVariable(''PATH'', ''User''); if ($$p -notlike (''*'' + $$b + ''*'')) { [Environment]::SetEnvironmentVariable(''PATH'', $$(if($$p){$$p + '';'' + $$b}else{$$b}), ''User'') }"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

;--------------------------------
; Uninstall

Section "Uninstall"
  ExecWait 'taskkill /F /IM CockpitIDE.exe' $0

  ; Remove $INSTDIR\bin from user PATH
  nsExec::ExecToLog 'powershell.exe -NonInteractive -Command "$$b = ''$INSTDIR\bin''; $$p = [Environment]::GetEnvironmentVariable(''PATH'', ''User''); $$arr = ($$p.Split('';'') | Where-Object { $$_ -ne $$b }); [Environment]::SetEnvironmentVariable(''PATH'', ($$arr -join '';''), ''User'')"'
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ; NSIS copies uninstaller to %TEMP% before running, so deleting $INSTDIR is safe
  RMDir /r "$INSTDIR"

  Delete "$DESKTOP\Cockpit IDE.lnk"
  RMDir /r "$SMPROGRAMS\Cockpit IDE"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CockpitIDE"
  DeleteRegKey HKCU "Software\CockpitIDE"
SectionEnd
