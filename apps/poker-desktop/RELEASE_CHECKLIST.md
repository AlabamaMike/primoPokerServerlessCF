# Primo Poker Desktop Release Checklist

## Pre-Release Checklist

### 1. Code Preparation
- [ ] All features for release are merged to main
- [ ] All tests are passing
- [ ] No critical bugs in issue tracker
- [ ] Code has been reviewed

### 2. Version Update
Update version in all three places:
- [ ] `package.json`
- [ ] `src-tauri/Cargo.toml`  
- [ ] `src-tauri/tauri.conf.json`

### 3. Testing
- [ ] Run full test suite: `npm test`
- [ ] Test installer locally on Windows
- [ ] Test auto-update from previous version
- [ ] Verify all features work as expected

### 4. Documentation
- [ ] Update CHANGELOG.md with release notes
- [ ] Update README if needed
- [ ] Check that all new features are documented

## Release Process

### 1. Create Release Build

#### Option A: Unsigned Build (Testing)
```bash
# Push to main to trigger automatic build
git add .
git commit -m "chore: prepare release v0.1.0"
git push origin main
```

#### Option B: Signed Build (Production)
1. Go to GitHub Actions
2. Run "Build Desktop Client - Windows (Signed)"
3. Enter version number
4. Enable signing

### 2. Test Release Artifacts
- [ ] Download installer from GitHub Actions artifacts
- [ ] Install on clean Windows machine
- [ ] Verify application launches correctly
- [ ] Test core functionality

### 3. Publish Release
- [ ] Go to GitHub Releases
- [ ] Find draft release
- [ ] Add detailed release notes:
  ```markdown
  ## What's New
  - Feature 1
  - Feature 2
  
  ## Bug Fixes
  - Fix 1
  - Fix 2
  
  ## Known Issues
  - Issue 1
  ```
- [ ] Attach any additional files
- [ ] Publish release

### 4. Deploy Auto-Update
- [ ] Upload installer to S3
- [ ] Update latest.json with new version
- [ ] Test auto-update notification appears

### 5. Post-Release
- [ ] Announce release on Discord/social media
- [ ] Monitor for any immediate issues
- [ ] Update project board/issues
- [ ] Plan next release

## Quick Release Commands

```bash
# 1. Update version (example: 0.1.0 to 0.2.0)
npm version minor --no-git-tag-version
cd src-tauri && cargo bump minor && cd ..

# 2. Commit version change
git add .
git commit -m "chore: bump version to v0.2.0"

# 3. Create and push tag
git tag v0.2.0
git push origin main --tags

# 4. GitHub Actions will automatically build
```

## Emergency Rollback

If a critical issue is found:

1. **Remove from S3**:
```bash
aws s3 rm s3://primo-poker-updates/latest.json
# Upload previous version's latest.json
```

2. **Mark as Pre-release**:
- Go to GitHub Releases
- Edit the release
- Check "This is a pre-release"

3. **Communicate**:
- Post announcement about the issue
- Provide workaround if available

## Version Numbering

Follow Semantic Versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features
- **Patch** (0.0.1): Bug fixes

Examples:
- `0.1.0` → `0.1.1`: Bug fix
- `0.1.1` → `0.2.0`: New feature
- `0.2.0` → `1.0.0`: Major release

## Release Schedule

Suggested schedule:
- **Weekly**: Patch releases for critical fixes
- **Bi-weekly**: Minor releases with new features
- **Quarterly**: Major releases with big changes

## Checklist Complete! 🎉

Ready to release Primo Poker Desktop to the world!