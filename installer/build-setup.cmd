@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title بناء مثبت Amin-Lab -Pro🔬

set "VERSION=1.5.3"

echo === 1/7 فحص البيئة ===
call "%~dp0check-environment.cmd"
if errorlevel 1 exit /b 1

echo.
echo === 2/7 تثبيت التبعيات ===
pushd "%~dp0.."
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail_deps

echo.
echo === 3/7 فحص الأنواع (typecheck) ===
call npm run typecheck
if errorlevel 1 goto :fail_typecheck

echo.
echo === 4/7 الاختبارات (test) ===
call npm test
if errorlevel 1 goto :fail_tests

echo.
echo === 5/7 بناء الخادم (TypeScript) ===
call npm run build
if errorlevel 1 goto :fail_build
popd

echo.
echo === 6/7 تجهيز Node.js المضمّن والتبعيات ===
node "%~dp0..\scripts\stage-runtime.mjs"
if errorlevel 1 (
  echo [خطأ] فشل تجهيز runtime / vendor
  exit /b 1
)

echo.
echo === 7/7 إنشاء ملفات التثبيت ===
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
if not exist "%~dp0output\Amin-Lab-Genie-Setup-%VERSION%.exe" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Setup-%VERSION%.exe
  set "OK=0"
)
if not exist "%~dp0output\Amin-Lab-Genie-Sale-Setup-%VERSION%.exe" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Sale-Setup-%VERSION%.exe
  set "OK=0"
)

if "!OK!"=="0" exit /b 1

echo.
echo === توقيع Authenticode (اختياري) ===
set "PFX=%AMIN_SIGN_PFX%"
if not defined PFX set "PFX=%~dp0..\keys\code-signing.pfx"
if not exist "%PFX%" goto :skip_sign
set "SIGNTOOL=%AMIN_SIGNTOOL%"
if not defined SIGNTOOL for /f "delims=" %%i in ('where signtool.exe 2^>nul') do set "SIGNTOOL=%%i"
if not defined SIGNTOOL goto :no_signtool
for %%f in ("%~dp0output\*.exe") do (
  "%SIGNTOOL%" sign /fd SHA256 /f "%PFX%" /p "%AMIN_SIGN_PASSWORD%" /tr http://timestamp.digicert.com /td SHA256 "%%~ff"
  if errorlevel 1 goto :fail_sign
)
echo [OK] تم توقيع المثبتات.
goto :sign_done
:no_signtool
echo [تنبيه] وُجدت شهادة في keys\code-signing.pfx لكن signtool.exe غير مثبت — تخطّي التوقيع.
goto :sign_done
:skip_sign
echo [تنبيه] لا شهادة code signing (keys\code-signing.pfx) — المثبتات غير موقّعة.
:sign_done

echo.
echo ✅ تم إنشاء المثبتات:
dir /b "%~dp0output\*.exe"
echo.
echo للتأكد من أن التطبيق يعمل قبل التوزيع: installer\verify-install.cmd

exit /b 0

:fail_deps
echo [خطأ] فشل تثبيت التبعيات
popd
exit /b 1

:fail_typecheck
echo [خطأ] فشل فحص الأنواع — أصلح الأخطاء قبل بناء أي مثبت
popd
exit /b 1

:fail_tests
echo [خطأ] فشلت الاختبارات — لا يُبنى مثبت من كود مكسور
popd
exit /b 1

:fail_build
echo [خطأ] فشل بناء TypeScript
popd
exit /b 1

:fail_main
echo [خطأ] فشل إنشاء ملف التثبيت (Amin-Lab.iss)
exit /b 1

:fail_sale
echo [خطأ] فشل إنشاء ملف التثبيت (Amin-Lab-Sale.iss)
exit /b 1

:fail_sign
echo [خطأ] فشل توقيع المثبتات — تحقق من الشهادة وكلمة المرور
exit /b 1
