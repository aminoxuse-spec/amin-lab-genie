@echo off
chcp 65001 >nul
title Amin-Lab -Pro🔬
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبت على هذا الجهاز.
  echo حمّل النسخة 22 أو أحدث من https://nodejs.org ثم أعد المحاولة.
  pause
  exit /b 1
)

echo بدء Amin-Lab -Pro🔬 على http://localhost:3000 ...
start "" http://localhost:3000
node server\dist\index.js
pause
