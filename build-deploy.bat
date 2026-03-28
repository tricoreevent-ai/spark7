@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo Building SPARK AI deployment artifacts...
call "%~dp0build-separate-deploy.bat" %*
exit /b %errorlevel%
