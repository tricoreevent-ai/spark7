@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "OUTPUT_ROOT=%~1"
if "%OUTPUT_ROOT%"=="" set "OUTPUT_ROOT=production-ready"
set "BACKEND_API_BASE_URL=%~2"
if "%BACKEND_API_BASE_URL%"=="" set "BACKEND_API_BASE_URL=https://api.example.com"
set "FRONTEND_ORIGIN=%~3"
if "%FRONTEND_ORIGIN%"=="" set "FRONTEND_ORIGIN=https://app.example.com"

set "ROOT=%~dp0"
set "DIST_DIR=%ROOT%dist"
set "SERVER_OUT=%ROOT%%OUTPUT_ROOT%\server"
set "CLIENT_OUT=%ROOT%%OUTPUT_ROOT%\client"
set "SERVER_ZIP=%ROOT%%OUTPUT_ROOT%\server-deploy.zip"
set "CLIENT_ZIP=%ROOT%%OUTPUT_ROOT%\client-deploy.zip"

echo Creating separate deploy artifacts in "%OUTPUT_ROOT%"...
echo Backend API URL for client package: "%BACKEND_API_BASE_URL%"
echo Frontend origin for server CORS: "%FRONTEND_ORIGIN%"

if exist "%ROOT%deploy-appwrite" rmdir /s /q "%ROOT%deploy-appwrite" >nul 2>&1
if exist "%ROOT%deploy-separate" rmdir /s /q "%ROOT%deploy-separate" >nul 2>&1

if exist "%ROOT%%OUTPUT_ROOT%" (
  rmdir /s /q "%ROOT%%OUTPUT_ROOT%"
  if errorlevel 1 (
    echo Failed to clean old output folder "%OUTPUT_ROOT%".
    exit /b 1
  )
)

echo Cleaning previous server build...
if exist "%DIST_DIR%\server" (
  rmdir /s /q "%DIST_DIR%\server"
  if errorlevel 1 (
    echo Failed to clean dist\server.
    exit /b 1
  )
)
if exist "%DIST_DIR%\shared" (
  rmdir /s /q "%DIST_DIR%\shared"
  if errorlevel 1 (
    echo Failed to clean dist\shared.
    exit /b 1
  )
)

echo Building server...
call npm run build:server
if errorlevel 1 (
  if exist "%DIST_DIR%\server\app.js" (
    echo Server build reported TypeScript errors, but output files were generated. Continuing...
  ) else (
    echo Server build failed and no dist\server\app.js was generated.
    exit /b 1
  )
)

echo Cleaning previous client build...
if exist "%DIST_DIR%\client" (
  rmdir /s /q "%DIST_DIR%\client"
  if errorlevel 1 (
    echo Warning: failed to fully clean dist\client. Continuing with fresh build...
  )
)

echo Building client...
call npm run build:client
if errorlevel 1 (
  echo Client build failed.
  exit /b 1
)

if not exist "%DIST_DIR%\server" (
  echo Missing "%DIST_DIR%\server".
  exit /b 1
)
if not exist "%DIST_DIR%\shared" (
  echo Missing "%DIST_DIR%\shared".
  exit /b 1
)
if not exist "%DIST_DIR%\client" (
  echo Missing "%DIST_DIR%\client".
  exit /b 1
)

mkdir "%SERVER_OUT%\dist\server" >nul 2>&1
mkdir "%SERVER_OUT%\dist\shared" >nul 2>&1
mkdir "%CLIENT_OUT%" >nul 2>&1

robocopy "%DIST_DIR%\server" "%SERVER_OUT%\dist\server" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Failed to copy dist\server.
  exit /b 1
)
robocopy "%DIST_DIR%\shared" "%SERVER_OUT%\dist\shared" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Failed to copy dist\shared.
  exit /b 1
)
robocopy "%DIST_DIR%\client" "%CLIENT_OUT%" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo Failed to copy dist\client.
  exit /b 1
)

> "%SERVER_OUT%\server.js" echo require('./dist/server/app.js');

(
  echo {
  echo   "name": "sarva-server",
  echo   "version": "1.0.0",
  echo   "private": true,
  echo   "type": "commonjs",
  echo   "main": "server.js",
  echo   "scripts": {
  echo     "start": "node server.js"
  echo   },
  echo   "engines": {
  echo     "node": ">=20.19.0"
  echo   },
  echo   "dependencies": {
  echo     "bcryptjs": "^3.0.3",
  echo     "bson": "^6.10.4",
  echo     "cors": "^2.8.5",
  echo     "dotenv": "^17.2.3",
  echo     "express": "^5.2.1",
  echo     "jsonwebtoken": "^9.0.3",
  echo     "mongoose": "^8.19.1",
  echo     "razorpay": "^2.9.6",
  echo     "tsconfig-paths": "^4.2.0"
  echo   }
  echo }
) > "%SERVER_OUT%\package.json"

