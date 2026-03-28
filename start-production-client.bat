@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5173"
set "ROOT_DIR=%~dp0"
set "CLIENT_DIR=%ROOT_DIR%dist\client"

pushd "%ROOT_DIR%" >nul 2>&1
if errorlevel 1 (
  echo Could not open project directory "%ROOT_DIR%".
  exit /b 1
)

echo Building latest client...
call npm run build:client
if errorlevel 1 (
  popd >nul 2>&1
  echo Client build failed.
  exit /b 1
)

if not exist "%CLIENT_DIR%\index.html" (
  popd >nul 2>&1
  echo Could not find "%CLIENT_DIR%\index.html" after build.
  exit /b 1
)

echo Checking port %PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    echo Stopping process %%P on port %PORT%...
    taskkill /F /PID %%P >nul 2>&1
  )
)

pushd "%CLIENT_DIR%" >nul 2>&1
if errorlevel 1 (
  popd >nul 2>&1
  echo Could not open client directory "%CLIENT_DIR%".
  exit /b 1
)

echo Starting client from "%CD%" on http://localhost:%PORT%
npx --yes serve -s . -l %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
popd >nul 2>&1
popd >nul 2>&1
exit /b %EXIT_CODE%
