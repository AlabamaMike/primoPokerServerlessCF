import { test, expect } from '@playwright/test';

test.describe('Simple Table Creation Test', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Click create table and observe behavior', async ({ page }) => {
    // Capture all dialogs (alerts, confirms, prompts)
    page.on('dialog', async dialog => {
      console.log(`Dialog type: ${dialog.type()}`);
      console.log(`Dialog message: ${dialog.message()}`);
      await dialog.accept();
    });

    // Monitor console for errors
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'log') {
        console.log(`Console [${msg.type()}]:`, msg.text());
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
    console.log('Clicking Create Table button');
    await page.click('button:has-text("Create Table")');
    
    // Wait a bit to see what happens
    await page.waitForTimeout(5000);
    
    // Check current URL
    const currentUrl = page.url();
    console.log('Current URL after clicking Create Table:', currentUrl);
    
    // Take screenshot
    await page.screenshot({ path: 'after-create-table-click.png', fullPage: true });
    
    // Check if we're still on multiplayer page or navigated to game
    if (currentUrl.includes('/game/')) {
      console.log('✅ Successfully navigated to game page');
    } else if (currentUrl.includes('/multiplayer')) {
      console.log('❌ Still on multiplayer page');
      
      // Look for any error messages
      const errorTexts = await page.locator('text=/error|failed/i').allTextContents();
      if (errorTexts.length > 0) {
        console.log('Found error messages:', errorTexts);
      }
    }
  });
});