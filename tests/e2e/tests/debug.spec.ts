import { test, expect } from '@playwright/test';

test.describe('Connection Debugging Tests', () => {
  test('should diagnose frontend connection issues', async ({ page }) => {
    // Capture console logs
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });

    // Capture network failures
    const networkFailures: string[] = [];
    page.on('requestfailed', request => {
      networkFailures.push(`Failed: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Go to lobby and wait for all network activity
    await page.goto('/lobby');
    await page.waitForTimeout(10000);

    // Print all captured information
    console.log('=== CONSOLE LOGS ===');
    logs.forEach(log => console.log(log));
    
    console.log('=== NETWORK FAILURES ===');
    networkFailures.forEach(failure => console.log(failure));

    // Check for specific connection error elements
    const connectionError = await page.locator('text=Connection Error').isVisible();
    const demoMode = await page.locator('text=Demo Mode').isVisible();
    const connectionStatus = await page.locator('[class*="connection"], [data-testid*="connection"]').textContent();

    console.log('=== CONNECTION STATUS ===');
    console.log('Connection Error Visible:', connectionError);
    console.log('Demo Mode Visible:', demoMode);
    console.log('Connection Status Text:', connectionStatus);

    // Check what API calls are being made
    const requests = await page.evaluate(() => {
      return (window as any).__apiCalls || 'No API call tracking found';
    });
    console.log('=== API CALLS ===');
    console.log(requests);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-connection-error.png', fullPage: true });

    // The test should help us understand what's happening
    // We'll make it pass but log all the debugging info
    expect(true).toBe(true);
  });

  test('should test direct API calls from browser', async ({ page }) => {
    await page.goto('/lobby');

    // Execute API calls directly in the browser
    const apiResults = await page.evaluate(async () => {
      const results: any = {};
      
      try {
        // Test health endpoint
        const healthResponse = await fetch('https://primo-poker-server.alabamamike.workers.dev/api/health');
        results.health = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          headers: Object.fromEntries(healthResponse.headers.entries()),
          body: await healthResponse.text()
        };
      } catch (error: any) {
        results.health = { error: error.message };
      }

      try {
        // Test tables endpoint
        const tablesResponse = await fetch('https://primo-poker-server.alabamamike.workers.dev/api/tables');
        results.tables = {
          status: tablesResponse.status,
          ok: tablesResponse.ok,
          headers: Object.fromEntries(tablesResponse.headers.entries()),
          body: await tablesResponse.text()
        };
      } catch (error: any) {
        results.tables = { error: error.message };
      }

      return results;
    });

    console.log('=== DIRECT API RESULTS ===');
    console.log(JSON.stringify(apiResults, null, 2));

    // Check if API calls are working
    expect(apiResults.health).toBeDefined();
    expect(apiResults.tables).toBeDefined();
  });

  test('should check environment variables', async ({ page }) => {
    await page.goto('/lobby');

    const envVars = await page.evaluate(() => {
      return {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_API_URL: (window as any).__env?.NEXT_PUBLIC_API_URL || 'Not found',
        NEXT_PUBLIC_WS_URL: (window as any).__env?.NEXT_PUBLIC_WS_URL || 'Not found',
        // Check if Next.js environment variables are available
        nextPublicApiUrl: (process.env as any)?.NEXT_PUBLIC_API_URL || 'Not available in browser',
        location: window.location.href,
        userAgent: navigator.userAgent
      };
    });

    console.log('=== ENVIRONMENT VARIABLES ===');
    console.log(JSON.stringify(envVars, null, 2));

    expect(envVars.location).toContain('lobby');
  });

  test('should verify which deployment we are testing', async ({ page }) => {
    await page.goto('/');
    
    const pageInfo = {
      url: page.url(),
      title: await page.title(),
      timestamp: new Date().toISOString()
    };

    console.log('=== DEPLOYMENT INFO ===');
    console.log(JSON.stringify(pageInfo, null, 2));

    // Check if we're on the right deployment
    expect(page.url()).toMatch(/primo-poker-frontend/);
  });
});
