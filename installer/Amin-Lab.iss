; ============================================================
;  Amin-Lab -cem🔬 — سكربت التثبيت (Inno Setup 6)
;  الاستخدام: installer\build-setup.cmd
; ============================================================

#define MyAppName "Amin-Lab -cem🔬"
#define MyAppVersion "1.5.1"
#define MyAppPublisher "Amin-Lab"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "Amin-Lab-Genie.cmd"

[Setup]
AppId={{7B1F3C2A-9D44-4B6E-9F27-1A6C0E7B5D31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Amin-Lab Genie
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=Amin-Lab-Genie-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupLogging=yes
; الحد الأدنى: Windows 10
MinVersion=10.0

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "إنشاء اختصار على سطح المكتب"; GroupDescription: "اختصارات:"
Name: "autostart"; Description: "تشغيل النظام تلقائياً عند بدء Windows"; GroupDescription: "بدء التشغيل:"

[Dirs]
Name: "{app}\data"; Permissions: users-modify
Name: "{app}\data\backups"; Permissions: users-modify

[Files]
Source: "..\server\dist\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\server\package.json"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\client\src\*"; DestDir: "{app}\client\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "launch.cmd"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\دليل الاستخدام"; Filename: "{app}\docs\README.md"
Name: "{group}\إلغاء التثبيت"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{cmd}"; Parameters: "/c npm install --prefix ""{app}"" --omit=dev"; StatusMsg: "تثبيت التبعيات…"; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "تشغيل {#MyAppName}"; Flags: postinstall nowait shellexec
Filename: "http://localhost:3000"; Description: "فتح الواجهة في المتصفح"; Flags: postinstall shellexec unchecked

[UninstallDelete]
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\node_modules"
; بيانات المستخدم تُبقى عمداً — احذف {app}\data يدوياً إن أردت حذفها
