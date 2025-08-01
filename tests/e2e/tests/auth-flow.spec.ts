import { test, expect } from '@playwright/test';

test.describe('Authentication Flow Tests', () => {
  test('should complete full login flow and reach lobby', async ({ page }) => {
    // Monitor network requests
    const networkLogs: any[] = [];
    page.on('response', response => {
      networkLogs.push({
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      });
    });

    // Monitor console logs
    const consoleLogs: any[] = [];
    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    });

    console.log('=== STEP 1: Visit home page ===');
    await page.goto('/');
    await page.waitForTimeout(2000);

    console.log('=== STEP 2: Click Login button ===');
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(2000);

    console.log('=== STEP 3: Fill login form ===');
    // Try with a test user first
    await page.fill('input[type="email"], input[name="email"]', 'test@example.com');
    await page.fill('input[type="password"], input[name="password"]', 'password123');

    console.log('=== STEP 4: Submit login form ===');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000); // Wait for login to process

    // Check current URL after login attempt
    const loginUrl = page.url();
    console.log('=== STEP 5: URL after login attempt ===');
    console.log('Current URL:', loginUrl);

    // Try to navigate to lobby manually
    console.log('=== STEP 6: Navigate to lobby ===');
    await page.goto('/lobby');
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    console.log('=== STEP 7: Final URL ===');
    console.log('Final URL:', finalUrl);

    // Check what's on the page
    const pageTitle = await page.title();
    const pageContent = await page.textContent('body');
    
    console.log('=== PAGE ANALYSIS ===');
    console.log('Page Title:', pageTitle);
    console.log('Page contains "Login":', pageContent?.includes('Login'));
    console.log('Page contains "lobby":', pageContent?.includes('lobby'));
    console.log('Page contains "Connection":', pageContent?.includes('Connection'));
    console.log('Page contains "Demo Mode":', pageContent?.includes('Demo Mode'));

    // Print network requests related to auth
    console.log('=== AUTH-RELATED NETWORK REQUESTS ===');
    const authRequests = networkLogs.filter(log => 
      log.url.includes('/api/auth') || 
      log.url.includes('/login') || 
      log.url.includes('/lobby') ||
      log.status >= 400
    );
    authRequests.forEach(req => {
      console.log(`${req.status} ${req.url}`);
    });

    // Print console errors
    console.log('=== CONSOLE ERRORS ===');
    const errors = consoleLogs.filter(log => log.type === 'error');
    errors.forEach(error => {
      console.log('Error:', error.text);
    });

    // Check if we're still on login page
    const isOnLoginPage = finalUrl.includes('/auth/login') || pageContent?.includes('Sign In');
    
    console.log('=== FINAL ASSESSMENT ===');
    console.log('Is on login page:', isOnLoginPage);
    console.log('Total network requests:', networkLogs.length);
    console.log('Total console errors:', errors.length);
  });

  test('should test registration flow', async ({ page }) => {
    console.log('=== REGISTRATION FLOW TEST ===');
    
    await page.goto('/');
    await page.click('button:has-text("Sign Up")');
    await page.waitForTimeout(2000);

    // Fill registration form
    const timestamp = Date.now();
    const testEmail = `test${timestamp}@example.com`;
    
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', `testuser${timestamp}`);
    await page.fill('input[name="password"]', 'password123');
    
    console.log('=== Registering with email:', testEmail);
    
    await page.click('button:has-text("Sign Up")');
    await page.waitForTimeout(5000);

    const regUrl = page.url();
    console.log('URL after registration:', regUrl);

    // Try to login with the new user
    if (regUrl.includes('/auth/login')) {
      console.log('=== Attempting login with new user ===');
      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("Sign In")');
      await page.waitForTimeout(5000);

      const finalUrl = page.url();
      console.log('Final URL after new user login:', finalUrl);
    }
  });

  test('should check if API endpoints are reachable from frontend context', async ({ page }) => {
    console.log('=== TESTING API ACCESSIBILITY FROM FRONTEND ===');
    
    await page.goto('/');
    
    // Test API calls from the browser context using the config system
    const apiTests = await page.evaluate(async () => {
      const results: any = {};
      
      // Import config helper (assuming it's available in browser context)
      const getApiUrl = () => {
        if (typeof process !== 'undefined' && process.env?.API_BASE_URL) {
          return process.env.API_BASE_URL;
        }
        return 'https://primo-poker-server.alabamamike.workers.dev';
      };
      
      const apiBaseUrl = getApiUrl();
      console.log('Testing with API base URL:', apiBaseUrl);
      
      try {
        // Test health endpoint
        const healthResponse = await fetch(`${apiBaseUrl}/api/health`);
        results.health = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          text: await healthResponse.text()
        };
      } catch (error) {
        results.health = { error: (error as Error).message };
      }

      try {
        // Test tables endpoint
        const tablesResponse = await fetch(`${apiBaseUrl}/api/tables`);
        results.tables = {
          status: tablesResponse.status,
          ok: tablesResponse.ok,
          text: await tablesResponse.text()
        };
      } catch (error) {
        results.tables = { error: (error as Error).message };
      }

      try {
        // Test auth endpoint
        const authResponse = await fetch(`${apiBaseUrl}/api/auth/me`);
        results.authMe = {
          status: authResponse.status,
          ok: authResponse.ok,
          text: await authResponse.text()
        };
      } catch (error) {
        results.authMe = { error: (error as Error).message };
      }

      return results;
    });

    console.log('=== API TEST RESULTS FROM BROWSER ===');
    console.log(JSON.stringify(apiTests, null, 2));
  });
});
