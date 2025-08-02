# Primo Poker Production Smoke Tests

This test suite provides comprehensive smoke testing for the Primo Poker platform's production environment, covering the complete user journey from login through gameplay.

## Prerequisites

- Node.js 18+ and npm
- Playwright Test framework
- Valid test account credentials for the production environment
- Network access to the production site

## Setup Instructions

### 1. Install Dependencies

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. Environment Configuration

Create a `.env` file in the project root with your test credentials:

```bash
# Required credentials
TEST_USERNAME=your_test_username
TEST_PASSWORD=your_test_password

# Optional - only if 2FA is enabled
TEST_2FA_CODE=your_2fa_code

# Optional - production URL (defaults to https://primo-poker.com)
PRODUCTION_URL=https://your-production-url.com
```

### 3. Test Data Setup

Ensure your test account has:
- Sufficient chip balance for buy-ins (minimum 200 chips recommended)
- Access to create tables
- No active sessions that might interfere with tests

## Running the Tests

### Run all smoke tests
```bash
npx playwright test --config=playwright.production.config.ts
```

### Run specific browser tests
```bash
# Desktop browsers
npx playwright test --config=playwright.production.config.ts --project=chromium-production
npx playwright test --config=playwright.production.config.ts --project=firefox-production
npx playwright test --config=playwright.production.config.ts --project=webkit-production

# Mobile browsers
npx playwright test --config=playwright.production.config.ts --project=mobile-chrome-production
npx playwright test --config=playwright.production.config.ts --project=mobile-safari-production
```

### Run in headed mode (see browser)
```bash
npx playwright test --config=playwright.production.config.ts --headed
```

### Run with debugging
```bash
npx playwright test --config=playwright.production.config.ts --debug
```

### Run specific test
```bash
npx playwright test --config=playwright.production.config.ts -g "User Authentication"
```

## Test Suite Overview

The smoke test suite includes the following scenarios:

1. **User Authentication Test**
   - Login with valid credentials
   - 2FA handling (if enabled)
   - Session verification

2. **Lobby Navigation Test**
   - Table list display
   - Filtering functionality
   - Balance display
   - Responsive design verification

3. **Table Selection and Seating Test**
   - Table selection from lobby
   - Seat availability checking
   - Buy-in process
   - Chip stack verification

4. **Gameplay Test**
   - Card dealing verification
   - Player action testing (check/call/fold)
   - Hand progression observation
   - Pot updates and winner determination

5. **Table Exit Test**
   - Leave table functionality
   - Return to lobby
   - Balance update verification
   - Session cleanup

6. **Table Creation Test**
   - Private cash game creation
   - Table parameter configuration
   - Lobby appearance verification
   - Auto-seating confirmation

## Test Reports

### HTML Report
```bash
# Generate and view HTML report
npx playwright show-report playwright-report-production
```

### JSON Report
Test results are saved to: `test-results/production-results.json`

### Screenshots
Failed test screenshots are saved to: `test-results/screenshots/`

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Production Smoke Tests
on:
  schedule:
    - cron: '0 */4 * * *'  # Run every 4 hours
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test --config=playwright.production.config.ts
        env:
          TEST_USERNAME: ${{ secrets.TEST_USERNAME }}
          TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report-production/
          retention-days: 30
```

## Configuration Options

### Timeouts
Modify in `playwright.production.config.ts`:
- `actionTimeout`: 30s (UI interactions)
- `navigationTimeout`: 30s (page navigation)
- `timeout`: 5m (total test timeout)

### Retry Policy
- Tests retry 2 times on failure
- Configurable in `playwright.production.config.ts`

### Parallel Execution
- Disabled by default (`fullyParallel: false`)
- Single worker to prevent session conflicts

## Troubleshooting

### Common Issues

1. **Login failures**
   - Verify credentials in `.env` file
   - Check for account lockouts
   - Ensure 2FA code is current

2. **Timeout errors**
   - Check network connectivity
   - Increase timeout values if needed
   - Verify production site is accessible

3. **Table creation failures**
   - Ensure sufficient chip balance
   - Check table name uniqueness
   - Verify create table permissions

4. **WebSocket connection issues**
   - Check firewall/proxy settings
   - Verify WebSocket support
   - Review browser console logs

### Debug Mode
```bash
# Run with Playwright Inspector
PWDEBUG=1 npx playwright test --config=playwright.production.config.ts

# Enable verbose logging
DEBUG=pw:api npx playwright test --config=playwright.production.config.ts
```

## Best Practices

1. **Test Isolation**
   - Each test should be independent
   - Clean up created resources
   - Use unique table names

2. **Error Handling**
   - Tests include retry logic for flaky operations
   - Screenshots captured on failure
   - Detailed error messages in reports

3. **Performance**
   - Total suite execution target: < 5 minutes
   - Individual test timeout: appropriate for operation
   - Efficient waiting strategies

4. **Security**
   - Never commit credentials to version control
   - Use environment variables or secrets management
   - Rotate test account credentials regularly

## Limitations

- Tests use dedicated test accounts
- Cannot test real money transactions
- Some production features may be restricted
- Rate limiting may affect test execution
- Anti-automation measures may require adjustments

## Maintenance

- Review and update selectors quarterly
- Update test data and credentials as needed
- Monitor test execution times
- Address flaky tests promptly
- Keep Playwright version current

## Support

For issues or questions:
- Check test execution logs
- Review HTML report for details
- Consult Playwright documentation
- Contact QA team for test account issues