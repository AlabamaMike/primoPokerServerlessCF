import { test, expect } from '@playwright/test';

test.describe('Desktop Client Core Features', () => {
  test('App renders with title', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    // Check title is visible
    await expect(page.locator('h1')).toContainText('Primo Poker Desktop');
  });

  test('Shows connection status element', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    // Connection status should exist
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible();
    
    // Should show either Connected or Disconnected
    await expect(connectionStatus).toContainText(/Connected|Disconnected/);
  });

  test('UI components render correctly', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/desktop-app-ui.png', fullPage: true });
    
    // Check for main container
    const container = page.locator('.container');
    await expect(container).toBeVisible();
    
    // Check styling is loaded (Tailwind classes)
    const heading = page.locator('h1');
    const headingClasses = await heading.getAttribute('class');
    expect(headingClasses).toContain('text-4xl');
    expect(headingClasses).toContain('font-bold');
  });

  test('Authentication components exist', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // Wait a bit for React to render
    await page.waitForTimeout(2000);
    
    // Check if we see auth-related elements
    const pageContent = await page.content();
    
    // Log what we see for debugging
    console.log('Page structure:', await page.locator('body').innerHTML());
    
    // Should have either login form or authenticated content
    const hasLoginForm = await page.locator('[data-testid="login-form"]').count() > 0;
    const hasAuthContent = await page.locator('[data-testid="authenticated-content"]').count() > 0;
    const hasPlayButton = await page.locator('[data-testid="play-button"]').count() > 0;
    
    expect(hasLoginForm || hasAuthContent || hasPlayButton).toBeTruthy();
  });

  test('Lobby navigation flow', async ({ page }) => {
    await page.goto('http://localhost:1420');
    await page.waitForLoadState('networkidle');
    
    // If there's a play button, it means we're authenticated (or mocked)
    const playButton = page.locator('[data-testid="play-button"]');
    if (await playButton.count() > 0) {
      await playButton.click();
      
      // Should show lobby
      const lobby = page.locator('[data-testid="lobby"]');
      await expect(lobby).toBeVisible({ timeout: 10000 });
      
      // Should have create table button
      const createButton = page.locator('[data-testid="create-table-button"]');
      await expect(createButton).toBeVisible();
    }
  });
});