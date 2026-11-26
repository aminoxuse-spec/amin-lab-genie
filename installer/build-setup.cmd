@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title بناء مثبت Amin-Lab -Pro🔬

echo === 1/5 فحص البيئة ===
call "%~dp0check-environment.cmd"
if errorlevel 1 exit /b 1

echo.
echo === 2/5 تثبيت التبعيات ===
pushd "%~dp0.."
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [خطأ] فشل تثبيت التبعيات
  popd
  exit /b 1
)

echo.
echo === 3/5 بناء الخادم (TypeScript) ===
call npm run build
if errorlevel 1 (
  echo [خطأ] فشل بناء TypeScript
  popd
  exit /b 1
)
popd

echo.
echo === 4/5 تجهيز Node.js المضمّن والتبعيات ===
node "%~dp0..\scripts\stage-runtime.mjs"
if errorlevel 1 (
  echo [خطأ] فشل تجهيز runtime / vendor
  exit /b 1
)

echo.
echo === 5/5 إنشاء ملفات التثبيت ===
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" for /f "delims=" %%i in ('where ISCC.exe 2^>nul') do set "ISCC=%%i"
if not exist "%ISCC%" (
  echo [خطأ] لم يتم العثور على Inno Setup 6.
  echo ثبته من https://jrsoftware.org/isdl.php ثم أعد المحاولة.
  exit /b 1
)
echo استخدام: %ISCC%

"%ISCC%" "%~dp0Amin-Lab.iss"
if errorlevel 1 goto :fail_main

"%ISCC%" "%~dp0Amin-Lab-Sale.iss"
if errorlevel 1 goto :fail_sale

set "OK=1"
if not exist "%~dp0output\Amin-Lab-Genie-Setup-1.5.2.exe" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Setup-1.5.2.exe
  set "OK=0"
)
if not exist "%~dp0output\Amin-Lab-Genie-Sale-Setup-1.5.2.exe" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Sale-Setup-1.5.2.exe
  set "OK=0"
)

if "!OK!"=="0" exit /b 1

echo.
echo ✅ تم إنشاء المثبتات:
dir /b "%~dp0output\*.exe"
echo.
echo للتأكد من أن التطبيق يعمل قبل التوزيع: installer\verify-install.cmd

exit /b 0

:fail_main
echo [خطأ] فشل إنشاء ملف التثبيت (Amin-Lab.iss)
exit /b 1

:fail_sale
echo [خطأ] فشل إنشاء ملف التثبيت (Amin-Lab-Sale.iss)
exit /b 1
