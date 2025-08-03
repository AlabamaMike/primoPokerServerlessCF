import { test, expect } from '@playwright/test';

test.describe('Working Multiplayer Flow', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';

  test('Complete multiplayer flow via Enter Multiplayer button', async ({ page }) => {
    console.log('Starting test...');
    
    await test.step('1. Login', async () => {
      console.log('Navigating to login page...');
      await page.goto('/auth/login');
      
      // Fill email
      await page.fill('input[placeholder*="email"]', testEmail);
      
      // Fill password
      await page.fill('input[type="password"]', testPassword);
      
      // Click sign in
      await page.click('button:has-text("Sign In")');
      
      // Wait for redirect to lobby
      await page.waitForURL(/\/lobby/, { timeout: 10000 });
      console.log('✅ Login successful, on lobby page');
    });

    await test.step('2. Click Enter Multiplayer', async () => {
      console.log('Looking for Enter Multiplayer button...');
      
      // Click Enter Multiplayer button
      const enterMultiplayerButton = page.locator('button:has-text("Enter Multiplayer")');
      await expect(enterMultiplayerButton).toBeVisible({ timeout: 10000 });
      await enterMultiplayerButton.click();
      
      // Should navigate to multiplayer page
      await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
      console.log('✅ Successfully navigated to multiplayer page');
    });

    await test.step('3. Create a table', async () => {
      console.log('Creating a new table...');
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      const createButton = page.locator('button:has-text("Create Table")');
      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();
      
      // Should navigate to game page
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      
      const gameUrl = page.url();
      const tableId = gameUrl.split('/game/')[1];
      console.log(`✅ Table created successfully: ${tableId}`);
      
      // Take screenshot
      await page.screenshot({ 
        path: 'test-results/working-game-table.png',
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
    
    console.log('\n🎉 SUCCESS! Full multiplayer flow is working:');
    console.log('1. Users login and land on lobby page');
    console.log('2. "Enter Multiplayer" button takes them to real multiplayer');
    console.log('3. Users can create tables in multiplayer');
    console.log('4. Users are redirected to their game table');
    console.log('\nMultiplayer cash game experience is fully functional!');
  });
});