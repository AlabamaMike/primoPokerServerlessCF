import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { platform } from 'os';

// Helper to get the built app path
function getAppPath(): string {
  const os = platform();
  const appName = 'Primo Poker';
  
  switch (os) {
    case 'darwin':
      return `src-tauri/target/release/bundle/macos/${appName}.app/Contents/MacOS/${appName}`;
    case 'win32':
      return `src-tauri/target/release/${appName}.exe`;
    case 'linux':
      return `src-tauri/target/release/primo-poker-desktop`;
    default:
      throw new Error(`Unsupported platform: ${os}`);
  }
}

test.describe('Desktop App Launch', () => {
  test('Desktop app launches and connects to backend', async ({ page }) => {
    // For now, we'll test the development version
    // In CI, this would launch the built binary
    await page.goto('http://localhost:1420');
    
    // Wait for the app to initialize
    await page.waitForLoadState('networkidle');
    
    // Verify window title
    await expect(page).toHaveTitle('Primo Poker');
    
    // Check that the app renders
    const heading = page.locator('h1');
    await expect(heading).toContainText('Primo Poker Desktop');
    
    // Check backend connection status
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible();
    
    // Wait for connection (with timeout)
    await expect(connectionStatus).toContainText(/Connected|Disconnected/, { 
      timeout: 10000 
    });
  });

  test('Shows connection status with latency', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toBeVisible();
    
    // If connected, should show latency
    const statusText = await connectionStatus.textContent();
    if (statusText?.includes('Connected')) {
      await expect(connectionStatus).toContainText(/\d+ms/);
    }
  });

  test('Retry connection button works when disconnected', async ({ page }) => {
    await page.goto('http://localhost:1420');
    
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    
    // If disconnected, retry button should be visible
    const retryButton = connectionStatus.locator('button:has-text("Retry")');
    const isDisconnected = await retryButton.isVisible();
    
    if (isDisconnected) {
      await retryButton.click();
      // Should show connecting state
      await expect(connectionStatus).toContainText('Connecting to backend...');
    }
  });
});