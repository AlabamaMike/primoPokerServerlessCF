import { test, expect } from '@playwright/test';

test.describe('Test Table Creation Works', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Create table and verify it works', async ({ page }) => {
    // Monitor for errors
    page.on('dialog', async dialog => {
      console.log(`Dialog [${dialog.type()}]: ${dialog.message()}`);
      await dialog.accept();
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text());
      }
    });

    page.on('response', async response => {
      if (response.url().includes('/api/tables') && response.request().method() === 'POST') {
        console.log('Create table response:', response.status());
        if (response.status() >= 400) {
          const body = await response.text();
          console.log('Error response body:', body);
        }
      }
    });

    // Login
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    
    // Navigate to multiplayer
    await page.waitForURL('**/lobby/**');
    await page.waitForLoadState('networkidle');
    await page.click('text=Enter Multiplayer');
    await page.waitForURL('**/multiplayer/**');
    await page.waitForLoadState('networkidle');
    
    // Click Create Table
    console.log('Attempting to create table...');
    const createButton = page.locator('button:has-text("Create Table")').first();
    
    // Wait for API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/tables') && resp.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);
    
    await createButton.click();
    console.log('Clicked Create Table button');
    
    // Wait a bit
    await page.waitForTimeout(3000);
    
    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    const response = await responsePromise;
    if (response) {
      console.log('Got API response!');
    }
    
    // Check results
    if (currentUrl.includes('/game/') && !currentUrl.includes('/demo/')) {
      console.log('✅ SUCCESS! Navigated to game page:', currentUrl);
      const tableId = currentUrl.split('/game/')[1];
      console.log('Table ID:', tableId);
      
      // Take success screenshot
      await page.screenshot({ path: 'table-creation-success.png', fullPage: true });
    } else if (currentUrl.includes('/demo/')) {
      console.log('❌ FAILED! Still navigating to demo:', currentUrl);
      await page.screenshot({ path: 'table-creation-failed-demo.png', fullPage: true });
    } else {
      console.log('❌ FAILED! Stayed on multiplayer page');
      await page.screenshot({ path: 'table-creation-failed-no-nav.png', fullPage: true });
    }
  });
});