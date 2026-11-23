@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
node "%~dp0server.cjs" --open
if errorlevel 1 pause
