; Octavo keeps its data in %APPDATA%\Octavo (app > appDirectoriesOverride in tauri.conf.json). The uninstaller's
; "Delete the application data" option removes it too, and never while an update reinstalls the app.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    RmDir /r "$APPDATA\Octavo"
  ${EndIf}
!macroend
