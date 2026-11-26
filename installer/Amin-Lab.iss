; ============================================================
;  Amin-Lab -Pro🔬 — سكربت التثبيت (Inno Setup 6)
;  الاستخدام: installer\build-setup.cmd
; ============================================================

#define MyAppName "Amin-Lab -Pro🔬"
#define MyAppVersion "1.5.3"
#define MyAppPublisher "Amin-Lab"
; صفحة الدعم الرسمية — استبدلها بالموقع الرسمي عند توفره
#define MyAppURL "https://wa.me/213558128160"
#define MyAppExeName "Amin-Lab-Genie.cmd"

[Setup]
AppId={{7B1F3C2A-9D44-4B6E-9F27-1A6C0E7B5D31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
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
UninstallDisplayIcon={app}\app.ico
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
Source: "runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "vendor\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\server\dist\*"; DestDir: "{app}\server\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\server\package.json"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\client\src\*"; DestDir: "{app}\client\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
; APP_SECRET الإنتاجي — يفعّل مفاتيح الترخيص المرتبطة برقم التثبيت
Source: ".env.production"; DestDir: "{app}"; DestName: ".env"; Flags: ignoreversion onlyifdoesntexist uninsneveruninstall
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README-FIRST.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\SETUP-GUIDE-AR-FR-EN.pdf"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "verify-install.cmd"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "launch.cmd"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\backup-now.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\scripts\register-backup-task.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion

[InstallDelete]
; إزالة ملفات التخطيط القديم (server\*.js) عند الترقية من إصدار سابق
Type: files; Name: "{app}\server\*.js"
; npm/npx لم يعدا مضمّنين (الخادم يحتاج node.exe فقط) — يُحذفان عند الترقية
Type: filesandordirs; Name: "{app}\runtime\node_modules"
Type: files; Name: "{app}\runtime\npm.cmd"
Type: files; Name: "{app}\runtime\npm.ps1"
Type: files; Name: "{app}\runtime\npx.cmd"
Type: files; Name: "{app}\runtime\npx.ps1"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; IconIndex: 0
Name: "{group}\دليل الاستخدام"; Filename: "{app}\docs\README.md"
Name: "{group}\إلغاء التثبيت"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app.ico"; IconIndex: 0; Tasks: desktopicon

[Run]
; التبعيات مضمّنة في المثبت — لا حاجة لـ npm ولا لاتصال بالإنترنت
Filename: "{app}\{#MyAppExeName}"; Description: "تشغيل {#MyAppName}"; Flags: postinstall nowait shellexec skipifsilent
Filename: "http://localhost:3000"; Description: "فتح الواجهة في المتصفح"; Flags: postinstall shellexec unchecked skipifsilent
; تسجيل نسخة احتياطية يومية (02:00) في Task Scheduler
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-ExecutionPolicy Bypass -NoProfile -File ""{app}\scripts\register-backup-task.ps1"" -ProjectDir ""{app}"" -NodePath ""{app}\runtime\node.exe"""; Flags: runhidden; StatusMsg: "تسجيل نسخة احتياطية يومية..."

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""Amin-Lab Genie Daily Backup"" /f"; Flags: runhidden; RunOnceId: "DeleteBackupTask"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\node_modules"
; بيانات المستخدم تُبقى عمداً — احذف {app}\data يدوياً إن أردت حذفها
