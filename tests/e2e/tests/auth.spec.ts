import { test, expect, Page } from '@playwright/test';

// Test data for user registration and login
const testUser = {
  username: `testuser_${Date.now()}`,
  email: `testuser_${Date.now()}@example.com`,
  password: 'TestPassword123!'
};

class AuthPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/auth/login');
  }

  async register(username: string, email: string, password: string) {
    await this.page.goto('/auth/register');
    await this.page.fill('input[type="text"]', username);
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
  }

  async login(emailOrUsername: string, password: string) {
    await this.page.goto('/auth/login');
    await this.page.fill('input[type="email"]', emailOrUsername);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
  }

  async expectLoginError(errorMessage: string) {
    await expect(this.page.locator('text=' + errorMessage)).toBeVisible();
  }

  async expectSuccessfulLogin() {
    // Should redirect to lobby
    await expect(this.page).toHaveURL(/.*\/lobby/);
  }
}

test.describe('Authentication Flow', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  test('should register a new user successfully', async ({ page }) => {
    await authPage.register(testUser.username, testUser.email, testUser.password);
    
    // Should redirect to lobby after successful registration
    await expect(page).toHaveURL(/.*\/lobby/);
    
    // Should show welcome message with username
    await expect(page.locator(`text=Welcome back, ${testUser.username}`)).toBeVisible();
  });

  test('should login with username', async ({ page }) => {
    // First register the user
    await authPage.register(testUser.username, testUser.email, testUser.password);
    
    // Logout and login again with username
    await page.goto('/auth/login');
    await authPage.login(testUser.username, testUser.password);
    await authPage.expectSuccessfulLogin();
  });

  test('should login with email', async ({ page }) => {
    // First register the user
    await authPage.register(testUser.username, testUser.email, testUser.password);
    
    // Logout and login again with email
    await page.goto('/auth/login');
    await authPage.login(testUser.email, testUser.password);
    await authPage.expectSuccessfulLogin();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await authPage.login('nonexistent@example.com', 'wrongpassword');
    await authPage.expectLoginError('User not found');
  });

  test('should validate input fields', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Try to submit empty form
    await page.click('button[type="submit"]');
    
    // Should show validation errors
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
    await expect(page.locator('input[type="password"]:invalid')).toBeVisible();
  });
});
