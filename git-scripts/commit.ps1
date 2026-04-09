#!/usr/bin/env pwsh
# Git Commit & Push - PowerShell Version
# Usage: .\commit.ps1 -Message "Your message"
#        .\commit.ps1 -Type feat -Description "New feature"

param(
    [string]$Message = $null,
    [ValidateSet('feat', 'fix', 'update', 'refactor', 'docs', 'ui', 'custom')]
    [string]$Type = $null,
    [string]$Description = $null
)

# Color definitions
$Colors = @{
    Error   = 'Red'
    Success = 'Green'
    Info    = 'Cyan'
    Warning = 'Yellow'
}

function Write-Status {
    param(
        [string]$Status = "Info",
        [string]$Message
    )
    $color = $Colors[$Status]
    Write-Host "[$Status] " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

function Check-Git {
    try {
        $version = git --version 2>$null
        Write-Status "Success" $version
        return $true
    }
    catch {
        Write-Status "Error" "Git not installed. Download from https://git-scm.com/download/win"
        return $false
    }
}

function Check-Repository {
    try {
        git rev-parse --git-dir >$null 2>&1
        Write-Status "Success" "Repository found"
        return $true
    }
    catch {
        Write-Status "Error" "Not a git repository"
        return $false
    }
}

function Show-Changes {
    Write-Host "`nCurrent changes:"
    git status --short
}

function Get-CommitMessage {
    param(
        [string]$Message,
        [string]$Type,
        [string]$Description
    )
    
    if ($Message) {
        return $Message
    }
    
    if ($Type -and $Description) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        return "$Type`: $Description - $timestamp"
    }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    return "Update - $timestamp"
}

function Commit-Changes {
    param(
        [string]$CommitMessage
    )
    
    Write-Status "Info" "Staging files..."
    git add -A
    
    Write-Status "Info" "Creating commit..."
    git commit -m $CommitMessage
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Success" "Commit created"
        return $true
    }
    else {
        Write-Status "Error" "Commit failed"
        return $false
    }
}

function Push-Changes {
    $branch = git rev-parse --abbrev-ref HEAD
    Write-Status "Info" "Pushing to $branch..."
    
    git push origin $branch
    
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Success" "Pushed successfully"
        return $true
    }
    else {
        Write-Status "Error" "Push failed"
        return $false
    }
}

# Main execution
Write-Host "`n╔═════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         GIT COMMIT & PUSH - PowerShell             ║" -ForegroundColor Cyan
Write-Host "╚═════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check git
if (-not (Check-Git)) {
    exit 1
}

# Check repository
if (-not (Check-Repository)) {
    exit 1
}

# Show changes
Show-Changes

# Get commit message
$commitMsg = Get-CommitMessage -Message $Message -Type $Type -Description $Description
Write-Status "Info" "Message: $commitMsg"

# Commit
if (Commit-Changes -CommitMessage $commitMsg) {
    # Push
    Push-Changes
    
    # Show result
    Write-Status "Success" "Latest commit:"
    git log -1 --oneline
}

Write-Host "`n"
