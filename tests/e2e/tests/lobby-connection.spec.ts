import { test, expect } from '@playwright/test';

test.describe('Lobby Connection Tests', () => {
  test('should load lobby page without connection errors', async ({ page }) => {
    // Monitor console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Monitor network failures
    const networkErrors: any[] = [];
    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()?.errorText
      });
    });

    console.log('=== NAVIGATING TO LOBBY ===');
    await page.goto('/lobby');
    
    // Wait for page to load
    await page.waitForTimeout(5000);
    
    console.log('=== CONSOLE ERRORS ===');
    consoleErrors.forEach(error => console.log('Console Error:', error));
    
    console.log('=== NETWORK ERRORS ===');
    networkErrors.forEach(error => console.log('Network Error:', error));
    
    // Check if the page loaded successfully
    const title = await page.title();
    console.log('Page title:', title);
    
    // Look for connection error messages
    const connectionErrors = await page.$$eval('*', elements => {
      return elements
        .map(el => el.textContent || '')
        .filter(text => text.includes('Connection Error') || text.includes('Connection failed'))
        .slice(0, 5); // Limit to avoid too much output
    });
    
    console.log('=== CONNECTION ERROR MESSAGES ===');
    connectionErrors.forEach(error => console.log('Connection Error Found:', error));
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'lobby-test.png', fullPage: true });
    
    console.log('=== TEST COMPLETE ===');
    console.log('Total console errors:', consoleErrors.length);
    console.log('Total network errors:', networkErrors.length);
    console.log('Connection error messages found:', connectionErrors.length);
  });
});
