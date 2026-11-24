!ifdef UNINSTALLER_OUT_FILE
  !undef UNINSTALLER_OUT_FILE
!endif
!define UNINSTALLER_OUT_FILE "${BUILD_RESOURCES_DIR}\icon.ico"

Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory
Var appExe
Var launchLink

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"
!include "allowOnlyOneInstallerInstance.nsh"

!ifdef INSTALL_MODE_PER_ALL_USERS
  RequestExecutionLevel admin
!else
  RequestExecutionLevel user
!endif

!ifdef ONE_CLICK
  !include "oneClick.nsh"
!else
  !include "assistedInstaller.nsh"
!endif

!insertmacro addLangs

!macro customInstall
  WriteUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

Function .onInit
  Call setInstallSectionSpaceRequired
  SetOutPath $INSTDIR
  ${LogSet} on

  !ifdef DISPLAY_LANG_SELECTOR
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro check64BitAndSetRegView
  !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !insertmacro initMultiUser
FunctionEnd

!include "installUtil.nsh"

Section "install" INSTALL_SECTION_ID
  !include "installSection.nsh"
SectionEnd

Function setInstallSectionSpaceRequired
  !insertmacro setSpaceRequired ${INSTALL_SECTION_ID}
FunctionEnd

Section "Uninstall"
  SetOutPath $TEMP
  !insertmacro setLinkVars
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    Delete "$oldDesktopLink"
  !endif
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    Delete "$oldStartMenuLink"
  !endif
  RMDir /r "$INSTDIR"
  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
SectionEnd
