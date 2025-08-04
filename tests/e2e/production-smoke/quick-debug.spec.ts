import { test, expect } from '@playwright/test';

test.describe('Quick Production Debug', () => {
  test('Check production site accessibility', async ({ page }) => {
    console.log('Starting production debug test...');
    
    // Try to access the production site
    console.log('Navigating to: https://6e77d385.primo-poker-frontend.pages.dev');
    const response = await page.goto('https://6e77d385.primo-poker-frontend.pages.dev', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log(`Response status: ${response?.status()}`);
    console.log(`Response URL: ${response?.url()}`);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/production-home.png', fullPage: true });
    
    // Check page title
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Check for any error messages
    const bodyText = await page.textContent('body');
    console.log(`Body text preview: ${bodyText?.substring(0, 200)}...`);
    
    // Check console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });
    
    // Wait a bit to catch any delayed errors
    await page.waitForTimeout(2000);
    
    // Try navigating to login page
    console.log('\nTrying to navigate to login page...');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/auth/login', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.screenshot({ path: 'test-results/production-login.png', fullPage: true });
    
    // Check if login form exists
    const emailInput = await page.locator('input[placeholder*="email" i]').count();
    const passwordInput = await page.locator('input[type="password"]').count();
    
    console.log(`Email input found: ${emailInput > 0}`);
    console.log(`Password input found: ${passwordInput > 0}`);
  });
});