# CI/CD Pipeline Documentation

This directory contains GitHub Actions workflows for automated testing, building, and deployment of the Primo Poker Serverless application.

## 🚀 Workflows Overview

### 1. Main CI/CD Pipeline (`ci-cd.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests to `main`

**Jobs:**
- **Setup and Build**: Install dependencies, detect changes, build all packages
- **Code Quality**: Run ESLint and TypeScript type checking
- **Unit Tests**: Execute Jest unit tests with coverage
- **E2E Tests**: Run Playwright end-to-end tests
- **Deploy Backend**: Deploy to Cloudflare Workers (main branch only)
- **Deploy Frontend**: Deploy to Cloudflare Pages (main branch only)
- **Health Check**: Verify deployments are working

### 2. Security Scanning (`security.yml`)
**Triggers:** Push, Pull Requests, Daily schedule (2 AM UTC)

**Jobs:**
- **Security Scan**: npm audit + Snyk security analysis
- **Dependency Review**: Review dependency changes in PRs

### 3. Performance Monitoring (`performance.yml`)
**Triggers:** Push to `main` (frontend changes), Daily schedule (6 AM UTC)

**Jobs:**
- **Lighthouse Audit**: Performance, accessibility, SEO analysis
- **Bundle Analysis**: Monitor bundle size and optimization

### 4. Infrastructure Management (`infrastructure.yml`)
**Triggers:** Infrastructure file changes, Manual dispatch

**Jobs:**
- **Validate Infrastructure**: Check Wrangler config, D1, KV, R2 setup
- **Database Migrations**: Apply SQL migrations to production
- **Infrastructure Monitoring**: Health checks and resource monitoring

### 5. Release Management (`release.yml`)
**Triggers:** Git tags (`v*`)

**Jobs:**
- **Create Release**: Generate changelog, create GitHub releases

## 🔧 Required Secrets

Configure these secrets in your GitHub repository settings:

### Cloudflare
- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token with Workers and Pages permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Optional
- `SNYK_TOKEN`: Snyk API token for security scanning
- `JWT_SECRET`: JWT secret for backend authentication (fallback to test key in CI)

## 📝 Environment Setup

### 1. Cloudflare API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with these permissions:
   - **Zone:Zone Settings:Edit**
   - **Zone:Zone:Read**
   - **Account:Cloudflare Workers:Edit**
   - **Account:Account Settings:Read**
   - **Account:Cloudflare Pages:Edit**

### 2. GitHub Secrets Configuration
```bash
# Add secrets via GitHub CLI
gh secret set CLOUDFLARE_API_TOKEN --body "your-api-token"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "your-account-id"

# Optional security scanning
gh secret set SNYK_TOKEN --body "your-snyk-token"
```

### 3. Cloudflare Resources Setup
The workflows will automatically create these resources if they don't exist:
- **D1 Database**: `primo-poker-db`
- **KV Namespace**: `SESSION_STORE`
- **R2 Bucket**: `primo-poker-hand-history-preview`
- **Analytics Engine**: `primo-poker-metrics`

## 🎯 Workflow Features

### Smart Change Detection
- Only runs relevant jobs when specific paths change
- Optimizes CI/CD runtime and costs
- Caches build artifacts for faster subsequent runs

### Parallel Execution
- Jobs run in parallel where possible
- Independent frontend/backend deployments
- Separate testing phases for faster feedback

### Error Handling
- Graceful failure handling with continue-on-error
- Artifact uploads for debugging failed runs
- Health checks after deployments

### Performance Optimization
- Build artifact caching
- Dependency caching
- Conditional job execution

## 📊 Monitoring and Reporting

### Test Reports
- Unit test results and coverage reports
- E2E test screenshots and videos
- Lighthouse performance scores

### Security Reports
- Dependency vulnerability scanning
- SARIF uploads for GitHub Security tab
- Automated security advisories

### Deployment Status
- Real-time deployment notifications
- Health check verification
- Performance regression detection

## 🔄 Deployment Process

### Automatic Deployments
1. **Push to main** → Triggers full CI/CD pipeline
2. **Build & Test** → All tests must pass
3. **Deploy Backend** → Cloudflare Workers deployment
4. **Deploy Frontend** → Cloudflare Pages deployment
5. **Health Check** → Verify both services are running

### Manual Deployments
```bash
# Trigger infrastructure workflow
gh workflow run infrastructure.yml

# Create a release
git tag v1.0.0
git push origin v1.0.0
```

## 🛠️ Local Development

### Run CI Scripts Locally
```bash
# Full CI pipeline simulation
npm run ci:setup    # Install dependencies
npm run ci:build    # Build all packages
npm run ci:test     # Run all tests
npm run ci:deploy   # Deploy (requires Cloudflare credentials)

# Individual steps
npm run lint:fix              # Fix linting issues
npm run type-check           # TypeScript validation
npm run test:e2e             # E2E tests
npm run security:audit       # Security audit
```

### Pre-commit Hooks
The repository includes Husky pre-commit hooks that run:
- ESLint with auto-fix
- Prettier formatting
- Type checking

## 📈 Performance Benchmarks

### Target Metrics
- **Lighthouse Performance**: > 80
- **First Contentful Paint**: < 2s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1

### Bundle Size Limits
- **Main bundle**: < 100KB gzipped
- **Vendor bundle**: < 200KB gzipped
- **Total assets**: < 500KB

## 🚨 Troubleshooting

### Common Issues

#### Deployment Failures
- Check Cloudflare API token permissions
- Verify account ID is correct
- Ensure resource quotas aren't exceeded

#### Test Failures
- E2E tests may fail if servers don't start properly
- Check for port conflicts in CI environment
- Review test artifacts for debugging

#### Build Errors
- TypeScript errors will fail the build
- ESLint errors (not warnings) will fail quality checks
- Missing dependencies will cause build failures

### Getting Help
1. Check workflow run logs in GitHub Actions
2. Review uploaded artifacts for detailed error information
3. Use manual workflow dispatch for debugging
4. Check Cloudflare dashboard for deployment status

## 🔮 Future Enhancements

- **Blue-Green Deployments**: Zero-downtime deployments
- **Canary Releases**: Gradual rollouts with monitoring
- **Multi-Environment Support**: Staging and production environments
- **Advanced Monitoring**: APM integration and alerting
- **Database Backup/Restore**: Automated backup strategies