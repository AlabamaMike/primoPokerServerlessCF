# GitHub Actions Setup for Windows Installer

## Overview

I've created three GitHub Actions workflows for building the Primo Poker Desktop installer:

1. **build-desktop-windows.yml** - Basic Windows build with unsigned installer
2. **build-desktop-windows-signed.yml** - Production build with code signing
3. **test-desktop-build.yml** - Multi-platform test builds

## Prerequisites

### 1. Repository Secrets

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

#### For Basic Build (Required):
- None required for unsigned builds

#### For Signed Build (Optional but Recommended):
- `WINDOWS_CERTIFICATE` - Base64 encoded .pfx certificate
- `WINDOWS_CERTIFICATE_PASSWORD` - Certificate password
- `WINDOWS_CERTIFICATE_THUMBPRINT` - Certificate thumbprint
- `TAURI_PRIVATE_KEY` - For update signing
- `TAURI_KEY_PASSWORD` - Password for Tauri key

#### For S3 Upload (Optional):
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

### 2. Getting a Code Signing Certificate

#### Option A: Purchase Certificate
1. Buy from providers like:
   - DigiCert (~$500/year)
   - Sectigo (~$300/year)
   - GlobalSign (~$400/year)

2. Get an EV (Extended Validation) certificate for best compatibility

#### Option B: Self-Signed for Testing
```powershell
# Create self-signed certificate (PowerShell as Admin)
$cert = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=Primo Poker Dev" -CertStoreLocation Cert:\CurrentUser\My

# Export to PFX
$pwd = ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "primo-poker.pfx" -Password $pwd

# Get thumbprint
$cert.Thumbprint

# Convert to base64 for GitHub secret
[System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes("primo-poker.pfx"))
```

## Workflow Usage

### 1. Automatic Build on Push

The basic workflow runs automatically when you push to main:

```yaml
# Triggers on:
- Push to main branch
- Changes in apps/poker-desktop/
- Creates draft release
```

### 2. Manual Signed Release

Use the signed workflow for production releases:

1. Go to Actions → "Build Desktop Client - Windows (Signed)"
2. Click "Run workflow"
3. Enter version (e.g., "0.1.0")
4. Check "Sign the release"
5. Click "Run workflow"

### 3. Test Builds

The test workflow runs on pull requests:
- Builds for Windows, macOS, and Linux
- Runs tests and linting
- Uploads artifacts for testing

## Setting Up S3 for Auto-Updates

### 1. Create S3 Bucket

```bash
# Create bucket
aws s3 mb s3://primo-poker-updates

# Set public read policy
aws s3api put-bucket-policy --bucket primo-poker-updates --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::primo-poker-updates/*"
  }]
}'

# Enable CORS
aws s3api put-bucket-cors --bucket primo-poker-updates --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }]
}'
```

### 2. Update Tauri Config

Update `src-tauri/tauri.conf.json`:
```json
"updater": {
  "endpoints": [
    "https://primo-poker-updates.s3.amazonaws.com/latest.json"
  ]
}
```

## Running Workflows

### Basic Unsigned Build

1. Push to main branch:
```bash
git add .
git commit -m "feat: new feature"
git push origin main
```

2. Check Actions tab for build progress
3. Download installer from Artifacts

### Production Signed Release

1. Update version in:
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`

2. Run signed workflow:
   - Go to Actions
   - Select "Build Desktop Client - Windows (Signed)"
   - Run with version number

3. Release will be created as draft
4. Edit and publish when ready

## Troubleshooting

### Build Failures

**"Tauri build failed"**
- Check Node.js version (needs 16+)
- Verify Rust is installed in workflow
- Check for TypeScript errors

**"Certificate not found"**
- Verify certificate is base64 encoded
- Check thumbprint matches
- Ensure certificate hasn't expired

**"Upload to S3 failed"**
- Check AWS credentials
- Verify bucket exists and has correct permissions
- Check AWS region

### Testing Locally

Before pushing, test the build locally:
```bash
# Windows
npm run tauri build

# Check output
ls src-tauri/target/release/bundle/nsis/
```

## Cost Considerations

- **GitHub Actions**: 2,000 minutes/month free for public repos
- **Windows builds**: ~10-15 minutes each
- **Storage**: Artifacts kept for 30 days
- **S3 costs**: ~$0.023/GB/month + bandwidth

## Security Best Practices

1. **Never commit certificates** to the repository
2. **Use GitHub secrets** for all sensitive data
3. **Rotate certificates** before expiration
4. **Sign all production releases**
5. **Use separate certificates** for dev/prod

## Next Steps

1. **Test unsigned build** first
2. **Get code signing certificate**
3. **Set up S3 bucket** for updates
4. **Configure secrets** in GitHub
5. **Run signed build** for production

The workflows are ready to use! Start with the basic unsigned build to verify everything works, then move to signed builds for production releases.