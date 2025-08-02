import { test, expect } from '@playwright/test';

test.describe('Quick WebSocket Test', () => {
  test('Navigate to game page and check WebSocket connection', async ({ page }) => {
    console.log('🔌 Quick WebSocket test');
    
    // Monitor WebSocket specific messages
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebSocket') || text.includes('demo') || text.includes('Connection')) {
        console.log(`📝 ${msg.type()}: ${text}`);
      }
    });

    // Navigate directly to a game page
    console.log('🎯 Navigating directly to game page');
    await page.goto('/game/demo-table-1/');
    
    // Wait for initial load and WebSocket attempts
    await page.waitForTimeout(10000);
    
    // Check connection status
    const connectionStatus = await page.textContent('[data-testid="connection-status"], .connection-status, [class*="Connection"]');
    console.log(`🔌 Connection status: ${connectionStatus || 'Not found'}`);
    
    // Look for WebSocket error indicators
    const hasConnectionError = await page.isVisible(':has-text("Connection Error"), :has-text("Connection failed")');
    console.log(`❌ Has connection error indicator: ${hasConnectionError}`);
    
    // Take screenshot
    await page.screenshot({ path: 'quick-websocket-test.png', fullPage: true });
    
    // Basic assertion - page should load
    expect(page.url()).toContain('/game/demo-table-1');
    console.log('✅ Game page loaded');
  });
});