# SPARK AI - Git Commit PowerShell Script
# Repository: https://github.com/tricoreevent-ai/spark7
# Usage: .\commit.ps1 -Message "Your commit message"
#        .\commit.ps1 -Type feature -Description "New feature"

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string]$Message,
    [ValidateSet('feat', 'fix', 'update', 'refactor', 'docs', 'ui')]
    [string]$Type,
    [string]$Description
)

# Configuration
$RepoUrl = "https://github.com/tricoreevent-ai/spark7"
$Colors = @{
    Error   = 'Red'
    Success = 'Green'
    Info    = 'Cyan'
    Warning = 'Yellow'
}

function Write-Status {
    param($Message, $Status = 'Info')
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] " -NoNewline
    Write-Host $Message -ForegroundColor $Colors[$Status]
}

function Check-Git {
    try {
        git --version | Out-Null
        Write-Status "Git is installed" "Success"
        return $true
    }
    catch {
        Write-Status "Git is not installed. Download from https://git-scm.com/download/win" "Error"
        return $false
    }
}

function Check-Repository {
    try {
        git rev-parse --git-dir | Out-Null
        Write-Status "In valid git repository" "Success"
        return $true
    }
    catch {
        Write-Status "Not in a git repository" "Error"
        return $false
    }
}

function Show-Changes {
    Write-Host "`n[CHANGES] Modified files:"
    git status --short
    Write-Host ""
}

function Get-CommitMessage {
    param(
        [string]$Type,
        [string]$Description,
        [string]$CustomMessage
    )

    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    
    if ($CustomMessage) {
        return "$CustomMessage ($Timestamp)"
    }
    elseif ($Type -and $Description) {
        return "$Type`: $Description ($Timestamp)"
    }
    else {
        return "update: Latest changes ($Timestamp)"
    }
}

function Commit-Changes {
    param([string]$CommitMessage)
    
    Write-Status "Staging all changes..." "Info"
    git add -A
    
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Failed to stage changes" "Error"
        return $false
    }
    
    Write-Status "Creating commit: $CommitMessage" "Info"
    git commit -m $CommitMessage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Status "No changes to commit" "Warning"
        return $false
    }
    
    Write-Status "Commit created successfully" "Success"
    return $true
}

function Push-Changes {
    $Branch = git rev-parse --abbrev-ref HEAD
    
    Write-Status "Pushing to origin/$Branch..." "Info"
    git push origin $Branch
    
    if ($LASTEXITCODE -ne 0) {
        Write-Status "Push failed. Check authentication and try again." "Error"
        return $false
    }
    
    Write-Status "Pushed successfully" "Success"
    
    Write-Status "Last commit:" "Info"
    git log -1 --oneline
    
    return $true
}

# Main execution
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  SPARK AI - Git Commit Tool (PowerShell)" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# Validate environment
if (-not (Check-Git)) { exit 1 }
if (-not (Check-Repository)) { exit 1 }

# Show current status
Show-Changes

# Get commit message
if (-not $Message) {
    Write-Host "Commit Types:" -ForegroundColor Cyan
    Write-Host "  1. feat    - New feature"
    Write-Host "  2. fix     - Bug fix"
    Write-Host "  3. update  - General update"
    Write-Host "  4. refactor- Code refactoring"
    Write-Host "  5. docs    - Documentation"
    Write-Host "  6. ui      - UI/Design changes"
    Write-Host "  7. custom  - Custom message`n"
    
    $Selection = Read-Host "Select type or enter message"
    
    switch ($Selection) {
        '1' { 
            $Type = 'feat'
            $Description = Read-Host "Feature description"
        }
        '2' { 
            $Type = 'fix'
            $Description = Read-Host "Fix description"
        }
        '3' { 
            $Type = 'update'
            $Description = Read-Host "Update description"
        }
        '4' { 
            $Type = 'refactor'
            $Description = Read-Host "Refactor description"
        }
        '5' { 
            $Type = 'docs'
            $Description = Read-Host "Documentation description"
        }
        '6' { 
            $Type = 'ui'
            $Description = Read-Host "UI/Design description"
        }
        '7' { 
            $Message = Read-Host "Enter commit message"
        }
        default { 
            $Message = $Selection 
        }
    }
}

$CommitMessage = Get-CommitMessage -Type $Type -Description $Description -CustomMessage $Message

if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    Write-Status "Invalid commit message" "Error"
    exit 1
}

Write-Host "`n[COMMIT MESSAGE] $CommitMessage" -ForegroundColor Yellow
Write-Host ""

$Confirm = Read-Host "Proceed with commit? (Y/N)"
if ($Confirm -ne 'Y' -and $Confirm -ne 'y') {
    Write-Status "Cancelled" "Warning"
    exit 0
}

# Perform commit
if (Commit-Changes -CommitMessage $CommitMessage) {
    # Ask about push
    $PushConfirm = Read-Host "`nPush to remote? (Y/N)"
    if ($PushConfirm -eq 'Y' -or $PushConfirm -eq 'y') {
        Push-Changes | Out-Null
    }
}

Write-Host "`nScript completed." -ForegroundColor Cyan
