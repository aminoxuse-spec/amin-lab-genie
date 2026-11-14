@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title فحص بيئة Amin-Lab -Pro🔬

set "FAILED=0"

echo --- Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [✗] Node.js غير مثبت. ثبّت الإصدار 22 أو أحدث.
  set "FAILED=1"
) else (
  for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
  echo [✓] Node.js !NODE_VERSION!
)

echo --- npm ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [✗] npm غير متوفر
  set "FAILED=1"
) else (
  for /f "delims=" %%v in ('npm -v') do set "NPM_VERSION=%%v"
  echo [✓] npm !NPM_VERSION!
)

echo --- Inno Setup 6 ---
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if exist "%ISCC%" (
  echo [✓] !ISCC!
) else (
  echo [ ] Inno Setup 6 غير مثبت — مطلوب فقط لبناء ملف Setup.exe
)

echo --- المنفذ 3000 ---
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [✓] المنفذ 3000 متاح
) else (
  echo [!] المنفذ 3000 مستعمل حالياً — أغلق التطبيق الذي يستخدمه
)

if "!FAILED!"=="1" (
  echo.
  echo ✗ البيئة غير مكتملة.
  exit /b 1
)

echo.
echo ✅ البيئة جاهزة لبناء وتشغيل Amin-Lab -Pro🔬.
exit /b 0
