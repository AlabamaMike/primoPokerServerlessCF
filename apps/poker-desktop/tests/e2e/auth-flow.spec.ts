import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Wait for connection
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText(/Connected|Disconnected/, { 
      timeout: 10000 
    });
  });

  test('Shows login form when not authenticated', async ({ page }) => {
    // Check if we need to logout first
    const logoutButton = page.locator('[data-testid="logout-button"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForTimeout(500);
    }
    
    // Login form should be visible
    const loginForm = page.locator('[data-testid="login-form"]');
    await expect(loginForm).toBeVisible();
    
    // Check form elements
    await expect(page.locator('[data-testid="email"]')).toBeVisible();
    await expect(page.locator('[data-testid="password"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
  });

  test('Login with valid credentials', async ({ page }) => {
    // Ensure we're logged out
    const logoutButton = page.locator('[data-testid="logout-button"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForTimeout(500);
    }
    
    // Fill login form
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Should show authenticated content
    const authenticatedContent = page.locator('[data-testid="authenticated-content"]');
    await expect(authenticatedContent).toBeVisible({ timeout: 10000 });
    
    // Should show play button
    await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    // Ensure we're logged out
    const logoutButton = page.locator('[data-testid="logout-button"]');
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await page.waitForTimeout(500);
    }
    
    // Fill login form with invalid credentials
    await page.fill('[data-testid="email"]', 'invalid@example.com');
    await page.fill('[data-testid="password"]', 'wrongpassword');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Should show error message
    await expect(page.locator('.bg-red-500\\/20')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.bg-red-500\\/20')).toContainText(/Login failed/i);
    
    // Should still show login form
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('Logout works correctly', async ({ page }) => {
    // First login
    const logoutButton = page.locator('[data-testid="logout-button"]');
    if (!await logoutButton.isVisible()) {
      await page.fill('[data-testid="email"]', 'test@example.com');
      await page.fill('[data-testid="password"]', 'password123');
      await page.click('[data-testid="login-button"]');
      await expect(logoutButton).toBeVisible({ timeout: 10000 });
    }
    
    // Click logout
    await logoutButton.click();
    
    // Should show login form again
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="authenticated-content"]')).not.toBeVisible();
  });

  test('Persists authentication across app restarts', async ({ page, context }) => {
    // Login
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Wait for authentication
    await expect(page.locator('[data-testid="authenticated-content"]')).toBeVisible({ timeout: 10000 });
    
    // Reload the page (simulating app restart)
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Should still be authenticated
    await expect(page.locator('[data-testid="authenticated-content"]')).toBeVisible({ timeout: 10000 });
  });
});