import { test, expect } from '@playwright/test';
import { getTestConfig, logTestStep } from './utils/test-helpers';

test.describe('Simple User Journey', () => {
  const config = getTestConfig();

  test('Login and navigate to multiplayer', async ({ page }) => {
    await test.step('1. Navigate to login', async () => {
      await logTestStep(page, 'Going to login page');
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');
    });

    await test.step('2. Fill login form', async () => {
      await logTestStep(page, 'Filling login form');
      
      // Fill username
      await page.fill('input[name="username"], input[placeholder*="username"], input[type="text"]', config.credentials.username);
      
      // Fill password
      await page.fill('input[name="password"], input[placeholder*="password"], input[type="password"]', config.credentials.password);
      
      // Click login button
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
      
      // Wait for navigation
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
      await logTestStep(page, 'Login submitted');
    });

    await test.step('3. Navigate to multiplayer', async () => {
      await logTestStep(page, 'Navigating to multiplayer');
      
      // If we're on a lobby page with demo mode, click Enter Multiplayer
      const enterMultiplayerButton = page.locator('button:has-text("Enter Multiplayer")');
      if (await enterMultiplayerButton.isVisible({ timeout: 5000 })) {
        await enterMultiplayerButton.click();
        await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
      } else {
        // Otherwise navigate directly
        await page.goto('/multiplayer');
      }
      
      await page.waitForLoadState('networkidle');
      await logTestStep(page, 'On multiplayer page');
    });

    await test.step('4. Verify multiplayer lobby', async () => {
      await logTestStep(page, 'Verifying multiplayer lobby');
      
      // Should see create table button
      const createButton = page.locator('button:has-text("Create Table")');
      await expect(createButton).toBeVisible({ timeout: 10000 });
      
      // Check for connection status
      const connectionStatus = await page.locator('text=/connected|connecting|disconnected/i').textContent();
      await logTestStep(page, `Connection status: ${connectionStatus}`);
      
      // Take screenshot
      await page.screenshot({ 
        path: 'test-results/multiplayer-lobby.png',
        fullPage: true 
      });
    });

    await test.step('5. Create a table', async () => {
      await logTestStep(page, 'Creating a table');
      
      const createButton = page.locator('button:has-text("Create Table")');
      await createButton.click();
      
      // Should navigate to game page
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      
      const gameUrl = page.url();
      const tableId = gameUrl.split('/game/')[1];
      await logTestStep(page, `Table created: ${tableId}`);
      
      // Take screenshot of game table
      await page.screenshot({ 
        path: 'test-results/game-table.png',
        fullPage: true 
      });
    });

    await test.step('6. Verify game table loaded', async () => {
      await logTestStep(page, 'Verifying game table');
      
      // Wait for poker table to load
      await page.waitForLoadState('networkidle');
      
      // Check for poker table container
      const tableVisible = await page.locator('.poker-table, #game-container, .game-room').isVisible({ timeout: 10000 });
      expect(tableVisible).toBeTruthy();
      
      await logTestStep(page, 'Game table loaded successfully');
    });
  });
});