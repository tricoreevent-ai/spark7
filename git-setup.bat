@echo off
REM =====================================================
REM Git Setup & Status Checker for SPARK AI
REM Initializes repo and checks status
REM Repository: https://github.com/tricoreevent-ai/spark7
REM =====================================================

setlocal enabledelayedexpansion

color 0C

echo.
echo ==========================================
echo   SPARK AI - Git Setup & Status
echo ==========================================
echo.

REM Check git installation
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH
    echo [INFO] Download and install from: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [OK] Git is installed
echo.

REM Show menu
echo Select operation:
echo.
echo 1. Check current status
echo 2. Setup remote repository
echo 3. View commit history
echo 4. Pull latest changes
echo 5. Check branches
echo 6. Full diagnostic
echo 7. Exit
echo.

set /p choice="Enter choice (1-7): "

if "!choice!"=="7" exit /b 0

if "!choice!"=="1" (
    call :check_status
) else if "!choice!"=="2" (
    call :setup_remote
) else if "!choice!"=="3" (
    call :view_history
) else if "!choice!"=="4" (
    call :pull_changes
) else if "!choice!"=="5" (
    call :check_branches
) else if "!choice!"=="6" (
    call :full_diagnostic
) else (
    echo [ERROR] Invalid choice
)

echo.
pause
exit /b 0

REM ===== FUNCTIONS =====

:check_status
echo.
echo [STATUS] Git Repository Status
echo ======================================
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not in a git repository
    exit /b 1
)

echo.
echo [INFO] Current branch:
git rev-parse --abbrev-ref HEAD

echo.
echo [INFO] Remote URL:
git remote get-url origin

echo.
echo [INFO] Modified files:
git status --short
if errorlevel 1 (
    echo [INFO] No changes
)

echo.
echo [INFO] Last commit:
git log -1 --oneline

exit /b 0

:setup_remote
echo.
echo [SETUP] Configuring Remote Repository
echo ======================================
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not a git repository. Initialize first:
    echo [CMD] git init
    exit /b 1
)

echo.
echo [INFO] Current remote:
git remote -v

echo.
echo [ACTION] Setting remote to: https://github.com/tricoreevent-ai/spark7
git remote set-url origin https://github.com/tricoreevent-ai/spark7
if errorlevel 1 (
    echo [ACTION] Adding remote (doesn't exist yet)
    git remote add origin https://github.com/tricoreevent-ai/spark7
)

echo.
echo [INFO] Updated remote:
git remote -v

echo.
echo [SUCCESS] Remote configured successfully

exit /b 0

:view_history
echo.
echo [LOG] Commit History (Last 10)
echo ======================================
git log --oneline -10

exit /b 0

:pull_changes
echo.
echo [ACTION] Pulling latest changes...
git pull origin main
if errorlevel 1 (
    echo [WARNING] Pull failed. Trying master branch...
    git pull origin master
)

echo.
echo [SUCCESS] Pull completed

exit /b 0

:check_branches
echo.
echo [BRANCHES] Current Branches
echo ======================================

echo.
echo Local branches:
git branch

echo.
echo Remote branches:
git branch -r

exit /b 0

:full_diagnostic
echo.
echo [DIAGNOSTIC] Full System Check
echo ======================================

echo.
echo 1. Git Version:
git --version

echo.
echo 2. Git Configuration:
echo    User Name: %username%
git config user.name 2>nul || echo    [NOT SET]
echo    User Email:
git config user.email 2>nul || echo    [NOT SET]

echo.
echo 3. Repository Status:
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo    [ERROR] Not a git repository
) else (
    echo    [OK] Valid git repository
)

echo.
echo 4. Remote Configuration:
git remote -v 2>nul || echo    [NO REMOTES]

echo.
echo 5. Current Branch:
git rev-parse --abbrev-ref HEAD 2>nul || echo    [ERROR]

echo.
echo 6. Staged Changes:
for /f %%a in ('git diff --cached --name-only 2^>nul ^| find /c /v ""') do set "staged=%%a"
if "!staged!"=="0" (
    echo    [OK] No staged changes
) else (
    echo    [WARNING] !staged! files staged
)

echo.
echo 7. Unstaged Changes:
for /f %%a in ('git diff --name-only 2^>nul ^| find /c /v ""') do set "unstaged=%%a"
if "!unstaged!"=="0" (
    echo    [OK] No unstaged changes
) else (
    echo    [INFO] !unstaged! files with changes
)

echo.
echo 8. Untracked Files:
for /f %%a in ('git ls-files --others --exclude-standard 2^>nul ^| find /c /v ""') do set "untracked=%%a"
if "!untracked!"=="0" (
    echo    [OK] No untracked files
) else (
    echo    [INFO] !untracked! untracked files
)

echo.
echo 9. Remote Connectivity:
ping github.com -n 1 -w 1000 >nul 2>&1
if errorlevel 1 (
    echo    [WARNING] Cannot reach github.com
) else (
    echo    [OK] GitHub is reachable
)

echo.
echo [DIAGNOSTIC] Complete

exit /b 0
