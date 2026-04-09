@echo off
setlocal enabledelayedexpansion
color 0B

:menu
cls
echo.
echo ╔═════════════════════════════════════════════════════════════╗
echo ║           GIT SETUP & DIAGNOSTICS UTILITY                  ║
echo ║              Check and Configure Repository                ║
echo ╚═════════════════════════════════════════════════════════════╝
echo.
echo   1. Check current status
echo   2. Setup/configure remote URL
echo   3. View commit history
echo   4. Pull latest changes
echo   5. Check branches
echo   6. Full system diagnostic
echo   7. Exit
echo.
set /p choice="Enter number (1-7): "
echo.

if "!choice!"=="7" goto end
if "!choice!"=="1" goto check_status
if "!choice!"=="2" goto setup_remote
if "!choice!"=="3" goto view_history
if "!choice!"=="4" goto pull_changes
if "!choice!"=="5" goto check_branches
if "!choice!"=="6" goto full_diagnostic
goto menu

:check_status
echo ═══ CURRENT STATUS ═══
echo.
git --version
echo.
git status
echo.
pause
goto menu

:setup_remote
echo ═══ CONFIGURE REMOTE ═══
echo.
echo Current remote:
git remote -v
echo.
set /p setup="Set up remote to https://github.com/tricoreevent-ai/spark7.git? (Y/N): "
if /i "!setup!"=="Y" (
    git remote remove origin 2>nul
    git remote add origin https://github.com/tricoreevent-ai/spark7.git
    echo ✓ Remote configured
    git remote -v
)
echo.
pause
goto menu

:view_history
echo ═══ COMMIT HISTORY (Last 10) ═══
echo.
git log --oneline -10
echo.
pause
goto menu

:pull_changes
echo ═══ PULLING LATEST ═══
echo.
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"
echo Current branch: !branch!
echo Pulling from remote...
echo.
git pull origin !branch!
echo.
pause
goto menu

:check_branches
echo ═══ LOCAL BRANCHES ═══
echo.
git branch
echo.
echo ═══ REMOTE BRANCHES ═══
echo.
git branch -r
echo.
pause
goto menu

:full_diagnostic
echo ═══ FULL SYSTEM DIAGNOSTIC ═══
echo.
echo [1/6] Checking Git installation...
git --version 2>nul
if errorlevel 1 (
    color 0C
    echo ✗ Git NOT installed
    goto diagend
) else (
    color 0A
    echo ✓ Git installed
)
echo.

echo [2/6] Checking user configuration...
git config --global user.name >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ✗ Git user not configured
    goto diagend
) else (
    color 0A
    echo ✓ User: %username%
    git config --global user.name
    git config --global user.email
)
echo.

echo [3/6] Checking repository...
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ✗ Not a git repository
    goto diagend
) else (
    color 0A
    echo ✓ Repository found
    git remote -v
)
echo.

echo [4/6] Checking remote connection...
git ls-remote origin >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ✗ Cannot connect to remote
    goto diagend
) else (
    color 0A
    echo ✓ Remote accessible
)
echo.

echo [5/6] Checking repository status...
git status --short
echo ✓ Status checked
echo.

echo [6/6] Checking GitHub connectivity...
ping -n 1 github.com >nul 2>&1
if errorlevel 1 (
    color 0C
    echo ✗ No internet connection
) else (
    color 0A
    echo ✓ GitHub reachable
)
echo.

:diagend
color 0A
echo ═══ DIAGNOSTIC COMPLETE ═══
echo.
pause
goto menu

:end
color 07
echo Goodbye!
echo.
