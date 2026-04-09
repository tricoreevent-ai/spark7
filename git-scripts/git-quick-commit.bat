@echo off
setlocal enabledelayedexpansion
color 0A

echo.
echo ╔═════════════════════════════════════════════════════════════╗
echo ║              GIT QUICK COMMIT                               ║
echo ║           One-Liner Commit with Auto Push                  ║
echo ╚═════════════════════════════════════════════════════════════╝
echo.

REM ========== CHECK GIT ==========
git --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERROR: Git not installed
    pause
    exit /b 1
)

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ERROR: Not a git repository
    pause
    exit /b 1
)

REM ========== GET MESSAGE ==========
if "%~1"=="" (
    set /p commit_msg="Enter commit message: "
) else (
    set commit_msg=%~1
)

if "!commit_msg!"=="" (
    color 0C
    echo ERROR: Empty message
    pause
    exit /b 1
)

REM ========== GET TIMESTAMP ==========
for /f "tokens=*" %%a in ('powershell Get-Date -Format "yyyy-MM-dd HH:mm"') do set mydate=%%a

REM ========== EXECUTE ==========
echo.
echo Committing: !commit_msg! (^!mydate!^)
echo.

git add -A
git commit -m "!commit_msg! - !mydate!"
if errorlevel 1 (
    color 0C
    echo ERROR: Commit failed
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"

echo Pushing to !branch!...
git push origin !branch!
if errorlevel 1 (
    color 0C
    echo ERROR: Push failed
    pause
    exit /b 1
)

color 0A
echo ✓ Complete!
git log -1 --oneline
