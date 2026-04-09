# SPARK AI - Git Commit Scripts Guide

## Overview
Three batch scripts to manage commits and pushes to GitHub repository: `https://github.com/tricoreevent-ai/spark7`

---

## 📋 Scripts Overview

### 1. `commit-and-push.bat` - Standard Commit & Push
**Best for**: Regular commits with custom messages

**How to use:**
```bash
commit-and-push.bat
```

**Features:**
- ✅ Interactive commit message input
- ✅ Auto-generated fallback message with timestamp
- ✅ Shows all changes before committing
- ✅ Stages all files automatically
- ✅ Pushes to current branch
- ✅ Handles push failures gracefully
- ✅ Color-coded output for easy reading

**Workflow:**
1. Double-click `commit-and-push.bat`
2. Optional: Enter custom commit message (or press Enter for auto-generated)
3. Review the changes shown
4. Confirm to proceed
5. All changes are committed and pushed

---

### 2. `commit-advanced.bat` - Smart Commit with Type Selection
**Best for**: Organized commits with semantic versioning

**How to use:**
```bash
commit-advanced.bat
```

**Features:**
- ✅ Select commit type (feat, fix, update, refactor, docs, ui)
- ✅ Conventional commit format: `type: description`
- ✅ Interactive menu system
- ✅ View changes only option
- ✅ Confirmation before commit
- ✅ Optional push after commit
- ✅ Enhanced error handling

**Commit Types:**
1. **Feature** (`feat`) - New feature implementation
2. **Fix** (`fix`) - Bug fix or patch
3. **Update** (`update`) - General updates and improvements
4. **Refactor** (`refactor`) - Code refactoring
5. **Docs** (`docs`) - Documentation updates
6. **UI/Design** (`ui`) - Frontend/UI changes
7. **Custom** - Enter your own message

**Workflow:**
1. Double-click `commit-advanced.bat`
2. Select commit type from menu (1-7)
3. Enter description
4. Confirm
5. Choose to push immediately or later

---

### 3. `git-quick-commit.bat` - Fast Single-Line Commits
**Best for**: Quick commits when you know exactly what to say

**How to use:**
```bash
REM Interactive mode
git-quick-commit.bat

REM Command-line mode
git-quick-commit.bat "Your commit message here"
```

**Features:**
- ✅ One-line operation
- ✅ Auto-timestamps
- ✅ Immediate push to remote
- ✅ Minimal output
- ✅ Can be used in scripts or batch operations

**Examples:**
```bash
git-quick-commit.bat "Update: Add homepage design"
git-quick-commit.bat "Fix: Resolve connection issue"
git-quick-commit.bat "Refactor: Optimize database queries"
```

---

## 🚀 Quick Start

### First Time Setup

1. **Verify Git is installed:**
   ```bash
   git --version
   ```

2. **Configure Git (if not already done):**
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your@email.com"
   ```

3. **Set up GitHub authentication:**
   - Generate SSH key: `ssh-keygen -t ed25519`
   - Or use GitHub CLI: `gh auth login`
   - Or use Personal Access Token for HTTPS

4. **Verify remote is set:**
   ```bash
   git remote -v
   ```
   Should show:
   ```
   origin  https://github.com/tricoreevent-ai/spark7 (fetch)
   origin  https://github.com/tricoreevent-ai/spark7 (push)
   ```

---

## 📝 Commit Message Examples

### Using `commit-and-push.bat`:
```
[Prompt] Enter commit message: Update: Add modern dark theme homepage
[Result] Update: Add modern dark theme homepage - 2026-04-09 14-30
```

### Using `commit-advanced.bat`:
```
[Menu] Select type: 6 (UI/Design)
[Input] UI/Design changes: Add responsive navigation menu
[Result] ui: Add responsive navigation menu - 2026-04-09 14-30
```

### Using `git-quick-commit.bat`:
```bash
git-quick-commit.bat "feat: Implement inventory tracking system"
[Result] Committed and pushed to origin/main
```

---

## 🔧 Troubleshooting

### "Git is not installed or not in PATH"
- Install Git from: https://git-scm.com/download/win
- Restart your command prompt after installation

### "Not a git repository"
- Navigate to the project root directory: `c:\Works\SPARK AI\`
- Or run in PowerShell as Administrator

### Push fails with "Authentication failed"
**Solution 1 - SSH Keys:**
```bash
ssh-keygen -t ed25519 -C "your@email.com"
# Add public key to GitHub Settings > SSH Keys
```

**Solution 2 - Personal Access Token (HTTPS):**
```bash
git remote set-url origin https://github.com/tricoreevent-ai/spark7
# When prompted for password, use Personal Access Token
```

**Solution 3 - GitHub CLI:**
```bash
gh auth login
# Follow the interactive prompts
```

### "Failed to stage changes"
- Check file permissions
- Close any editors that might be locking files
- Try running as Administrator

### Want to see changes before committing:
```bash
REM Using commit-advanced.bat, select option 8
REM Or use this command:
git status
git diff HEAD
```

---

## 📊 Typical Workflow

### Daily Development:
```bash
REM Morning: Start with latest code
git pull origin main

