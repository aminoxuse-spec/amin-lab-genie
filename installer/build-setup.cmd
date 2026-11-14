@echo off
chcp 65001 >nul
setlocal
title بناء مثبت Amin-Lab -cem🔬

echo === 1/4 فحص البيئة ===
call "%~dp0check-environment.cmd"
if errorlevel 1 exit /b 1

echo.
echo === 2/4 تثبيت التبعيات ===
pushd "%~dp0.."
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [خطأ] فشل تثبيت التبعيات
  popd
  exit /b 1
)

echo.
echo === 3/4 بناء الخادم (TypeScript) ===
call npm run build
if errorlevel 1 (
  echo [خطأ] فشل بناء TypeScript
  popd
  exit /b 1
)
popd

echo.
echo === 4/4 إنشاء ملف التثبيت ===
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo [خطأ] لم يتم العثور على Inno Setup 6.
  echo ثبته من https://jrsoftware.org/isdl.php ثم أعد المحاولة.
  exit /b 1
)

"%ISCC%" "%~dp0Amin-Lab.iss"
if errorlevel 1 (
  echo [خطأ] فشل إنشاء ملف التثبيت
  exit /b 1
)

echo.
echo ✅ تم إنشاء المثبت في: installer\output\
dir /b "%~dp0output\*.exe"
endlocal
