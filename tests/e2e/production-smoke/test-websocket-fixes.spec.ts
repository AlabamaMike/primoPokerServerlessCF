import { test, expect } from '@playwright/test';

test.describe('WebSocket Connection Fixes', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';

  test('Health check includes WebSocket info', async ({ page }) => {
    const response = await page.goto('/api/health');
    const healthData = await response?.json();
    
    console.log('Health check response:', healthData);
    
    expect(healthData.data.websocket).toBeDefined();
    expect(healthData.data.websocket.url).toContain('wss://');
    expect(healthData.data.websocket.status).toBe('ready');
  });

  test('WebSocket connection with exponential backoff', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/lobby/, { timeout: 10000 });

    // Navigate to multiplayer
    await page.click('button:has-text("Enter Multiplayer")');
    await page.waitForURL(/\/multiplayer/, { timeout: 10000 });

    // Monitor console for WebSocket behavior
    const wsLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebSocket') || text.includes('attempting to reconnect')) {
        wsLogs.push(text);
        console.log(`[Console] ${text}`);
      }
    });

    // Create a table
    await page.click('button:has-text("Create Table")');
    
    // Wait for navigation or error
    const result = await Promise.race([
      page.waitForURL(/\/game\//, { timeout: 30000 }).then(() => 'success'),
      page.waitForTimeout(10000).then(() => 'timeout')
    ]);

    console.log('Table creation result:', result);
    
    // Check for rapid reconnection attempts (should not happen with exponential backoff)
    const reconnectAttempts = wsLogs.filter(log => log.includes('Attempting to reconnect'));
    console.log('Reconnection attempts:', reconnectAttempts.length);
    
    if (reconnectAttempts.length > 0) {
      // Verify exponential backoff is working
      const delays = reconnectAttempts.map(log => {
        const match = log.match(/in (\d+)ms/);
        return match ? parseInt(match[1]) : 0;
      });
      
      console.log('Reconnection delays:', delays);
      
      // Check that delays are increasing (exponential backoff)
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    }

    // Take screenshot of final state
    await page.screenshot({ path: 'test-results/websocket-fixes-final.png', fullPage: true });
  });

  test('No WebSocket connection to invalid tableIds', async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/lobby/, { timeout: 10000 });

    // Monitor WebSocket connections
    const wsConnections: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebSocket connect called with:') || text.includes('Invalid tableId')) {
        wsConnections.push(text);
        console.log(`[WebSocket] ${text}`);
      }
    });

    // Navigate to multiplayer (should NOT trigger WebSocket to 'lobby')
    await page.click('button:has-text("Enter Multiplayer")');
    await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
    
    // Wait a bit to see if any WebSocket connections are attempted
    await page.waitForTimeout(3000);
    
    // Check that no WebSocket was attempted to 'lobby'
    const lobbyConnections = wsConnections.filter(log => 
      log.includes("tableId: 'lobby'") || log.includes('tableId: "lobby"')
    );
    
    console.log('Lobby WebSocket attempts:', lobbyConnections.length);
    expect(lobbyConnections.length).toBe(0);
  });
});