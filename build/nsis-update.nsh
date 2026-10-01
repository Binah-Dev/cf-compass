; Only NSIS installs receive this marker. Directory and portable builds cannot
; opt into the installer updater merely because app.isPackaged is true.
!macro customInstall
  FileOpen $0 "$INSTDIR\cf-compass-nsis-install" w
  FileWrite $0 "${APP_ID}"
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$INSTDIR\cf-compass-nsis-install"
!macroend
