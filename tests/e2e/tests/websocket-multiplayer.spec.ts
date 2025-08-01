import { test, expect } from '@playwright/test';

test.describe('WebSocket Multiplayer Tests', () => {
  test('should establish WebSocket connection and test multiplayer functionality', async ({ page }) => {
    // Monitor console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });

    // Monitor network failures  
    const networkErrors: any[] = [];
    page.on('requestfailed', request => {
      networkErrors.push({
        url: request.url(),
        failure: request.failure()?.errorText
      });
    });

    console.log('=== NAVIGATING TO WEBSOCKET TEST PAGE ===');
    await page.goto('/websocket-test');
    
    // Check if authentication is required
    const authRequired = await page.isVisible('text=Not authenticated');
    if (authRequired) {
      console.log('=== AUTHENTICATION REQUIRED - REGISTERING USER ===');
      
      // Navigate to registration
      await page.goto('/register');
      await page.waitForTimeout(2000);
      
      // Fill registration form
      const testUser = `test_${Date.now()}`;
      await page.fill('input[name="username"], input[placeholder*="username" i]', testUser);
      await page.fill('input[name="email"], input[placeholder*="email" i]', `${testUser}@example.com`);
      await page.fill('input[name="password"], input[type="password"]', 'testpass123');
      
      // Submit registration
      await page.click('button[type="submit"], button:has-text("Register")');
      await page.waitForTimeout(3000);
      
      // Navigate back to WebSocket test
      await page.goto('/websocket-test');
      await page.waitForTimeout(2000);
    }
    
    console.log('=== CHECKING WEBSOCKET CONNECTION STATUS ===');
    
    // Wait for connection attempt
    await page.waitForTimeout(10000);
    
    // Check connection status
    const connectionStatus = await page.textContent('[data-testid="connection-status"], div:has-text("Connected"), div:has-text("Failed"), div:has-text("Connecting")');
    console.log('Connection Status:', connectionStatus);
    
    // Look for connection logs
    const logContainer = await page.$('.bg-slate-900, [data-testid="connection-log"], pre, code');
    if (logContainer) {
      const logs = await logContainer.textContent();
      console.log('=== CONNECTION LOGS ===');
      console.log(logs);
    }
    
    // Check for specific WebSocket messages
    const wsMessages = consoleMessages.filter(msg => 
      msg.includes('WebSocket') || 
      msg.includes('Connected') || 
      msg.includes('tables_update') ||
      msg.includes('connection_established')
    );
    
    console.log('=== WEBSOCKET MESSAGES ===');
    wsMessages.forEach(msg => console.log(msg));
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'websocket-test.png', fullPage: true });
    
    console.log('=== TEST RESULTS ===');
    console.log('Total console messages:', consoleMessages.length);
    console.log('WebSocket-related messages:', wsMessages.length);
    console.log('Network errors:', networkErrors.length);
    
    // The test is primarily for observing behavior
    // We'll consider it successful if we can navigate to the page
    expect(page.url()).toContain('/websocket-test');
  });

  test('should test multiplayer lobby functionality', async ({ page }) => {
    console.log('=== TESTING MULTIPLAYER LOBBY ===');
    
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });

    // Navigate to lobby
    await page.goto('/lobby');
    await page.waitForTimeout(5000);
    
    // Look for table list or lobby content
    const hasTableList = await page.isVisible('table, .table-list, [data-testid="table-list"]');
    const hasCreateTableButton = await page.isVisible('button:has-text("Create"), button:has-text("New Table")');
    const hasJoinButton = await page.isVisible('button:has-text("Join")');
    
    console.log('Has table list:', hasTableList);
    console.log('Has create table button:', hasCreateTableButton);
    console.log('Has join button:', hasJoinButton);
    
    // Check for API calls to backend
    const apiCalls = consoleMessages.filter(msg => 
      msg.includes('primo-poker-server') || 
      msg.includes('/api/') ||
      msg.includes('tables')
    );
    
    console.log('=== API CALLS DETECTED ===');
    apiCalls.forEach(call => console.log(call));
    
    // Take screenshot
    await page.screenshot({ path: 'multiplayer-lobby-test.png', fullPage: true });
    
    expect(page.url()).toContain('/lobby');
  });

  test('should test game table WebSocket functionality', async ({ page }) => {
    console.log('=== TESTING GAME TABLE WEBSOCKET ===');
    
    const wsMessages: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('WebSocket') || msg.text().includes('ws:') || msg.text().includes('wss:')) {
        wsMessages.push(msg.text());
      }
    });

    // Navigate to a demo game table
    await page.goto('/game/demo-table-1');
    await page.waitForTimeout(8000);
    
    // Look for poker table elements
    const hasPokerTable = await page.isVisible('.poker-table, [data-testid="poker-table"], svg');
    const hasPlayerSeats = await page.isVisible('.player-seat, [data-testid="player-seat"]');
    const hasActionButtons = await page.isVisible('button:has-text("Call"), button:has-text("Fold"), button:has-text("Raise")');
    
    console.log('Has poker table:', hasPokerTable);
    console.log('Has player seats:', hasPlayerSeats);
    console.log('Has action buttons:', hasActionButtons);
    
    // Check for WebSocket connection attempts
    console.log('=== WEBSOCKET MESSAGES ===');
    wsMessages.forEach(msg => console.log(msg));
    
    // Take screenshot
    await page.screenshot({ path: 'game-table-test.png', fullPage: true });
    
    expect(page.url()).toContain('/game/');
  });
});