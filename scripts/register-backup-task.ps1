<#
.SYNOPSIS
  تسجيل مهمة Windows Task Scheduler لنسخة احتياطية يومية (02:00).
.DESCRIPTION
  يُنشئ مهمة "Amin-Lab Genie Daily Backup" التي تشغّل scripts/backup-now.mjs.
  شغّل PowerShell كمسؤول (Run as Administrator).
.PARAMETER ProjectDir
  مسار جذر المشروع. افتراضي: مجلد السكربت\..
.PARAMETER Time
  وقت التشغيل (HH:mm). افتراضي: 02:00.
#>
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Time = '02:00',
  [string]$NodePath = ''
)

if (-not $NodePath) {
  $node = (Get-Command node -ErrorAction SilentlyContinue)?.Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
} else {
  $node = $NodePath
}
if (-not (Test-Path $node)) {
  Write-Error "node.exe غير موجود: $node"
  exit 1
}

$script = Join-Path $ProjectDir 'scripts\backup-now.mjs'
if (-not (Test-Path $script)) {
  Write-Error "backup-now.mjs غير موجود: $script"
  exit 1
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $ProjectDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited

try {
  Register-ScheduledTask -TaskName 'Amin-Lab Genie Daily Backup' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "✔ تم تسجيل المهمة 'Amin-Lab Genie Daily Backup' (يومياً $Time)."
  Write-Host "  node: $node"
  Write-Host "  script: $script"
  Write-Host "  working dir: $ProjectDir"
} catch {
  Write-Error "فشل تسجيل المهمة: $($_.Exception.Message)"
  exit 1
}
