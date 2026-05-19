!include "WordFunc.nsh"
!insertmacro WordReplace

; Add to PATH section - shown as checkbox on components page (checked by default)
Section "Add to PATH" AddToPathSection
SectionEnd

!macro customInit
  SectionSetFlags ${AddToPathSection} ${SF_SELECTED}

  ; Remove previous installation before installing current package
  ; Check per-machine (HKLM) installation first
  ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R0 '$R0 /S'
    ${EndIf}
  ${EndIf}
  ${If} $R0 != ""
    DetailPrint "Removing previous per-machine installation..."
    ExecWait $R0
  ${EndIf}

  ; Check per-user (HKCU) installation
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  ${If} $R0 == ""
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $R0 != ""
      StrCpy $R0 '$R0 /S'
    ${EndIf}
  ${EndIf}
  ${If} $R0 != ""
    DetailPrint "Removing previous per-user installation..."
    ExecWait $R0
  ${EndIf}
!macroend

!macro customInstall
  ; Create bin directory with launcher script
  CreateDirectory "$INSTDIR\bin"
  FileOpen $R2 "$INSTDIR\bin\cockpit.bat" w
  FileWrite $R2 "@echo off$\r$\n"
  FileWrite $R2 'start "" "%~dp0..\Cockpit.exe" %*$\r$\n'
  FileClose $R2

  SectionGetFlags ${AddToPathSection} $R0
  IntOp $R0 $R0 & ${SF_SELECTED}
  ${If} $R0 != 0
    ReadRegStr $R1 HKCU "Environment" "Path"
    WriteRegExpandStr HKCU "Environment" "Path" "$R1;$INSTDIR\bin"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove launcher script
  Delete "$INSTDIR\bin\cockpit.bat"
  RMDir "$INSTDIR\bin"

  ReadRegStr $R0 HKCU "Environment" "Path"
  ${If} $R0 != ""
    ${WordReplace} "$R0" ";$INSTDIR\bin" "" "+" $R1
    ${WordReplace} "$R1" "$INSTDIR\bin;" "" "+" $R1
    WriteRegExpandStr HKCU "Environment" "Path" "$R1"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
  ${EndIf}
!macroend