echo Syncing environment templates...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%ROOT%scripts\sync-deploy-env.ps1' '%ROOT%' '%SERVER_OUT%\.env.example' '%CLIENT_OUT%\.env.client.example' '%FRONTEND_ORIGIN%' '%BACKEND_API_BASE_URL%'"
if errorlevel 1 (
  echo Failed to sync deploy environment templates.
  exit /b 1
)

(
  echo @echo off
  echo setlocal EnableExtensions EnableDelayedExpansion
  echo.
  echo set "PORT=%%~1"
  echo if "%%PORT%%"=="" set "PORT=5173"
  echo set "CLIENT_DIR=%%~dp0"
  echo.
  echo if not exist "%%CLIENT_DIR%%index.html" ^(
  echo   echo Could not find index.html in "%%CLIENT_DIR%%"
  echo   exit /b 1
  echo ^)
  echo.
  echo echo Checking port %%PORT%%...
  echo for /f "tokens=5" %%%%P in ^('netstat -ano ^^^| findstr /R /C:":%%PORT%% .*LISTENING"'^) do ^(
  echo   if not "%%%%P"=="0" ^(
  echo     echo Stopping process %%%%P on port %%PORT%%...
  echo     taskkill /F /PID %%%%P ^>nul 2^>^&1
  echo   ^)
  echo ^)
  echo.
  echo pushd "%%CLIENT_DIR%%" ^>nul 2^>^&1
  echo if errorlevel 1 ^(
  echo   echo Could not open client directory "%%CLIENT_DIR%%".
  echo   exit /b 1
  echo ^)
  echo.
  echo echo Starting client from "%%CD%%" on http://localhost:%%PORT%%
  echo npx --yes serve -s . -l %%PORT%%
  echo set "EXIT_CODE=%%ERRORLEVEL%%"
  echo popd ^>nul 2^>^&1
  echo exit /b %%EXIT_CODE%%
) > "%CLIENT_OUT%\start-client.bat"

(
  echo Server deploy package
  echo.
  echo 1^) Copy contents to your server host.
  echo 2^) Create .env from .env.example.
  echo 3^) Keep SERVE_CLIENT=false for separate deployment.
  echo 4^) Set at least: DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN.
  echo 5^) Run: npm install
  echo 6^) Run: npm start
) > "%SERVER_OUT%\DEPLOY_SERVER.txt"

(
  echo Client deploy package
  echo.
  echo 1^) Create .env.client from .env.client.example.
  echo 2^) Confirm VITE_API_BASE_URL points to backend API host.
  echo 3^) To run locally: start-client.bat ^[port^]
  echo 4^) Upload all files from this folder to static hosting.
  echo 5^) Configure SPA fallback to /index.html on your host.
) > "%CLIENT_OUT%\DEPLOY_CLIENT.txt"

if exist "%SERVER_OUT%\dist\client" (
  echo Isolation check failed: server package contains dist\client.
  exit /b 1
)
if exist "%CLIENT_OUT%\dist\server" (
  echo Isolation check failed: client package contains dist\server.
  exit /b 1
)
if exist "%CLIENT_OUT%\server.js" (
  echo Isolation check failed: client package contains server entry file.
  exit /b 1
)
if exist "%SERVER_OUT%\index.html" (
  echo Isolation check failed: server package contains frontend index.html at root.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%SERVER_OUT%\\*' -DestinationPath '%SERVER_ZIP%' -Force"
if errorlevel 1 (
  echo Failed to create server zip.
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%CLIENT_OUT%\\*' -DestinationPath '%CLIENT_ZIP%' -Force"
if errorlevel 1 (
  echo Failed to create client zip.
  exit /b 1
)

echo.
echo Done.
echo Server package: "%SERVER_OUT%"
echo Client package: "%CLIENT_OUT%"
echo Server zip: "%SERVER_ZIP%"
echo Client zip: "%CLIENT_ZIP%"
echo.
echo Upload "server-deploy.zip" to backend host.
echo Upload "client-deploy.zip" to static frontend host.
exit /b 0
