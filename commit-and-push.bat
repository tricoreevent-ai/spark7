@echo off
REM =====================================================
REM Git Commit and Push Script for SPARK AI
REM Commits all latest changes to GitHub repository
REM Repository: https://github.com/tricoreevent-ai/spark7
REM =====================================================

setlocal enabledelayedexpansion

REM Set colors for output
color 0A

echo.
echo ======================================
echo   SPARK AI - Git Commit & Push
echo ======================================
echo.

REM Get current date and time
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if we're in a git repository
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not a git repository. Please run this from the project root.
    pause
    exit /b 1
)

echo [INFO] Checking git status...
echo.

REM Check if there are any changes
git status --porcelain >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Unable to check git status
    pause
    exit /b 1
)

REM Show current status
echo [STATUS] Current changes:
echo.
git status --short
echo.

REM Ask for commit message
set "commit_message="
set /p commit_message="Enter commit message (or press Enter for auto-message): "

REM If no message provided, create auto-message
if "!commit_message!"=="" (
    set "commit_message=Update: Latest changes - %mydate% %mytime%"
)

REM Stage all changes
echo.
echo [ACTION] Staging all changes...
git add -A
if errorlevel 1 (
    echo [ERROR] Failed to stage changes
    pause
    exit /b 1
)
echo [SUCCESS] All files staged

REM Check if there are staged changes
git diff --cached --quiet
if errorlevel 1 (
    REM There are staged changes, proceed with commit
    
    REM Create commit with message
    echo.
    echo [ACTION] Creating commit with message: "!commit_message!"
    git commit -m "!commit_message!"
    if errorlevel 1 (
        echo [ERROR] Failed to create commit
        pause
        exit /b 1
    )
    echo [SUCCESS] Commit created successfully
    
    REM Get current branch
    for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set "branch=%%a"
    
    echo.
    echo [INFO] Current branch: !branch!
    echo.
    
    REM Push to remote
    echo [ACTION] Pushing to remote repository...
    git push origin !branch!
    if errorlevel 1 (
        echo [WARNING] Push failed. Checking remote configuration...
        echo.
        echo [INFO] Remote repositories:
        git remote -v
        echo.
        echo [INFO] Attempting to set remote to https://github.com/tricoreevent-ai/spark7...
        git remote set-url origin https://github.com/tricoreevent-ai/spark7
        echo.
        echo [ACTION] Retrying push...
        git push origin !branch!
        if errorlevel 1 (
            echo [ERROR] Failed to push to remote. Please check:
            echo   - Internet connection
            echo   - GitHub credentials
            echo   - Repository URL: https://github.com/tricoreevent-ai/spark7
            pause
            exit /b 1
        )
    )
    echo [SUCCESS] Successfully pushed to remote
    
    REM Show commit info
    echo.
    echo ======================================
    echo   COMMIT DETAILS
    echo ======================================
    git log -1 --oneline
    echo.
    echo [SUCCESS] Everything committed and pushed successfully!
    echo.
    
) else (
    echo.
    echo [INFO] No changes to commit
    echo.
)

echo.
echo Press any key to exit...
pause >nul
exit /b 0
