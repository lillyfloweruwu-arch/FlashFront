# Custom NSIS hooks, picked up by electron-builder from build/installer.nsh.
#
# On an auto-update (--updated), electron-builder keeps existing shortcuts but
# never recreates a missing one, even with createDesktopShortcut "always"
# (addDesktopLink skips CreateShortCut when isUpdated). A friend who lost the
# desktop shortcut once would never get it back. Recreate missing shortcuts
# here, after the stock shortcut handling has run.

!macro customInstall
  ${if} ${isUpdated}
    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      ${ifNot} ${isNoDesktopShortcut}
        ${ifNot} ${FileExists} "$newDesktopLink"
          CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
          ClearErrors
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${endIf}
      ${endIf}
    !endif

    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      ${ifNot} ${FileExists} "$newStartMenuLink"
        !insertmacro createMenuDirectory
        CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
      ${endIf}
    !endif

    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
