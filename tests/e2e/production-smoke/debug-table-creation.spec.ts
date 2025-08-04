import { test, expect } from '@playwright/test';

test.describe('Debug Table Creation', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Create table and capture error details', async ({ page }) => {
    // Monitor console for errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Console error:', msg.text());
      }
    });

    // Monitor network requests
    page.on('response', response => {
      if (response.status() >= 400) {
        console.log(`HTTP ${response.status()} - ${response.url()}`);
        response.text().then(text => {
          console.log('Response body:', text);
        }).catch(() => {});
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
    
    // Click Create Table
    await page.click('button:has-text("Create Table")');
    await page.waitForTimeout(1000);
    
    // Check if modal opened
    const modalVisible = await page.locator('text=Create New Table').isVisible();
    console.log('Create table modal visible:', modalVisible);
    
    if (modalVisible) {
      // Fill in table details
      await page.fill('input[placeholder="Enter table name"]', `Test Table ${Date.now()}`);
      
      // Check for game type selector
      const gameTypeSelect = page.locator('select').first();
      if (await gameTypeSelect.isVisible()) {
        await gameTypeSelect.selectOption('no_limit_holdem');
      }
      
      // Fill in numeric fields
      await page.fill('input[placeholder="Small blind amount"]', '1');
      await page.fill('input[placeholder="Big blind amount"]', '2');
      await page.fill('input[placeholder="Minimum buy-in"]', '100');
      await page.fill('input[placeholder="Maximum buy-in"]', '500');
      
      // Submit form
      const submitButton = page.locator('button:has-text("Create Table")').last();
      
      // Wait for response
      const responsePromise = page.waitForResponse(resp => 
        resp.url().includes('/api/tables') && resp.request().method() === 'POST'
      );
      
      await submitButton.click();
      
      try {
        const response = await responsePromise;
        console.log('Create table response status:', response.status());
        const responseBody = await response.text();
        console.log('Create table response body:', responseBody);
        
        if (response.status() >= 400) {
          // Try to parse error details
          try {
            const errorData = JSON.parse(responseBody);
            console.log('Error details:', JSON.stringify(errorData, null, 2));
          } catch {
            console.log('Raw error response:', responseBody);
          }
        }
      } catch (error) {
        console.log('Failed to capture response:', error);
      }
      
      // Check for error messages in UI
      await page.waitForTimeout(2000);
      const errorMessage = await page.locator('text=/error|failed|internal server error/i').first().textContent().catch(() => null);
      if (errorMessage) {
        console.log('UI error message:', errorMessage);
      }
      
      // Take screenshot
      await page.screenshot({ path: 'table-creation-error.png', fullPage: true });
    }
  });
});