REM Throughout day: Make changes
REM [edit files]

REM End of day: Commit changes
commit-and-push.bat
```

### Feature Development:
```bash
REM Create feature branch
git checkout -b feature/new-feature

REM Work on feature
REM [make changes]

REM Commit using semantic type
commit-advanced.bat
REM Select: 1 (feat)
REM Input: Implement user authentication
```

### Quick Fixes:
```bash
REM Make quick fix
REM [edit files]

REM Quick commit
git-quick-commit.bat "Quick fix: Resolve UI bug"
```

---

## 🔐 Security Tips

1. **Never commit secrets:**
   - API keys
   - Passwords
   - Private tokens
   - Database credentials

2. **Use `.gitignore`** for:
   ```
   node_modules/
   .env
   .env.local
   logs/
   *.log
   ```

3. **Review before committing:**
   ```bash
   git diff
   git status
   ```

---

## 📖 Advanced Usage

### Check commit history:
```bash
git log --oneline
git log --graph --oneline --all
```

### Amend last commit:
```bash
REM Make changes
git add -A
git commit --amend --no-edit
git push origin main --force-with-lease
```

### Multiple commits workflow:
```bash
commit-advanced.bat  REM Commit 1
commit-advanced.bat  REM Commit 2
commit-advanced.bat  REM Commit 3
REM All automatically pushed
```

### View pending changes:
```bash
git status
git diff
git diff --cached
```

---

## 📞 Support

If scripts fail:
1. Check `git status` output
2. Verify GitHub connectivity: `git remote -v`
3. Test authentication: `git pull origin main`
4. Check disk space and file permissions
5. See Troubleshooting section above

---

## 🎯 Best Practices

✅ **DO:**
- Commit frequently (multiple times per day)
- Write clear, descriptive messages
- Use appropriate commit types
- Keep commits focused on single features/fixes
- Push changes regularly to backup code

❌ **DON'T:**
- Commit uncommitted changes you're uncertain about
- Use vague messages like "Update" or "Fix stuff"
- MIx unrelated changes in one commit
- Force push to shared branches
- Leave large commits uncommitted for days

---

## 📝 Commit Message Format

**Standard (used in scripts):**
```
type: description - date time
```

**Examples:**
```
feat: Add dark theme homepage design - 2026-04-09 14-30
fix: Resolve database connection timeout - 2026-04-09 15-45
update: Improve error messages - 2026-04-09 16-20
docs: Update README with API docs - 2026-04-09 17-00
ui: Redesign navigation menu - 2026-04-09 11-15
refactor: Optimize database queries - 2026-04-09 12-30
```

---

## 🚀 Getting Started Now

**Choose your script:**

1. **Just want to commit?**
   → Use: `commit-and-push.bat`

2. **Want organized commits?**
   → Use: `commit-advanced.bat`

3. **In a hurry?**
   → Use: `git-quick-commit.bat "Your message"`

**Next Steps:**
1. Place scripts in project root: `c:\Works\SPARK AI\`
2. Double-click to run
3. Follow the prompts
4. Check GitHub to verify commits

---

**Repository:** https://github.com/tricoreevent-ai/spark7

**Happy committing! 🎉**
