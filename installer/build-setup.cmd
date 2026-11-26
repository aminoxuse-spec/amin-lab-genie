@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title بناء مثبت Amin-Lab -Pro🔬

REM مصدر وحيد لرقم الإصدار: package.json (لا يُكرَّر في هذا الملف ولا في .iss)
pushd "%~dp0.."
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "VERSION=%%v"
popd
if not defined VERSION (
  echo [خطأ] تعذّر قراءة الإصدار من package.json
  exit /b 1
)
echo الإصدار: %VERSION%

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
if not exist "%ISCC%" for /f "delims=" %%i in ('where ISCC.exe 2^>nul') do (
  set "ISCC=%%i"
  goto :have_iscc
)
:have_iscc
if not exist "%ISCC%" (
  echo [خطأ] لم يتم العثور على Inno Setup 6.
  echo ثبته من https://jrsoftware.org/isdl.php ثم أعد المحاولة.
  exit /b 1
)
echo استخدام: %ISCC%

"%ISCC%" /DMyAppVersion=%VERSION% "%~dp0Amin-Lab.iss"
if errorlevel 1 goto :fail_main

"%ISCC%" /DMyAppVersion=%VERSION% "%~dp0Amin-Lab-Sale.iss"
if errorlevel 1 goto :fail_sale

set "MAIN_EXE=%~dp0output\Amin-Lab-Genie-Setup-%VERSION%.exe"
set "SALE_EXE=%~dp0output\Amin-Lab-Genie-Sale-Setup-%VERSION%.exe"

set "OK=1"
if not exist "%MAIN_EXE%" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Setup-%VERSION%.exe
  set "OK=0"
)
if not exist "%SALE_EXE%" (
  echo [خطأ] لم يُنتج Inno Setup ملف Amin-Lab-Genie-Sale-Setup-%VERSION%.exe
  set "OK=0"
)
if "!OK!"=="0" exit /b 1

echo.
echo === توقيع Authenticode ===
set "PFX=%AMIN_SIGN_PFX%"
if not defined PFX set "PFX=%~dp0..\keys\code-signing.pfx"
if exist "%PFX%" goto :sign_have_pfx
if defined AMIN_SIGN_PFX (
  echo [خطأ] AMIN_SIGN_PFX يشير إلى ملف غير موجود: %AMIN_SIGN_PFX%
  goto :fail_sign
)
if "%AMIN_REQUIRE_SIGN%"=="1" (
  echo [خطأ] AMIN_REQUIRE_SIGN=1 لكن لا شهادة في keys\code-signing.pfx
  goto :fail_sign
)
echo [تنبيه] لا شهادة code signing ^(keys\code-signing.pfx^) — المثبتات غير موقّعة.
goto :sign_done

:sign_have_pfx
set "SIGNTOOL=%AMIN_SIGNTOOL%"
if defined SIGNTOOL goto :sign_have_signtool
for /f "delims=" %%i in ('where signtool.exe 2^>nul') do (
  set "SIGNTOOL=%%i"
  goto :sign_have_signtool
)
:sign_have_signtool
if not defined SIGNTOOL (
  if "%AMIN_REQUIRE_SIGN%"=="1" (
    echo [خطأ] لا signtool.exe — ثبّت Windows SDK أو اضبط AMIN_SIGNTOOL
    goto :fail_sign
  )
  echo [تنبيه] وُجدت شهادة لكن signtool.exe غير مثبت — تخطّي التوقيع.
  goto :sign_done
)

REM كلمة المرور من AMIN_SIGN_PASSWORD أو أول سطر في AMIN_SIGN_PASSWORD_FILE
set "SIGN_PASS=%AMIN_SIGN_PASSWORD%"
if defined SIGN_PASS goto :sign_have_pass
if not defined AMIN_SIGN_PASSWORD_FILE goto :sign_no_pass
if not exist "%AMIN_SIGN_PASSWORD_FILE%" (
  echo [خطأ] ملف كلمة مرور الشهادة غير موجود: %AMIN_SIGN_PASSWORD_FILE%
  goto :fail_sign
)
for /f "usebackq delims=" %%p in ("%AMIN_SIGN_PASSWORD_FILE%") do (
  set "SIGN_PASS=%%p"
  goto :sign_have_pass
)
goto :sign_no_pass

:sign_no_pass
echo [خطأ] لا كلمة مرور للشهادة — اضبط AMIN_SIGN_PASSWORD أو AMIN_SIGN_PASSWORD_FILE.
echo بدونها يسأل signtool تفاعلياً فيتوقف البناء بلا نهاية.
goto :fail_sign

:sign_have_pass
for %%f in ("%MAIN_EXE%" "%SALE_EXE%") do (
  echo [..] توقيع %%~nxf
  "%SIGNTOOL%" sign /fd SHA256 /f "%PFX%" /p "%SIGN_PASS%" /tr http://timestamp.digicert.com /td SHA256 "%%~ff"
  if errorlevel 1 goto :fail_sign
  "%SIGNTOOL%" verify /pa /q "%%~ff"
  if errorlevel 1 (
    echo [خطأ] فشل التحقق من التوقيع: %%~nxf
    goto :fail_sign
  )
)
set "SIGN_PASS="
echo [OK] تم توقيع المثبتين والتحقق من توقيعهما.
:sign_done

echo.
echo ✅ تم إنشاء المثبتات (الإصدار %VERSION%):
dir /b "%~dp0output\*%VERSION%*.exe"
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
echo [خطأ] فشل توقيع المثبتات — تحقق من الشهادة وكلمة المرور و signtool
exit /b 1
