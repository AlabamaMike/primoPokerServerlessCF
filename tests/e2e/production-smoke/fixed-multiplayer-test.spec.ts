import { test, expect } from '@playwright/test';

test.describe('Fixed Multiplayer Flow', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';

  test('Complete multiplayer flow with navigation fixes', async ({ page }) => {
    console.log('Starting test with fixed navigation...');
    
    await test.step('1. Login', async () => {
      console.log('Navigating to login page...');
      await page.goto('/auth/login');
      
      // Fill email
      await page.fill('input[placeholder*="email"]', testEmail);
      
      // Fill password
      await page.fill('input[type="password"]', testPassword);
      
      // Click sign in
      await page.click('button:has-text("Sign In")');
      
      // Should redirect to /multiplayer now
      await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
      console.log('✅ Login successful, redirected to multiplayer');
    });

    await test.step('2. Verify on multiplayer page', async () => {
      const url = page.url();
      expect(url).toContain('/multiplayer');
      console.log(`✅ On multiplayer page: ${url}`);
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Should see create table button
      const createButton = page.locator('button:has-text("Create Table")');
      await expect(createButton).toBeVisible({ timeout: 10000 });
      console.log('✅ Create Table button is visible');
    });

    await test.step('3. Create a table', async () => {
      console.log('Creating a new table...');
      
      const createButton = page.locator('button:has-text("Create Table")');
      await createButton.click();
      
      // Should navigate to game page
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      
      const gameUrl = page.url();
      const tableId = gameUrl.split('/game/')[1];
      console.log(`✅ Table created successfully: ${tableId}`);
      
      // Take screenshot
      await page.screenshot({ 
        path: 'test-results/multiplayer-game-table.png',
        fullPage: true 
      });
    });

    await test.step('4. Verify game table', async () => {
      console.log('Verifying game table loaded...');
      
      // Wait for game elements
      await page.waitForLoadState('networkidle');
      
      // Check for game container
      const gameElements = await page.locator('.poker-table, .game-room, #game-container, .table-container').count();
      expect(gameElements).toBeGreaterThan(0);
      
      console.log('✅ Game table loaded successfully');
    });
    
    console.log('\n🎉 SUCCESS! Multiplayer flow is working correctly:');
    console.log('- Users are redirected to /multiplayer after login');
    console.log('- Create Table button is functional');
    console.log('- Tables are created and users can navigate to them');
    console.log('- No more demo lobby blocking access');
  });
});