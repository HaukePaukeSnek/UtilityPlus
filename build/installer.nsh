!macro customInit
  ${if} ${FileExists} "$INSTDIR\resources\CS2_Lineups\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_CS2_Lineups"
    CopyFiles /SILENT "$INSTDIR\resources\CS2_Lineups\*.*" "$APPDATA\UtilityPlus\backup_CS2_Lineups"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\CS2_Lineups\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_CS2_Lineups"
    CopyFiles /SILENT "$INSTDIR\CS2_Lineups\*.*" "$APPDATA\UtilityPlus\backup_CS2_Lineups"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\resources\Map_Callouts\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_Map_Callouts"
    CopyFiles /SILENT "$INSTDIR\resources\Map_Callouts\*.*" "$APPDATA\UtilityPlus\backup_Map_Callouts"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\Map_Callouts\*.*"
    CreateDirectory "$APPDATA\UtilityPlus\backup_Map_Callouts"
    CopyFiles /SILENT "$INSTDIR\Map_Callouts\*.*" "$APPDATA\UtilityPlus\backup_Map_Callouts"
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
  ${if} ${FileExists} "$APPDATA\UtilityPlus\backup_Map_Callouts\*.*"
    CreateDirectory "$INSTDIR\resources\Map_Callouts"
    CopyFiles /SILENT "$APPDATA\UtilityPlus\backup_Map_Callouts\*.*" "$INSTDIR\resources\Map_Callouts"
    CreateDirectory "$DOCUMENTS\UtilityPlus\Map_Callouts"
    CopyFiles /SILENT "$APPDATA\UtilityPlus\backup_Map_Callouts\*.*" "$DOCUMENTS\UtilityPlus\Map_Callouts"
    RMDir /r "$APPDATA\UtilityPlus\backup_Map_Callouts"
  ${endif}
!macroend
