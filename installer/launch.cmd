@echo off
chcp 65001 >nul
title Amin-Lab -Pro
setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem المسار المضمّن قد يحتوي مسافة (Program Files) — نتحقق منه بـ if exist لا بـ where
set "NODE_EXE=%~dp0runtime\node.exe"
if not exist "!NODE_EXE!" (
  set "NODE_EXE=node"
  where node >nul 2>nul
  if errorlevel 1 (
    echo [خطأ] لم يُعثر على Node.js ^(لا المضمّن ولا المثبت على النظام^).
    pause
    exit /b 1
  )
)
for /f "delims=" %%v in ('"!NODE_EXE!" -v') do set "NODE_VERSION=%%v"
echo Node.js !NODE_VERSION! (!NODE_EXE!)

if not exist "node_modules" (
  echo [تحذير] مجلد التبعيات node_modules مفقود — المثبت يضمّنه عادةً.
  echo محاولة إعادة التثبيت ^(يتطلب اتصالاً بالإنترنت^)...
  if exist "%~dp0runtime\npm.cmd" (
    call "%~dp0runtime\npm.cmd" install --omit=dev --no-audit --no-fund
  ) else (
    call npm install --omit=dev --no-audit --no-fund
  )
  if errorlevel 1 (
    echo.
    echo [خطأ] فشل تثبيت التبعيات. أعد تثبيت التطبيق من ملف الإعداد.
    pause
    exit /b 1
  )
)

if not exist "server\dist\index.js" (
  echo [خطأ] لم يُعثر على server\dist\index.js — الحزمة غير مكتملة.
  echo أعد تثبيت التطبيق من ملف الإعداد ^(Setup.exe^).
  pause
  exit /b 1
)

echo.
echo بدء Amin-Lab -Pro في نافذة مستقلة ...
start "" powershell -NoProfile -WindowStyle Hidden -Command "$ready=$false; for($i=0;$i -lt 60;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){ $ready=$true; break } } catch {}; Start-Sleep -Milliseconds 500 }; $w=@('--app=http://localhost:3000','--window-size=1340,900'); $e=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'; $c=Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'; if(Test-Path $e){ Start-Process $e -ArgumentList $w } elseif(Test-Path $c){ Start-Process $c -ArgumentList $w } else { Start-Process 'http://localhost:3000' }"

"!NODE_EXE!" "server\dist\index.js"

echo.
echo توقف الخادم. لبدء تشغيله مجدداً، استخدم اختصار Amin-Lab.
pause