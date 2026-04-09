@echo off
REM =====================================================
REM Quick Commit Script for SPARK AI
REM Usage: git-quick-commit.bat "your commit message"
REM =====================================================

setlocal enabledelayedexpansion

color 0E

if "%~1"=="" (
    echo.
    echo ==========================================
    echo   SPARK AI - Quick Commit
    echo ==========================================
    echo.
    echo Usage:
    echo   git-quick-commit.bat "commit message"
    echo.
    echo Example:
    echo   git-quick-commit.bat "Update: Add new features"
    echo.
    echo Or press Enter to use interactive mode
    echo.
    set /p commit_msg="Enter commit message: "
) else (
    set "commit_msg=%~1"
)

if "!commit_msg!"=="" (
    echo [ERROR] No commit message provided
    exit /b 1
)

REM Get timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)

REM Check git
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git not found
    exit /b 1
)

REM Check repo
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not a git repository
    exit /b 1
)

echo.
echo [INFO] Repository: %cd%
echo [INFO] Timestamp: %mydate% %mytime%
echo.

REM Show changes
echo [CHANGES] Modified files:
git status --short
echo.

REM Stage and commit
echo [ACTION] Committing: !commit_msg!
git add -A
git commit -m "!commit_msg! (%mydate% %mytime%)"

if errorlevel 1 (
    echo [ERROR] Commit failed
    exit /b 1
)

echo [SUCCESS] Committed successfully
echo.

REM Get branch
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"

REM Auto push
echo [ACTION] Pushing to origin/!branch!...
git push origin !branch!

if errorlevel 1 (
    echo [WARNING] Push failed. Use commit-and-push.bat for troubleshooting
    exit /b 1
)

echo [SUCCESS] Pushed successfully
echo.
git log -1 --oneline
echo.

exit /b 0
