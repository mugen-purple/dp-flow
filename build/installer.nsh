!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var CleanInstallCheckbox
Var DesktopShortcutCheckbox
Var UninstallPreviousCheckbox
Var PreviousUninstaller
Var PreviousInstallFound

Page custom CleanInstallPageCreate CleanInstallPageLeave

Function FindPreviousInstallation
  StrCpy $PreviousUninstaller ''
  StrCpy $PreviousInstallFound 0

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\br.dpflow.desktop" "UninstallString"
  ${If} $0 != ''
    StrCpy $PreviousUninstaller $0
  ${EndIf}

  ${If} $PreviousUninstaller == ''
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\br.dpflow.desktop" "UninstallString"
    ${If} $0 != ''
      StrCpy $PreviousUninstaller $0
    ${EndIf}
  ${EndIf}

  ${If} $PreviousUninstaller == ''
    ReadRegStr $0 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\br.dpflow.desktop" "UninstallString"
    ${If} $0 != ''
      StrCpy $PreviousUninstaller $0
    ${EndIf}
  ${EndIf}

  ${If} $PreviousUninstaller == ''
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\DP Flow\Uninstall DP Flow.exe"
      StrCpy $PreviousUninstaller '"$LOCALAPPDATA\Programs\DP Flow\Uninstall DP Flow.exe"'
    ${EndIf}
  ${EndIf}

  ${If} $PreviousUninstaller == ''
    ${If} ${FileExists} "$PROGRAMFILES\DP Flow\Uninstall DP Flow.exe"
      StrCpy $PreviousUninstaller '"$PROGRAMFILES\DP Flow\Uninstall DP Flow.exe"'
    ${EndIf}
  ${EndIf}

  ${If} $PreviousUninstaller == ''
    ${If} ${FileExists} "$PROGRAMFILES32\DP Flow\Uninstall DP Flow.exe"
      StrCpy $PreviousUninstaller '"$PROGRAMFILES32\DP Flow\Uninstall DP Flow.exe"'
    ${EndIf}
  ${EndIf}

  ${If} $PreviousUninstaller != ''
    ${If} ${FileExists} $PreviousUninstaller
      StrCpy $PreviousInstallFound 1
    ${EndIf}
  ${EndIf}
FunctionEnd

Function CleanInstallPageCreate
  Call FindPreviousInstallation
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${If} $PreviousInstallFound == 1
    ${NSD_CreateLabel} 0 0 100% 30u "Uma versão anterior do DP Flow foi encontrada nesta máquina."
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 30u "Nenhuma versão anterior do DP Flow foi encontrada."
  ${EndIf}
  Pop $0
  ${NSD_CreateCheckbox} 0 35u 100% 14u "Desinstalar a versão anterior antes de instalar"
  Pop $UninstallPreviousCheckbox
  ${If} $PreviousInstallFound == 1
    ${NSD_SetState} $UninstallPreviousCheckbox ${BST_CHECKED}
  ${Else}
    EnableWindow $UninstallPreviousCheckbox 0
    ${NSD_SetState} $UninstallPreviousCheckbox ${BST_UNCHECKED}
  ${EndIf}
  ${NSD_CreateCheckbox} 0 60u 100% 14u "Fazer instalação limpa e apagar os dados locais anteriores"
  Pop $CleanInstallCheckbox
  ${NSD_SetState} $CleanInstallCheckbox ${BST_UNCHECKED}
  ${NSD_CreateCheckbox} 0 85u 100% 14u "Criar atalho do DP Flow na área de trabalho"
  Pop $DesktopShortcutCheckbox
  ${NSD_SetState} $DesktopShortcutCheckbox ${BST_CHECKED}
  nsDialogs::Show
FunctionEnd

Function CleanInstallPageLeave
  ${NSD_GetState} $UninstallPreviousCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ${If} $PreviousInstallFound == 1
      Delete "$DESKTOP\DP Flow.lnk"
      ExecWait 'taskkill /F /IM "DP Flow.exe"' $1
      ExecWait '$PreviousUninstaller /S' $1
    ${EndIf}
  ${EndIf}

  ${NSD_GetState} $CleanInstallCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    RMDir /r "$APPDATA\dp-flow"
    RMDir /r "$APPDATA\DP Flow"
    RMDir /r "$LOCALAPPDATA\dp-flow"
    RMDir /r "$LOCALAPPDATA\DP Flow"
  ${EndIf}
FunctionEnd

Function .onInstSuccess
  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    SetShellVarContext current
    CreateDirectory "$DESKTOP"
    CreateShortCut "$DESKTOP\DP Flow.lnk" "$INSTDIR\DP Flow.exe" "" "$INSTDIR\DP Flow.exe" 0 SW_SHOWNORMAL "" "Abrir o DP Flow"
  ${EndIf}
FunctionEnd