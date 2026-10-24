!macro customInit
  ${if} ${FileExists} "$INSTDIR\resources\CS2_Lineups\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_CS2_Lineups"
    CopyFiles /SILENT "$INSTDIR\resources\CS2_Lineups\*.*" "$APPDATA\UtilityPlus\backup_CS2_Lineups"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\CS2_Lineups\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_CS2_Lineups"
    CopyFiles /SILENT "$INSTDIR\CS2_Lineups\*.*" "$APPDATA\UtilityPlus\backup_CS2_Lineups"
  ${endif}
!macroend

!macro customInstall
  ${if} ${FileExists} "$APPDATA\UtilityPlus\backup_CS2_Lineups\*.*"
    CreateDirectory "$INSTDIR\resources\CS2_Lineups"
    CopyFiles /SILENT "$APPDATA\UtilityPlus\backup_CS2_Lineups\*.*" "$INSTDIR\resources\CS2_Lineups"
    CreateDirectory "$DOCUMENTS\UtilityPlus\CS2_Lineups"
    CopyFiles /SILENT "$APPDATA\UtilityPlus\backup_CS2_Lineups\*.*" "$DOCUMENTS\UtilityPlus\CS2_Lineups"
    RMDir /r "$APPDATA\UtilityPlus\backup_CS2_Lineups"
  ${endif}
!macroend
