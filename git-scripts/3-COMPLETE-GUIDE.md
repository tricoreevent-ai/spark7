# SPARK AI - Git Scripts Complete Guide

**Repository:** https://github.com/tricoreevent-ai/spark7

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Scripts Overview](#scripts-overview)
3. [Detailed Setup](#detailed-setup)
4. [How Each Script Works](#how-each-script-works)
5. [Workflow Examples](#workflow-examples)
6. [Commit Message Guide](#commit-message-guide)
7. [Troubleshooting](#troubleshooting)
8. [Security Best Practices](#security-best-practices)
9. [Advanced Usage](#advanced-usage)
10. [FAQ](#faq)

---

## Quick Start

### For Complete Beginners (5 minutes)

```bash
# Step 1: Run setup check
Double-click: git-setup.bat
(Select option 6 for diagnostics)

# Step 2: Make changes to your project
(Edit files...)

# Step 3: Commit and push
Double-click: commit-and-push.bat
→ Enter a message or press Enter
→ Confirm
→ Done!

# Step 4: Verify on GitHub
Visit: https://github.com/tricoreevent-ai/spark7
(You should see your commit!)
```

### For Experienced Users (30 seconds)

```bash
commit-and-push.bat    # For daily work
commit-advanced.bat    # For organized commits
git-quick-commit "msg" # For quick fixes
```

---

## Scripts Overview

### ✅ Script 1: commit-and-push.bat (RECOMMENDED)

**Best for:** Daily commits with custom messages

**How to use:**
```bash
Double-click: commit-and-push.bat
```

**What happens:**
1. ✓ Checks if git is installed
2. ✓ Verifies you're in a git repository
3. ✓ Shows all your changes
4. ✓ Asks for a commit message
5. ✓ Stages all files (git add -A)
6. ✓ Creates commit
7. ✓ Pushes to GitHub

**Example:**
```
Prompt: Enter commit message:
You: Added new login feature
→ Automatically pushed to GitHub
```

**Pros:**
- Simple to use
- Shows all changes before committing
- Auto-timestamps
- Most common workflow

**Cons:**
- Requires manual message input
- No type categorization

---

### ✅ Script 2: commit-advanced.bat (RECOMMENDED)

**Best for:** Organized, semantic commits

**How to use:**
```bash
Double-click: commit-advanced.bat
```

**What happens:**
1. ✓ Menu of commit types appears
2. ✓ Select type (feat, fix, docs, etc.)
3. ✓ Enter description
4. ✓ Shows format: `feat: Your description`
5. ✓ Confirm to commit
6. ✓ Option to push

**Commit Types Available:**
```
1. feat    - New feature
2. fix     - Bug fix
3. update  - General updates
4. refactor - Code optimization
5. docs    - Documentation
6. ui      - UI/Design changes
7. custom  - Your own message
```

**Example:**
```
Select type: 1 (feat)
Description: Single sign-on authentication
Message: feat: Single sign-on authentication - 2026-04-09 14:30
→ Automatic push
```

**Pros:**
- Organized, professional commits
- Easy to categorize work
- Industry standard (conventional commits)
- Better for team workflows

**Cons:**
- Slightly more steps than standard

---

### ✅ Script 3: git-quick-commit.bat (FAST)

**Best for:** Quick one-line commits

**How to use:**
```bash
# Interactive mode
git-quick-commit.bat

# Command-line mode
git-quick-commit.bat "Your message"
```

**What happens:**
1. ✓ Takes message as input
2. ✓ Auto-timestamps it
3. ✓ Immediate commit and push
4. ✓ Minimal output

**Example:**
```bash
git-quick-commit.bat "Add homepage design"
→ [Commit created and pushed in seconds]
```

**Pros:**
- Fastest option
- Perfect for quick saves
- Can be used in automation
- One-command operation

**Cons:**
- No type categorization
- Less organized than advanced

---

### ✅ Script 4: git-setup.bat (DIAGNOSTICS)

**Best for:** Verification and troubleshooting

**How to use:**
```bash
Double-click: git-setup.bat
```

**Menu Options:**
```
1. Check current status    - See your branch, changes, last commit
2. Setup remote URL        - Configure GitHub connection
3. View commit history     - See recent commits
4. Pull latest changes     - Get updates from GitHub
5. Check branches          - List local and remote branches
6. Full diagnostic         - Complete system check
7. Exit                    - Quit
```

**Example:**
```
Select option: 6 (Full diagnostic)
→ Git installed? ✓
→ User configured? ✓
→ Repository OK? ✓
→ GitHub reachable? ✓
→ All green!
```

**Pros:**
- Identifies problems
- Verifies setup
- Fixes remote configuration
- Complete diagnostics

**Cons:**
- Read-only (helps you, doesn't commit)
- Requires menu selection

---

### ✅ Script 5: commit.ps1 (POWERSHELL)

**Best for:** Advanced/automation workflows

**How to use:**
```powershell
# Basic
.\commit.ps1

# With parameters
.\commit.ps1 -Message "Your message"
.\commit.ps1 -Type feat -Description "New feature"
```

**What happens:**
1. ✓ PowerShell parameter processing
2. ✓ Git validation
3. ✓ Change staging
4. ✓ Commit with color output
5. ✓ Push to remote

**Example:**
```powershell
$> .\commit.ps1 -Type feat -Description "Add dashboard"
→ [Process with colored output]
```

**Pros:**
- Advanced parameter support
- PowerShell integration
- Colored output
- Can be called from other scripts

**Cons:**
- Requires PowerShell knowledge
- Not for beginners

---

## Detailed Setup

### Prerequisites

#### 1. Git Installation
```bash
# Check if installed
git --version

# If not installed:
Download from: https://git-scm.com/download/win
Run installer with default settings
Restart your terminal
```

#### 2. Git Configuration
```bash
# Set your name (do once)
git config --global user.name "Your Full Name"

# Set your email (do once)
git config --global user.email "your@email.com"

# Verify
git config --global user.name
git config --global user.email
```

#### 3. GitHub Authentication (Choose ONE)

**Option A: SSH Keys (Recommended)**
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your@email.com"
# Press Enter 3 times for defaults

# Add to GitHub:
# Settings → SSH and GPG keys → New SSH key
# Paste content from: C:\Users\YourName\.ssh\id_ed25519.pub
```

**Option B: Personal Access Token**
```bash
# Create at: https://github.com/settings/tokens
# Generate new token with "repo" scope
# Use token as password when pushing
```

**Option C: GitHub CLI**
```bash
# Download from: https://cli.github.com
# Run: gh auth login
# Follow prompts
```

#### 4. First-Time Setup
```bash
# Navigate to project directory
cd c:\Works\SPARK AI\

# Verify it's a git repository
git status

# If error, initialize:
git init

# If no remote, add it:
git remote add origin https://github.com/tricoreevent-ai/spark7.git
```

### Verification Checklist

```bash
□ Git installed? (git --version)
□ User configured? (git config --global user.name)
□ Email configured? (git config --global user.email)
□ SSH key setup? (optional but recommended)
□ In project directory? (files visible)
□ Repository initialized? (git status works)
□ Remote configured? (git remote -v shows origin)
□ Can push? (test with git-setup.bat option 6)
```

---

## How Each Script Works

### commit-and-push.bat - Detailed Flow

```
START
  ↓
[Check if git installed]
  ├─ NO → Show error & exit
  ├─ YES → Continue
  ↓
[Check if git repository]
  ├─ NO → Show error & exit
  ├─ YES → Continue
  ↓
[Show current status and changes]
  ├─ (git status --short)
  ├─ (git diff --cache summary)
  ↓
[Ask for commit message]
  ├─ User input OR press Enter
  ├─ Empty → Auto-generate with timestamp
  ↓
[Stage all files]
  ├─ (git add -A)
  ↓
[Create commit]
  ├─ (git commit -m "message")
  ├─ On success → Continue
  ├─ On error → Show error & exit
  ↓
[Push to remote]
  ├─ (git push origin [branch])
  ├─ On success → Show success message
  ├─ On failure → Try fallback config
  ↓
[Show commit log]
  ├─ (git log -1 --oneline)
  ↓
END / Press any key to exit
```

### commit-advanced.bat - Detailed Flow

```
START
  ↓
[Show Commit Type Menu]
  ├─ 1. feat
  ├─ 2. fix
  ├─ 3. update
  ├─ 4. refactor
  ├─ 5. docs
  ├─ 6. ui
  ├─ 7. custom
  ├─ 8. view only
  ├─ 9. exit
  ↓
[Get User Selection]
  ├─ If exit → END
  ├─ If view only → Show changes & restart
  ├─ If option 1-7 → Continue
  ↓
[Get Description]
  ├─ "Enter description for [type]:"
  ├─ User enters text
  ↓
[Format Message]
  ├─ Message = "[type]: [description] - [timestamp]"
  ├─ Example: "feat: Add login - 2026-04-09 14:30"
  ↓
[Show Formatted Message & Ask Confirmation]
  ├─ "Commit message will be: [message]"
  ├─ Continue? (Y/N)
  ├─ If NO → Return to menu
  ├─ If YES → Continue
  ↓
[Execute Git Operations]
  ├─ Stage files (git add -A)
  ├─ Create commit (git commit -m)
  ├─ Show "Commit successful"
  ↓
[Ask About Push]
  ├─ "Push to remote now? (Y/N)"
  ├─ If YES → Git push
  ├─ If NO → Save locally only
  ↓
[Show Result]
  ├─ (git log -1 --oneline)
  ↓
END / Press any key
```

---

## Workflow Examples

### Example 1: New Feature Development

```bash
# Step 1: Create feature branch
git checkout -b feature/user-auth

# Step 2: Make changes
[Edit files for authentication feature]

# Step 3: Commit with proper type
Double-click: commit-advanced.bat
→ Select: 1 (feat)
→ Description: "User authentication with SSO"
→ Confirm

# Step 4: Continue developing
[Edit more files]
Double-click: commit-and-push.bat
→ Message: "Add login form UI"

# Step 5: Finish and push
Double-click: commit-advanced.bat
→ Select: 1 (feat)
→ Description: "Complete authentication system"
→ Confirm

# Step 6: Create Pull Request
Visit: https://github.com/tricoreevent-ai/spark7
Create PR from feature/user-auth → main
```

### Example 2: Bug Fix Workflow

```bash
# Step 1: Create fix branch
git checkout -b fix/timeout-issue

# Step 2: Fix the bug
[Edit file to resolve timeout]

# Step 3: Commit fix
git-quick-commit.bat "fix: Resolve database timeout issue"

# Step 4: Test and verify
[Run tests]

# Step 5: Create Pull Request
Visit GitHub
Create PR with description of fix
```

### Example 3: Daily Standup (Simple)

```bash
# Throughout the day, make commits:

[Morning - setup]
commit-and-push.bat
→ "Setup new dashboard component"

[Midday - feature work]
commit-and-push.bat
→ "Implement user profile page"

[Afternoon - polish]
commit-and-push.bat
→ "Fix styling and responsive design"

[End of day - final touches]
commit-quick.bat "Final touches before EOD"

# All commits automatically pushed!
# Check GitHub to see full history
```

### Example 4: Documentation Updates

```bash
# Step 1: Edit documentation
[Edit README.md and other docs]

# Step 2: Commit as documentation
Double-click: commit-advanced.bat
→ Select: 5 (docs)
→ Description: "Update API documentation and guides"
→ Confirm

# Done! Documentation is updated on GitHub
```

---

## Commit Message Guide

### Good Messages

✅ **Clear and specific:**
```
"Add user authentication with SSO"
"Fix database connection timeout in production"
"Update deployment documentation"
"Implement responsive dashboard design"
```

✅ **Describes what changed:**
```
"Refactor database queries for better performance"
"Add validation for user input forms"
"Remove deprecated API endpoints"
```

✅ **Using commit-advanced.bat format:**
```
feat: Implement two-factor authentication
fix: Resolve memory leak in cache system
ui: Redesign account settings page
docs: Add architecture documentation
```

### Bad Messages

❌ **Too vague:**
```
"Update stuff"
"Changes"
"Fix things"
"More work"
```

❌ **Too generic:**
```
"Update"
"Edit"
"Save"
"Work"
```

❌ **Unclear:**
```
"asdf"
"blah"
"???"
"test 123"
```

### Message Templates

**For Features:**
```
Add [feature name]
Implement [functionality]
Create [component]
Enable [capability]
```

**For Fixes:**
```
Fix [bug description]
Resolve [issue]
Patch [problem]
Correct [error]
```

**For Updates:**
```
Update [component/file]
Bump [dependency version]
Enhance [feature]
Improve [system]
```

**For Refactoring:**
```
Refactor [module]
Optimize [code/query]
Reorganize [structure]
Simplify [logic]
```

### Why Good Messages Matter

✓ Easy to find commits later
✓ Helps understand project history
✓ Useful for code reviews
✓ Professional for team collaboration
✓ Better for debugging

---

## Troubleshooting

### Problem 1: "Git not found"

**Symptoms:**
```
'git' is not recognized as an internal or external command
```

**Solutions:**
```
1. Install Git:
   Download: https://git-scm.com/download/win
   Run installer
   Restart terminal

2. Verify installation:
   git --version
   (should show version number)

3. Add to PATH if needed:
   Windows Settings → Environment Variables
   Add: C:\Program Files\Git\cmd
```

---

### Problem 2: "Not a git repository"

**Symptoms:**
```
fatal: not a git repository (or any of the parent directories): .git
```

**Solutions:**
```
1. Verify you're in correct directory:
   Current: c:\Works\SPARK AI\
   
2. Initialize repository:
   git init
   
3. Add remote (if needed):
   git remote add origin https://github.com/tricoreevent-ai/spark7.git
   
4. Or run: git-setup.bat (option 2)
```

---

### Problem 3: "Authentication failed"

**Symptoms:**
```
fatal: Authentication failed for 'https://github.com/...'
remote: Invalid username or password
```

**Solutions:**
```
1. Verify GitHub credentials:
   Username: Your GitHub username
   Password: Personal Access Token (NOT your GitHub password)
   
2. Generate new Personal Access Token:
   https://github.com/settings/tokens
   Create new token with "repo" scope
   Use token as password
   
3. Or use SSH:
   ssh-keygen -t ed25519 -C "your@email.com"
   Add public key to GitHub Settings → SSH Keys
   
4. Or use GitHub CLI:
   Download: https://cli.github.com
   Run: gh auth login
   Follow prompts
```

---

### Problem 4: "Push failed - nothing to commit"

**Symptoms:**
```
nothing to commit, working tree clean
```

**Solutions:**
```
1. This is normal! No changes = nothing to commit
   
2. Make some changes:
   Edit files
   Save them
   Try again
   
3. Check status:
   git status (should show modified files)
```

---

### Problem 5: "Merge conflict"

**Symptoms:**
```
CONFLICT (content merge): Merge conflict in file.txt
```

**Solutions:**
```
1. Pull latest first:
   git pull origin main
   
2. Open conflicted file:
   Look for markers:
   <<<<<<<< HEAD
   [your code]
   ========
   [other code]
   >>>>>>> branch-name
   
3. Decide which code to keep:
   Delete conflict markers
   Keep code you want
   
4. Stage and commit:
   commit-and-push.bat
   Message: "Resolve merge conflicts"
```

---

### Problem 6: "Remote origin not configured"

**Symptoms:**
```
fatal: 'origin' does not appear to be a 'git' repository
```

**Solutions:**
```
1. Add remote:
   git remote add origin https://github.com/tricoreevent-ai/spark7.git
   
2. Or configure with script:
   git-setup.bat (option 2)
   
3. Verify:
   git remote -v
   (should show origin)
```

---

### Diagnostic Flowchart

```
Something wrong?
├─ Git not working?
│  └─ Install: https://git-scm.com/download/win
│
├─ Can't push?
│  ├─ Check: git-setup.bat (option 1)
│  ├─ Verify: git pull origin main (first)
│  └─ Try: git-setup.bat (option 6 - full diagnostic)
│
├─ Merge conflicts?
│  ├─ Pull: git pull origin main
│  ├─ Edit: conflicting files manually
│  └─ Commit: commit-and-push.bat
│
├─ Lost commits?
│  ├─ Check: git log --oneline (history)
│  ├─ Try: git reflog (recovery)
│  └─ See: section "Advanced Usage"
│
└─ Still stuck?
   ├─ Run: git-setup.bat (full diagnostic)
   └─ Check: 2-QUICK-REFERENCE.txt (command cheatsheet)
```

---

## Security Best Practices

### ✅ DO

- ✓ Commit frequently (multiple times per day)
- ✓ Pull before pushing (avoid conflicts)
- ✓ Use .gitignore for sensitive files
- ✓ Review changes before committing
- ✓ Use SSH keys instead of passwords
- ✓ Keep .env files local (never commit)
- ✓ Use different branches for experiments
- ✓ Make meaningful commit messages
- ✓ Keep credentials out of code

### ❌ DON'T

- ✗ Commit API keys or tokens
- ✗ Commit database passwords
- ✗ Commit .env files with secrets
- ✗ Force push to shared branches
- ✗ Commit credentials in config files
- ✗ Leave sensitive data in comments
- ✗ Commit third-party API secrets
- ✗ Keep work uncommitted for weeks
- ✗ Mix unrelated changes in one commit

### Files to Never Commit

```
.env                    # Environment variables
secrets.json            # Secret keys
credentials.json        # Auth credentials
.aws/                   # AWS credentials
.ssh/                   # SSH private keys
API_KEYS.txt            # API keys
PASSWORD.txt            # Passwords
```

### Protected by .gitignore

The `.gitignore` file in this folder automatically prevents most sensitive files from being committed. Review it to see what's protected.

---

## Advanced Usage

### Amending Last Commit

```bash
# If you made a mistake in your last commit:

git add [files you forgot]
git commit --amend --no-edit

# Or with new message:
git commit --amend -m "New message"
```

### Viewing Specific Commit

```bash
# See what was in a commit:
git show [commit-hash]

# Example:
git show abc1234

# See commit history:
git log --oneline -10
git log --graph --oneline --all
```

### Creating Branches

```bash
# New feature branch:
git checkout -b feature/new-feature

# New bugfix branch:
git checkout -b fix/bug-name

# Push branch:
git push origin [branch-name]
```

### Merging Branches

```bash
# Switch to main:
git checkout main

# Merge feature:
git merge feature/new-feature

# Push:
git push origin main
```

### Reverting Commits

```bash
# Undo last commit (keep changes):
git reset HEAD~1

# Undo last commit (discard changes):
git reset --hard HEAD~1

# Revert specific commit:
git revert [commit-hash]
```

### Stashing Work

```bash
# Save uncommitted changes:
git stash

# List stashes:
git stash list

# Retrieve stashed work:
git stash pop
```

---

## FAQ

### Q: How often should I commit?
**A:** Multiple times per day. Small, focused commits are better than big ones. Commit when you complete a logical unit of work.

### Q: What if I commit by mistake?
**A:** Run `git reset HEAD~1` to undo the commit but keep your changes. Then recommit with the correct message.

### Q: Can I commit without pushing?
**A:** Yes! The scripts push automatically, but you can use `commit-advanced.bat` and choose NOT to push when asked.

### Q: What if I forget my SSH passphrase?
**A:** Generate a new SSH key:
```bash
ssh-keygen -t ed25519 -C "your@email.com"
Add new public key to GitHub
Delete old key
```

### Q: How do I delete a branch?
**A:** 
```bash
git branch -d feature-name        # Local
git push origin --delete branch   # Remote
```

### Q: What's the difference between fetch and pull?
**A:** 
- `git fetch` = download changes (no merge)
- `git pull` = download AND merge changes

### Q: How do I see my commit history?
**A:**
```bash
git log --oneline         # Short format
git log --oneline -10     # Last 10 commits
git log --graph --oneline --all  # Visual graph
```

### Q: Can I edit an old commit message?
**A:**
```bash
git commit --amend         # Last commit only
git rebase -i HEAD~3       # Last 3 commits (advanced)
```

### Q: What if I have merge conflicts?
**A:** Read "Troubleshooting" → "Problem 5: Merge conflict" (above)

### Q: Is it OK to commit incomplete work?
**A:** Yes! Small commits are good. Just use clear messages like "WIP: Adding dashboard" (WIP = Work In Progress)

### Q: How do I push to a different branch?
**A:**
```bash
git checkout -b feature/new
git push origin feature/new
```

### Q: What's the best way to organize commits?
**A:** Use `commit-advanced.bat` with proper types (feat, fix, docs, ui, refactor)

---

## Getting Help

### Resources

- **This Guide:** 3-COMPLETE-GUIDE.md (you're reading it!)
- **Quick Reference:** 2-QUICK-REFERENCE.txt (fast lookup)
- **GitHub Docs:** https://docs.github.com
- **Git Documentation:** https://git-scm.com/doc

### Diagnostic Tool

Run `git-setup.bat` and select option 6 (Full diagnostic) to:
- Verify Git installation
- Check user configuration
- Validate repository setup
- Test GitHub connectivity
- Identify common issues

---

## Summary

**You have 5 powerful scripts:**
1. `commit-and-push.bat` - Daily commits
2. `commit-advanced.bat` - Organized semantic commits
3. `git-quick-commit.bat` - Fast one-liners
4. `git-setup.bat` - Setup and diagnostics
5. `commit.ps1` - PowerShell automation

**Most users need just ONE:**
- Start with `commit-and-push.bat`
- Upgrade to `commit-advanced.bat` when comfortable
- Use `git-setup.bat` when troubleshooting

**Key Principles:**
- Commit frequently
- Write clear messages
- Never commit secrets
- Pull before pushing
- Use branches for experiments

**You're ready to go!** Double-click any `.bat` script and follow the prompts.

---

**Repository:** https://github.com/tricoreevent-ai/spark7
**Questions?** Check 2-QUICK-REFERENCE.txt for quick answers
**Need Help?** Run git-setup.bat for diagnostics
