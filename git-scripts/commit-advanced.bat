@echo off
setlocal enabledelayedexpansion
color 0B

:menu
cls
echo.
echo ╔═════════════════════════════════════════════════════════════╗
echo ║           GIT COMMIT - SEMANTIC TYPE SELECTOR              ║
echo ║           Choose commit type and enter description          ║
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

REM ========== SHOW MENU ==========
echo Select commit type:
echo.
echo   1. feat       - New feature implementation
echo   2. fix        - Bug fix or patch
echo   3. update     - General updates
echo   4. refactor   - Code refactoring
echo   5. docs       - Documentation updates
echo   6. ui         - UI/Design changes
echo   7. custom     - Your own message
echo   8. view       - View changes only
echo   9. exit       - Quit
echo.
set /p choice="Enter number (1-9): "
echo.

if "!choice!"=="9" goto end
if "!choice!"=="8" goto viewonly

if "!choice!"=="1" set "prefix=feat" && goto getdesc
if "!choice!"=="2" set "prefix=fix" && goto getdesc
if "!choice!"=="3" set "prefix=update" && goto getdesc
if "!choice!"=="4" set "prefix=refactor" && goto getdesc
if "!choice!"=="5" set "prefix=docs" && goto getdesc
if "!choice!"=="6" set "prefix=ui" && goto getdesc
if "!choice!"=="7" set "prefix=custom" && goto getdesc
goto menu

:viewonly
git status --short
echo.
pause
goto menu

:getdesc
echo Enter description:
set /p description="> "
echo.

if "!prefix!"=="custom" (
    set commit_msg=!description!
) else (
    set commit_msg=!prefix!: !description!
)

for /f "tokens=*" %%a in ('powershell Get-Date -Format "yyyy-MM-dd HH:mm"') do set mydate=%%a
set commit_msg=!commit_msg! - !mydate!

REM ========== SHOW PREVIEW ==========
echo.
echo Commit message will be:
echo "!commit_msg!"
echo.
set /p confirm="Confirm? (Y/N): "
if /i not "!confirm!"=="Y" goto menu

REM ========== EXECUTE ==========
git add -A
git commit -m "!commit_msg!"
if errorlevel 1 (
    color 0C
    echo ERROR: Commit failed
    pause
    goto menu
)

color 0A
echo.
echo ✓ Commit created successfully
echo.
set /p dopush="Push to remote now? (Y/N): "
echo.

if /i "!dopush!"=="Y" (
    for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"
    echo Pushing to !branch!...
    git push origin !branch!
    if errorlevel 1 (
        color 0C
        echo ERROR: Push failed
    ) else (
        color 0A
        echo ✓ Pushed successfully
    )
)

echo.
echo Latest commit:
git log -1 --oneline
echo.
pause
goto menu

:end
color 07
