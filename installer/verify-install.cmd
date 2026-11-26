@echo off
title Amin-Lab -Pro - install check
setlocal
cd /d "%~dp0.."

set "PORT=3100"
set "WORK=%TEMP%\amin-lab-verify"
if exist "%WORK%" rmdir /s /q "%WORK%" >nul 2>nul
mkdir "%WORK%" >nul 2>nul

echo ================================================
echo    Installation check - Amin-Lab -Pro
echo ================================================
echo.

echo [1/4] Checking the bundled Node.js runtime
set "NODE_EXE=%CD%\runtime\node.exe"
if not exist "%NODE_EXE%" (
  echo   [WARN] runtime\node.exe not found - falling back to the system Node.js
  set "NODE_EXE=node"
  where node >nul 2>nul
  if errorlevel 1 (
    echo   [FAIL] No bundled runtime and no Node.js installed.
    goto :fail
  )
)
for /f "delims=" %%v in ('"%NODE_EXE%" -v') do echo   [OK] Node.js %%v  ^(%NODE_EXE%^)
echo.

echo [2/4] Checking application files
if not exist "server\dist\index.js" (
  echo   [FAIL] server\dist\index.js is missing - the package is incomplete.
  goto :fail
)
if not exist "client\src\index.html" (
  echo   [FAIL] client\src\index.html is missing - the package is incomplete.
  goto :fail
)
if not exist "client\src\actions.js" (
  echo   [FAIL] client\src\actions.js is missing - the package is incomplete.
  goto :fail
)
echo   [OK] App files and server entry point found: server\dist\index.js
echo.

echo [3/4] Checking dependencies
if not exist "node_modules" (
  echo   [FAIL] node_modules is missing - the package is incomplete. Reinstall from Setup.exe.
  goto :fail
)
echo   [OK] Dependencies are bundled (no install or internet needed)
echo.

echo [4/4] Starting the server and checking pages on port %PORT%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Continue'; $env:AMIN_NODE='%NODE_EXE%'; $env:PORT='%PORT%'; $env:HOST='127.0.0.1'; $env:DATA_DIR='%WORK%\data'; $out='%WORK%\server.log'; $err='%WORK%\server.err'; $proc=Start-Process -FilePath $env:AMIN_NODE -ArgumentList 'server/dist/index.js' -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err; $ready=$false; foreach($i in 1..20){ Start-Sleep -Milliseconds 700; try { $r=Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:%PORT%/api/health') -TimeoutSec 3; if($r.StatusCode -eq 200){ $ready=$true; break } } catch {} }; if(-not $ready){ Write-Host '  [FAIL] The server did not answer on port %PORT%'; if(Test-Path $out){ Write-Host '  --- server log ---'; Get-Content $out -Tail 15 }; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; exit 2 }; Write-Host '  [OK] Server is running: /api/health = 200'; $bad=0; foreach($path in @('index.html','dashboard.html','style.css','app.js','actions.js','sw.js')){ try { $r=Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:%PORT%/'+$path) -TimeoutSec 5; if($r.StatusCode -ne 200){ Write-Host ('  [FAIL] /'+$path+' = '+$r.StatusCode); $bad++ } } catch { Write-Host ('  [FAIL] /'+$path+' is not reachable'); $bad++ } }; if($bad -eq 0){ Write-Host '  [OK] All main pages and files return 200' }; if(Test-Path ('%WORK%\data\first-run-credentials.txt')){ Write-Host '  [OK] First-run credentials were created in the data folder' } else { Write-Host '  [WARN] first-run-credentials.txt was not found' }; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; if($bad -gt 0){ exit 3 }"

if errorlevel 1 (
  echo   [FAIL] The live run test failed.
  echo   See the log: %WORK%\server.log
  goto :fail
)

echo.
echo ================================================
echo    Result: the installation works
echo ================================================
rmdir /s /q "%WORK%" >nul 2>nul
echo.
pause
exit /b 0

:fail
echo.
echo ================================================
echo    Result: verification failed - read the messages above
echo ================================================
echo.
pause
exit /b 1
