@echo off
setlocal enabledelayedexpansion
color 0A

echo.
echo ╔═════════════════════════════════════════════════════════════╗
echo ║                   GIT COMMIT & PUSH                         ║
echo ║              Standard Daily Workflow Script                 ║
echo ╚═════════════════════════════════════════════════════════════╝
echo.

REM ========== CHECK GIT INSTALLATION ==========
git --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERROR: Git is not installed or not in PATH
    echo.
    echo Solution: Download from https://git-scm.com/download/win
    echo Then restart your terminal and try again.
    pause
    exit /b 1
)

REM ========== CHECK REPOSITORY ==========
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERROR: This is not a git repository
    echo.
    echo Solution: 
    echo 1. Make sure you're in: c:\Works\SPARK AI\
    echo 2. Or run: git init
    pause
    exit /b 1
)

REM ========== SHOW STATUS ==========
echo [STEP 1 of 5] Checking status...
echo.
git status --short
echo.

REM ========== GET COMMIT MESSAGE ==========
echo [STEP 2 of 5] Commit message
echo.
set /p commit_msg="Enter commit message (or press Enter for auto-generated): "
echo.

REM ========== AUTO-GENERATE IF EMPTY ==========
if "!commit_msg!"=="" (
    for /f "tokens=*" %%a in ('powershell Get-Date -Format "yyyy-MM-dd HH:mm"') do set mydate=%%a
    set commit_msg=Update - !mydate!
    echo Auto-generated: !commit_msg!
    echo.
)

REM ========== STAGE FILES ==========
echo [STEP 3 of 5] Staging all files...
git add -A
if errorlevel 1 (
    color 0C
    echo ERROR: Failed to stage files
    pause
    exit /b 1
)
echo ✓ Files staged
echo.

REM ========== CREATE COMMIT ==========
echo [STEP 4 of 5] Creating commit...
git commit -m "!commit_msg!"
if errorlevel 1 (
    color 0C
    echo ERROR: Failed to create commit
    pause
    exit /b 1
)
echo ✓ Commit created
echo.

REM ========== DETECT BRANCH ==========
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"

REM ========== PUSH TO REMOTE ==========
echo [STEP 5 of 5] Pushing to remote...
git push origin !branch!
if errorlevel 1 (
    color 0C
    echo ERROR: Push failed
    echo Trying fallback configuration...
    git remote set-url origin https://github.com/tricoreevent-ai/spark7.git
    git push origin !branch!
    if errorlevel 1 (
        echo FAILED: Could not push. Check GitHub credentials.
        pause
        exit /b 1
    )
)
echo ✓ Pushed to remote
echo.

REM ========== SHOW RESULT ==========
color 0A
echo ╔═════════════════════════════════════════════════════════════╗
echo ║                    SUCCESS!                                 ║
echo ╚═════════════════════════════════════════════════════════════╝
echo.
echo Latest commit:
git log -1 --oneline
echo.
echo Branch: !branch!
echo Repository: https://github.com/tricoreevent-ai/spark7
echo.
pause
