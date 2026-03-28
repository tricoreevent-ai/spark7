@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ACTION=%~1"
set "API_PORT=%~2"
set "CLIENT_PORT=%~3"
set "SKIP_BUILD=0"

if "%API_PORT%"=="" set "API_PORT=3000"
if "%CLIENT_PORT%"=="" set "CLIENT_PORT=5173"
if /I "%~2"=="--skip-build" set "API_PORT=3000"
if /I "%~3"=="--skip-build" set "CLIENT_PORT=5173"
if /I "%~2"=="--skip-build" set "SKIP_BUILD=1"
if /I "%~3"=="--skip-build" set "SKIP_BUILD=1"
if /I "%~4"=="--skip-build" set "SKIP_BUILD=1"

if /I "%ACTION%"=="start" goto :start
if /I "%ACTION%"=="stop" goto :stop
if /I "%ACTION%"=="restart" goto :restart

echo Usage: %~nx0 ^<start^|stop^|restart^> [apiPort] [clientPort] [--skip-build]
echo Example: %~nx0 start 3000 5173
exit /b 1

:restart
call :stop
call :start
exit /b %errorlevel%

:start
echo Stopping listeners on ports %API_PORT% and %CLIENT_PORT%...
call :killPort %API_PORT%
call :killPort %CLIENT_PORT%

set "CORS_LIST=http://localhost:%CLIENT_PORT%,http://127.0.0.1:%CLIENT_PORT%"
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
  set "IP=%%I"
  set "IP=!IP: =!"
  if not "!IP!"=="" if /I not "!IP!"=="127.0.0.1" (
    set "CORS_LIST=!CORS_LIST!,http://!IP!:%CLIENT_PORT%"
  )
)

if "%SKIP_BUILD%"=="0" (
  call :cleanBuildArtifacts
  if errorlevel 1 exit /b 1
  call :buildClient
  if errorlevel 1 exit /b 1
) else (
  echo Skipping cleanup/build because --skip-build was provided.
)

echo Starting backend on port %API_PORT%...
echo Backend CORS origins: %CORS_LIST%
start "POS Server :%API_PORT%" cmd /k "cd /d ""%~dp0"" && set PORT=%API_PORT% && set SERVE_CLIENT=false && set CORS_ORIGIN=%CORS_LIST% && npm run dev:server"

echo Starting frontend on port %CLIENT_PORT% (LAN enabled)...
start "POS Client :%CLIENT_PORT%" cmd /k "cd /d ""%~dp0"" && set VITE_API_BASE_URL= && npm run dev:client -- --host 0.0.0.0 --port %CLIENT_PORT%"

echo Application launch triggered.
echo.
echo You can open from same PC: http://localhost:%CLIENT_PORT%
echo LAN URLs on this machine:
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
  set "IP=%%I"
  set "IP=!IP: =!"
  if not "!IP!"=="127.0.0.1" (
    echo   http://!IP!:%CLIENT_PORT%
  )
)
exit /b 0

:stop
echo Stopping listeners on ports %API_PORT% and %CLIENT_PORT%...
call :killPort %API_PORT%
call :killPort %CLIENT_PORT%
echo Stop complete.
exit /b 0

:killPort
set "TARGET_PORT=%~1"
set "FOUND=0"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo Stopping PID %%P on port %TARGET_PORT%...
  taskkill /F /PID %%P >nul 2>&1
)

if "!FOUND!"=="0" (
  echo No listener found on port %TARGET_PORT%.
)

exit /b 0

:cleanBuildArtifacts
echo Cleaning old client build output...
if exist "%~dp0dist\client" (
  rmdir /s /q "%~dp0dist\client"
  if errorlevel 1 (
    echo Failed to clean dist\client. Close apps using dist files and retry.
    exit /b 1
  )
)
exit /b 0

:buildClient
echo Building client with fresh output...
call npm run build:client
if errorlevel 1 (
  echo Client build failed. Start aborted.
  exit /b 1
)
exit /b 0
