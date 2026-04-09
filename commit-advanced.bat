@echo off
REM =====================================================
REM Advanced Git Commit Script for SPARK AI
REM Auto-generates commit messages based on changes
REM Repository: https://github.com/tricoreevent-ai/spark7
REM =====================================================

setlocal enabledelayedexpansion

color 0B

echo.
echo ==========================================
echo   SPARK AI - Advanced Git Commit Tool
echo ==========================================
echo.

REM Get current date and time
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)

REM Check git installation
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed. Please install Git first.
    pause
    exit /b 1
)

REM Check if git repository
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not in a git repository
    pause
    exit /b 1
)

echo [INFO] Repository: %cd%
echo [INFO] Timestamp: %mydate% %mytime%
echo.

REM Show menu
echo Select commit type:
echo.
echo 1. Feature - New feature implementation
echo 2. Fix - Bug fix or patch
echo 3. Update - General updates and improvements
echo 4. Refactor - Code refactoring
echo 5. Docs - Documentation updates
echo 6. UI/Design - Frontend/UI changes
echo 7. Custom - Enter custom message
echo 8. View changes only (no commit)
echo 9. Exit
echo.

set /p choice="Enter choice (1-9): "

if "!choice!"=="9" exit /b 0
if "!choice!"=="8" (
    echo.
    echo [CHANGES] Modified files:
    echo.
    git status --short
    echo.
    pause
    exit /b 0
)

REM Show current changes
echo.
echo [STATUS] Changes detected:
git status --short
echo.

set "prefix="
set "description="

if "!choice!"=="1" (
    set "prefix=feat"
    set /p description="Feature description: "
) else if "!choice!"=="2" (
    set "prefix=fix"
    set /p description="Bug fix description: "
) else if "!choice!"=="3" (
    set "prefix=update"
    set /p description="Update description: "
) else if "!choice!"=="4" (
    set "prefix=refactor"
    set /p description="Refactor description: "
) else if "!choice!"=="5" (
    set "prefix=docs"
    set /p description="Documentation update: "
) else if "!choice!"=="6" (
    set "prefix=ui"
    set /p description="UI/Design changes: "
) else if "!choice!"=="7" (
    set /p prefix="Enter commit type prefix: "
    set /p description="Enter commit message: "
) else (
    echo [ERROR] Invalid choice
    pause
    exit /b 1
)

REM Build commit message
if "!description!"=="" (
    set "commit_message=!prefix!: Latest changes - %mydate% %mytime%"
) else (
    set "commit_message=!prefix!: !description! - %mydate% %mytime%"
)

echo.
echo [COMMIT MESSAGE] !commit_message!
echo.

REM Ask for confirmation
set /p confirm="Proceed with commit? (Y/N): "
if /i not "!confirm!"=="Y" (
    echo [CANCELLED] Commit cancelled
    pause
    exit /b 0
)

REM Stage all changes
echo.
echo [ACTION] Staging files...
git add -A
if errorlevel 1 (
    echo [ERROR] Failed to stage files
    pause
    exit /b 1
)

REM Check if there are changes to commit
git diff --cached --quiet
if errorlevel 1 (
    REM Create commit
    echo [ACTION] Committing changes...
    git commit -m "!commit_message!"
    if errorlevel 1 (
        echo [ERROR] Commit failed
        pause
        exit /b 1
    )
    
    echo [SUCCESS] Commit created
    echo.
    
    REM Get branch name
    for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"
    
    echo [INFO] Branch: !branch!
    
    set /p push_now="Push to remote now? (Y/N): "
    if /i "!push_now!"=="Y" (
        echo.
        echo [ACTION] Pushing to origin/!branch!...
        git push origin !branch!
        if errorlevel 1 (
            echo [WARNING] Push failed
            echo [INFO] Remote: https://github.com/tricoreevent-ai/spark7
            pause
            exit /b 1
        )
        echo [SUCCESS] Pushed successfully
    )
    
    echo.
    echo [LOG] Last commit:
    git log -1 --oneline
    echo.
    echo [SUCCESS] Operation completed!
    
) else (
    echo.
    echo [INFO] No changes to commit
    echo.
)

echo.
pause
exit /b 0
