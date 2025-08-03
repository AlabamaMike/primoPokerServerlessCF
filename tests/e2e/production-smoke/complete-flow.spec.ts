import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login-page';
import { getTestConfig, logTestStep } from './utils/test-helpers';

test.describe('Complete User Journey', () => {
  const config = getTestConfig();

  test('Full multiplayer cash game flow', async ({ page }) => {
    const loginPage = new LoginPage(page);

    await test.step('1. Navigate to application', async () => {
      await logTestStep(page, 'Navigating to application');
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    await test.step('2. Login with test user', async () => {
      await logTestStep(page, 'Navigating to login');
      await page.goto('/login');
      await expect(page).toHaveURL(/\/login/);
      
      await logTestStep(page, 'Entering credentials');
      await loginPage.login(config.credentials.username, config.credentials.password);
      
      // Wait for redirect after login
      await page.waitForURL(/\/(lobby|multiplayer)/, { timeout: 10000 });
      await logTestStep(page, 'Login successful');
    });

    await test.step('3. Verify lobby page', async () => {
      await logTestStep(page, 'Verifying lobby page');
      
      // Check we're on the multiplayer/lobby page
      expect(page.url()).toMatch(/\/(lobby|multiplayer)/);
      
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');
      
      // Look for key lobby elements
      const createTableButton = page.locator('button:has-text("Create Table")');
      await expect(createTableButton).toBeVisible({ timeout: 10000 });
      
      // Check for tables section (might be empty)
      const tablesSection = page.locator('text="Available Tables"');
      await expect(tablesSection).toBeVisible();
      
      await logTestStep(page, 'Lobby loaded successfully');
    });

    await test.step('4. Create a new table', async () => {
      await logTestStep(page, 'Creating new table');
      
      const createButton = page.locator('button:has-text("Create Table")');
      await createButton.click();
      
      // Wait for navigation to game page
      await page.waitForURL(/\/game\//, { timeout: 30000 });
      
      const tableId = page.url().split('/game/')[1];
      await logTestStep(page, `Table created with ID: ${tableId}`);
    });

    await test.step('5. Verify game table page', async () => {
      await logTestStep(page, 'Verifying game table page');
      
      // Wait for page load
      await page.waitForLoadState('networkidle');
      
      // Look for poker table elements
      const pokerTable = await page.waitForSelector('.poker-table, [data-testid="poker-table"], #poker-table-container', {
        timeout: 30000
      });
      
      expect(pokerTable).toBeTruthy();
      
      // Check for seat elements
      const seats = page.locator('.seat, [data-testid^="seat-"]');
      const seatCount = await seats.count();
      expect(seatCount).toBeGreaterThan(0);
      
      await logTestStep(page, `Game table loaded with ${seatCount} seats`);
    });

    await test.step('6. Take a seat at the table', async () => {
      await logTestStep(page, 'Taking a seat');
      
      // Click on an empty seat
      const emptySeat = page.locator('.seat:not(.occupied), [data-testid^="seat-"]:not(.occupied)').first();
      await emptySeat.click();
      
      // Handle buy-in modal if it appears
      const buyInModal = page.locator('text="Buy In", text="Get Chips"');
      if (await buyInModal.isVisible({ timeout: 5000 })) {
        await logTestStep(page, 'Handling buy-in modal');
        
        // Enter buy-in amount if needed
        const buyInInput = page.locator('input[type="number"], input[placeholder*="amount"]');
        if (await buyInInput.isVisible()) {
          await buyInInput.fill('1000');
        }
        
        // Confirm buy-in
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Join"), button:has-text("Buy In")');
        await confirmButton.click();
      }
      
      // Verify we're seated
      await page.waitForTimeout(2000); // Give time for seat update
      const playerName = page.locator(`text="${config.credentials.username}"`);
      await expect(playerName).toBeVisible({ timeout: 10000 });
      
      await logTestStep(page, 'Successfully seated at table');
    });

    await test.step('7. Verify game state', async () => {
      await logTestStep(page, 'Verifying game state');
      
      // Check for game elements
      const potAmount = page.locator('.pot-amount, [data-testid="pot-amount"]');
      await expect(potAmount).toBeVisible();
      
      // Check for player chips
      const chipStack = page.locator('.chip-stack, [data-testid="chip-stack"]').first();
      await expect(chipStack).toBeVisible();
      
      // Check for action buttons (might not be visible if not our turn)
      const actionButtons = page.locator('button:has-text("Fold"), button:has-text("Check"), button:has-text("Call")');
      const buttonCount = await actionButtons.count();
      
      await logTestStep(page, `Game state verified. Action buttons visible: ${buttonCount > 0}`);
    });

    // Take screenshot of final state
    await page.screenshot({ 
      path: 'test-results/complete-flow-final.png',
      fullPage: true 
    });
  });
});