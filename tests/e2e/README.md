# Primo Poker E2E Testing

End-to-end testing suite for the Primo Poker platform using Playwright.

## 🎯 Purpose

This test suite is designed to:
- **Debug connection issues** between frontend and backend
- **Verify authentication flows** (registration, login with email/username)
- **Test lobby functionality** and real-time updates
- **Validate API connectivity** and CORS settings
- **Monitor performance** and response times

## 🚀 Quick Start

### Setup
```bash
cd tests/e2e
node setup.js
```

### Run Tests
```bash
# Run all tests (headless)
npm test

# Run with browser UI (see what's happening)
npm run test:headed

# Debug mode (step through tests)
npm run test:debug

# Interactive UI mode
npm run test:ui

# View test report
npm run test:report
```

## 🔍 Connection Debugging

To debug the current connection issues:

```bash
# Run the debug test to see detailed logs
npx playwright test debug.spec.ts --headed

# Run lobby tests to identify connection problems
npx playwright test lobby.spec.ts --headed
```

## 📋 Test Suites

### `auth.spec.ts`
- User registration and login flows
- Email vs username login testing
- Input validation and error handling

### `lobby.spec.ts`
- Connection status monitoring  
- Table loading and display
- Demo mode fallback testing
- Network request analysis

### `api.spec.ts`
- Direct API endpoint testing
- CORS validation
- Authentication API testing
- Performance monitoring

### `debug.spec.ts` ⭐
- **Connection issue diagnosis**
- Console log capture
- Network failure analysis
- Environment variable checking
- Screenshot capture for debugging

## 🐛 Debugging Connection Issues

The `debug.spec.ts` test is specifically designed to help identify why the frontend shows "Connection Error". It will:

1. **Capture console logs** from the browser
2. **Monitor network requests** and failures
3. **Test direct API calls** from the browser
4. **Check environment variables** and configuration
5. **Take screenshots** of the error state
6. **Analyze connection status** elements

Run it with:
```bash
npx playwright test debug.spec.ts --headed --reporter=line
```

## 📊 Test Results

- **Screenshots**: Saved on test failures
- **Videos**: Recorded for failed tests
- **Traces**: Available for debugging
- **Reports**: HTML report with detailed results

## 🔧 Configuration

Edit `playwright.config.ts` to:
- Change base URLs for different environments
- Modify browser configurations
- Adjust timeouts and retry settings
- Configure test reporters

## 🌐 Environment Variables

Tests use these environment variables:
- `BASE_URL`: Frontend URL to test against
- `NEXT_PUBLIC_API_URL`: Backend API URL
- `NEXT_PUBLIC_WS_URL`: WebSocket URL

## 📝 Writing New Tests

Example test structure:
```typescript
import { test, expect } from '@playwright/test';

test('should test something', async ({ page }) => {
  await page.goto('/lobby');
  await expect(page.locator('text=Expected Text')).toBeVisible();
});
```

## 🚨 Current Issues Being Tested

1. **Connection Error in Lobby**: Frontend shows "Connection failed"
2. **API Connectivity**: Verifying backend endpoints are reachable
3. **Environment Configuration**: Checking if URLs are configured correctly
4. **CORS Issues**: Testing cross-origin requests
5. **Authentication Flow**: Email vs username login problems

## 📞 Support

If tests reveal issues:
1. Check the HTML test report for detailed failure information
2. Look at screenshots in `test-results/`
3. Review console logs printed by debug tests
4. Verify API endpoints are responding correctly
