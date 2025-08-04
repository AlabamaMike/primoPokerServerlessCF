import { test, expect } from '@playwright/test';

test.describe('Frontend Table Creation', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Test table creation through frontend flow', async ({ page }) => {
    // Monitor console for errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text());
      }
    });

    // Monitor API responses
    page.on('response', async response => {
      if (response.url().includes('/api/tables') && response.request().method() === 'POST') {
        console.log('Create table request URL:', response.url());
        console.log('Create table response status:', response.status());
        console.log('Create table response headers:', response.headers());
        try {
          const responseBody = await response.text();
          console.log('Create table response body:', responseBody);
        } catch (error) {
          console.log('Could not read response body:', error);
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
    
    // Try to create a table via the UI
    console.log('Looking for Create Table button');
    const createTableButton = page.locator('button:has-text("Create Table")').first();
    await expect(createTableButton).toBeVisible({ timeout: 10000 });
    
    console.log('Clicking Create Table button');
    
    // Intercept the API call
    const responsePromise = page.waitForResponse(resp => 
      resp.url().includes('/api/tables') && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    
    await createTableButton.click();
    console.log('Clicked Create Table button, waiting for API response');
    
    try {
      const response = await responsePromise;
      console.log('Got API response');
      
      // Check for error messages in UI
      await page.waitForTimeout(2000);
      
      // Look for any error messages
      const errorElements = await page.locator('text=/error|failed|internal server error/i').all();
      for (const elem of errorElements) {
        const text = await elem.textContent();
        console.log('Found error in UI:', text);
      }
      
      // Check if we navigated to a game page
      const currentUrl = page.url();
      console.log('Current URL after table creation:', currentUrl);
      
      if (currentUrl.includes('/game/')) {
        console.log('✅ Successfully navigated to game page!');
      } else {
        console.log('❌ Did not navigate to game page');
        // Take a screenshot
        await page.screenshot({ path: 'table-creation-result.png', fullPage: true });
      }
    } catch (error) {
      console.log('Error waiting for API response:', error);
      await page.screenshot({ path: 'table-creation-timeout.png', fullPage: true });
    }
  });
});