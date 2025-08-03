import { test, expect } from '@playwright/test';
import { getTestConfig, logTestStep } from './utils/test-helpers';

test.describe('Production E2E Test', () => {
  const config = getTestConfig();

  test('Complete multiplayer flow', async ({ page }) => {
    // Use the test user's email for login
    const testEmail = 'e2e_test_1754187899779@example.com';
    const testPassword = 'TestPass123!_1754187899779';
    
    await test.step('1. Login', async () => {
      await logTestStep(page, 'Navigating to login');
      await page.goto('/auth/login');
      
      // Fill email (the form uses email, not username)
      await page.fill('input[placeholder*="email"]', testEmail);
      
      // Fill password
      await page.fill('input[type="password"]', testPassword);
      
      // Click sign in
      await page.click('button:has-text("Sign In")');
      
      // Wait for redirect
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
      await logTestStep(page, 'Login successful');
    });

    await test.step('2. Navigate to multiplayer', async () => {
      const currentUrl = page.url();
      await logTestStep(page, `Current URL after login: ${currentUrl}`);
      
      // Check if we need to navigate to multiplayer
      if (!currentUrl.includes('/multiplayer')) {
        // Click Enter Multiplayer if available
        const enterButton = page.locator('button:has-text("Enter Multiplayer")');
        if (await enterButton.isVisible({ timeout: 3000 })) {
          await enterButton.click();
        } else {
          await page.goto('/multiplayer');
        }
      }
      
      await page.waitForLoadState('networkidle');
    });

    await test.step('3. Create table', async () => {
      await logTestStep(page, 'Creating table');
      
      // Wait for and click create table button
      const createButton = page.locator('button:has-text("Create Table")');
      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();
      
      // Wait for redirect to game
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      
      const tableId = page.url().split('/game/')[1];
      await logTestStep(page, `Table created: ${tableId}`);
    });

    await test.step('4. Verify game page', async () => {
      await logTestStep(page, 'Verifying game page');
      await page.waitForLoadState('networkidle');
      
      // Take screenshot
      await page.screenshot({ 
        path: 'test-results/production-game-table.png',
        fullPage: true 
      });
      
      // Check for game elements
      const gameVisible = await page.locator('.poker-table, .game-room, #game-container').isVisible({ timeout: 10000 });
      expect(gameVisible).toBeTruthy();
      
      await logTestStep(page, 'Game table loaded successfully');
    });
    
    // Final summary
    await logTestStep(page, '✅ All tests passed! Multiplayer cash game flow is working.');
  });
});