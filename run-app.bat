@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=start"

call "%~dp0app-control.bat" %ACTION% %~2 %~3 %~4
exit /b %errorlevel%
