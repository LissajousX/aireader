; Aireader NSIS installer hooks
; Ref: https://v2.tauri.app/distribute/windows-installer/#extending-the-installer
;
; NSIS_HOOK_PREUNINSTALL runs at the very beginning of the Uninstall section,
; BEFORE the default NSIS uninstaller removes $APPDATA\{BUNDLEID}.
; We use it to launch a PowerShell dialog that lets the user choose which
; CUSTOM data directories (outside the default app-data folder) to delete.

!macro NSIS_HOOK_PREUNINSTALL
  ; Skip during silent / passive updates — no UI
  ${If} $UpdateMode = 1
    Goto _cleanup_skip
  ${EndIf}
  ${If} ${Silent}
    Goto _cleanup_skip
  ${EndIf}

  ; Only run when the user opted to delete application data
  ${If} $DeleteAppDataCheckboxState <> 1
    Goto _cleanup_skip
  ${EndIf}

  ; Check whether the cleanup script was shipped with this build
  ${If} ${FileExists} "$INSTDIR\resources\cleanup-dialog.ps1"
    ; Copy script to %TEMP% so it survives even if $INSTDIR is removed first
    CopyFiles /SILENT "$INSTDIR\resources\cleanup-dialog.ps1" "$TEMP\aireader-cleanup.ps1"

    ; Launch the dialog.  -WindowStyle Hidden hides the console; the
    ; WinForms window is still visible.
    SetShellVarContext current
    ExecWait 'powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "$TEMP\aireader-cleanup.ps1" "$APPDATA\${BUNDLEID}"'

    ; Clean up temp copy
    Delete "$TEMP\aireader-cleanup.ps1"
  ${EndIf}

  _cleanup_skip:
!macroend
