import { test, expect } from '@playwright/test';

test.describe('Test Multiplayer Working', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';

  test('Verify multiplayer is now working', async ({ page }) => {
    console.log('Testing fixed multiplayer functionality...');
    
    await test.step('1. Login', async () => {
      await page.goto('/auth/login');
      await page.fill('input[placeholder*="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button:has-text("Sign In")');
      await page.waitForURL(/\/lobby/, { timeout: 10000 });
      console.log('✅ Logged in successfully');
    });

    await test.step('2. Navigate to multiplayer', async () => {
      const enterButton = page.locator('button:has-text("Enter Multiplayer")');
      await expect(enterButton).toBeVisible({ timeout: 10000 });
      await enterButton.click();
      await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
      console.log('✅ Navigated to multiplayer page');
    });

    await test.step('3. Verify multiplayer page loads correctly', async () => {
      // Should show API Connected
      const apiStatus = page.locator('text="API Connected"');
      await expect(apiStatus).toBeVisible({ timeout: 10000 });
      console.log('✅ API connection shown');
      
      // Should have Create Table button
      const createButton = page.locator('button:has-text("Create Table")');
      await expect(createButton).toBeVisible();
      console.log('✅ Create Table button visible');
      
      // Should NOT show WebSocket disconnection error
      const disconnectError = page.locator('text=/disconnected|connection.*failed/i');
      const errorCount = await disconnectError.count();
      expect(errorCount).toBe(0);
      console.log('✅ No connection errors shown');
    });

    await test.step('4. Test table creation', async () => {
      console.log('Attempting to create a table...');
      
      const createButton = page.locator('button:has-text("Create Table")');
      await createButton.click();
      
      // Wait for either navigation or error
      await Promise.race([
        page.waitForURL(/\/game\//, { timeout: 30000 }).then(() => 'success'),
        page.locator('text=/failed|error/i').waitFor({ timeout: 5000 }).then(() => 'error')
      ]).then(async (result) => {
        if (result === 'success') {
          const url = page.url();
          const tableId = url.split('/game/')[1];
          console.log(`✅ Table created successfully! Table ID: ${tableId}`);
          console.log(`✅ Navigated to game page: ${url}`);
          
          // Take screenshot of game table
          await page.screenshot({ 
            path: 'test-results/working-multiplayer-game.png',
            fullPage: true 
          });
        } else {
          const errorText = await page.locator('text=/failed|error/i').first().textContent();
          console.log(`❌ Table creation failed with error: ${errorText}`);
          throw new Error('Table creation failed');
        }
      });
    });
    
    console.log('\n🎉 SUCCESS! Multiplayer is now fully functional:');
    console.log('- No WebSocket connection errors');
    console.log('- API connection working');
    console.log('- Table creation working');
    console.log('- Navigation to game tables working');
  });
});