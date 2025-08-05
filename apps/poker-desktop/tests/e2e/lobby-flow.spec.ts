import { test, expect } from '@playwright/test';

test.describe('Lobby Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Login if needed
    const loginForm = page.locator('[data-testid="login-form"]');
    if (await loginForm.isVisible()) {
      await page.fill('[data-testid="email"]', 'test@example.com');
      await page.fill('[data-testid="password"]', 'password123');
      await page.click('[data-testid="login-button"]');
      await expect(page.locator('[data-testid="authenticated-content"]')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Navigate to lobby', async ({ page }) => {
    // Click Play Now button
    await page.click('[data-testid="play-button"]');
    
    // Should show lobby
    const lobby = page.locator('[data-testid="lobby"]');
    await expect(lobby).toBeVisible();
    
    // Should show tables list (even if empty)
    await expect(page.locator('text=/Available Tables|No tables available/')).toBeVisible();
  });

  test('Create table form', async ({ page }) => {
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Click create table button
    const createButton = page.locator('[data-testid="create-table-button"]');
    await expect(createButton).toBeVisible();
    await createButton.click();
    
    // Form should appear
    const tableNameInput = page.locator('[data-testid="table-name-input"]');
    await expect(tableNameInput).toBeVisible();
    
    // Check blinds selector
    const blindsSelect = page.locator('[data-testid="blinds-select"]');
    await expect(blindsSelect).toBeVisible();
    
    // Should have confirm and cancel buttons
    await expect(page.locator('[data-testid="confirm-create-button"]')).toBeVisible();
    await expect(page.locator('text=Cancel')).toBeVisible();
  });

  test('Create and join table', async ({ page }) => {
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Create a table
    await page.click('[data-testid="create-table-button"]');
    await page.fill('[data-testid="table-name-input"]', 'Test Table');
    await page.selectOption('[data-testid="blinds-select"]', '25/50');
    
    // Submit form
    await page.click('[data-testid="confirm-create-button"]');
    
    // Wait for table to be created
    await page.waitForTimeout(2000);
    
    // Should show the new table in the list
    const tablesList = page.locator('[data-testid="tables-list"]');
    await expect(tablesList).toBeVisible({ timeout: 10000 });
    
    // Find the created table
    const testTable = page.locator('text=Test Table');
    await expect(testTable).toBeVisible({ timeout: 10000 });
    
    // Should show blinds
    await expect(page.locator('text=$25/$50')).toBeVisible();
    
    // Join button should be visible
    const joinButton = page.locator('[data-testid^="join-table-"]').first();
    await expect(joinButton).toBeVisible();
  });

  test('Navigate back from lobby', async ({ page }) => {
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Should show lobby
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();
    
    // Click back button
    await page.click('text=← Back');
    
    // Should return to main menu
    await expect(page.locator('[data-testid="play-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="lobby"]')).not.toBeVisible();
  });

  test('Logout from lobby', async ({ page }) => {
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Should show lobby
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();
    
    // Click logout button
    await page.click('[data-testid="logout-button"]');
    
    // Should show login form
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="lobby"]')).not.toBeVisible();
  });

  test('Tables auto-refresh', async ({ page }) => {
    // Navigate to lobby
    await page.click('[data-testid="play-button"]');
    
    // Wait for initial load
    await expect(page.locator('[data-testid="lobby"]')).toBeVisible();
    
    // Create a table
    await page.click('[data-testid="create-table-button"]');
    await page.fill('[data-testid="table-name-input"]', `Table ${Date.now()}`);
    await page.click('[data-testid="confirm-create-button"]');
    
    // Wait for auto-refresh (5 seconds interval)
    await page.waitForTimeout(6000);
    
    // Table should still be visible
    const tablesList = page.locator('[data-testid="tables-list"]');
    await expect(tablesList).toBeVisible();
  });
});