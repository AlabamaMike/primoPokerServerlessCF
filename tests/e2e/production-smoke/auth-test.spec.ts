import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login-page';
import { LobbyPage } from './pages/lobby-page';
import { getTestConfig, logTestStep } from './utils/test-helpers';

test.describe('Authentication Flow', () => {
  const config = getTestConfig();

  test('Login and navigate to lobby', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);

    await test.step('Navigate to login page', async () => {
      await logTestStep(page, 'Navigating to login page');
      await loginPage.goto();
      await expect(page).toHaveURL(/\/login/);
    });

    await test.step('Enter credentials and login', async () => {
      await logTestStep(page, 'Entering user credentials');
      await loginPage.login(config.credentials.username, config.credentials.password);
      
      // Wait for navigation
      await page.waitForURL(/\/(lobby|multiplayer)/, { timeout: 10000 });
    });

    await test.step('Verify authentication', async () => {
      await logTestStep(page, 'Verifying authentication');
      
      // Check for auth token in localStorage
      const authToken = await page.evaluate(() => {
        return localStorage.getItem('auth_token');
      });
      expect(authToken).toBeTruthy();
      
      // Check auth state from zustand store
      const authState = await page.evaluate(() => {
        const authStorage = localStorage.getItem('auth-storage');
        return authStorage ? JSON.parse(authStorage) : null;
      });
      
      expect(authState).toBeTruthy();
      expect(authState.state.isAuthenticated).toBe(true);
      expect(authState.state.user).toBeTruthy();
      expect(authState.state.token).toBeTruthy();
    });

    await test.step('Verify lobby loads', async () => {
      await logTestStep(page, 'Verifying lobby page loads');
      
      // Wait for table list or empty state
      await page.waitForSelector([
        '[data-testid="table-list"]',
        '.table-list',
        '#tables-container',
        'text="No tables available"',
        'text="Create one to start playing"'
      ].join(','), { timeout: 30000 });
      
      // Verify create table button is visible
      const createTableButton = page.locator('button:has-text("Create Table")');
      await expect(createTableButton).toBeVisible();
    });
  });
});