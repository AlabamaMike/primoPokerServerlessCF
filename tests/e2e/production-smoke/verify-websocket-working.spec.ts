import { test, expect } from '@playwright/test';

test.describe('WebSocket Working Verification', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('Create table and verify WebSocket connection', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation to lobby
    await page.waitForURL('**/lobby', { timeout: 10000 });
    
    // Navigate to multiplayer
    await page.click('text=Multiplayer');
    await page.waitForURL('**/multiplayer', { timeout: 10000 });
    
    // Create a new table
    await page.click('text=Create Table');
    
    // Fill in table details
    await page.fill('input[name="tableName"]', `Test Table ${Date.now()}`);
    await page.selectOption('select[name="gameType"]', 'no_limit_holdem');
    await page.fill('input[name="smallBlind"]', '1');
    await page.fill('input[name="bigBlind"]', '2');
    await page.fill('input[name="minBuyIn"]', '100');
    await page.fill('input[name="maxBuyIn"]', '500');
    await page.fill('input[name="maxPlayers"]', '6');
    
    // Monitor WebSocket connections
    const wsConnections: any[] = [];
    page.on('websocket', ws => {
      console.log(`WebSocket opened: ${ws.url()}`);
      wsConnections.push({
        url: ws.url(),
        isClosed: false
      });
      
      ws.on('close', () => {
        console.log(`WebSocket closed: ${ws.url()}`);
        const conn = wsConnections.find(c => c.url === ws.url());
        if (conn) conn.isClosed = true;
      });
      
      ws.on('framereceived', event => {
        console.log(`WebSocket received: ${event.payload}`);
      });
    });
    
    // Submit table creation
    await page.click('button[type="submit"]');
    
    // Wait for navigation to game page
    await page.waitForURL('**/game/**', { timeout: 15000 });
    
    // Get the table ID from URL
    const url = page.url();
    const tableIdMatch = url.match(/\/game\/([a-zA-Z0-9-]+)/);
    const tableId = tableIdMatch ? tableIdMatch[1] : null;
    
    console.log(`Created table with ID: ${tableId}`);
    expect(tableId).toBeTruthy();
    expect(tableId).not.toBe('lobby');
    expect(tableId).not.toBe('undefined');
    
    // Wait for WebSocket connection
    await page.waitForTimeout(3000);
    
    // Verify WebSocket connection was made
    const validWsConnection = wsConnections.find(conn => 
      conn.url.includes(tableId) && !conn.isClosed
    );
    
    console.log('WebSocket connections:', wsConnections);
    
    expect(validWsConnection).toBeTruthy();
    expect(validWsConnection.url).toContain(tableId);
    
    // Verify game UI is loaded
    await expect(page.locator('text=Waiting for players')).toBeVisible({ timeout: 10000 });
    
    console.log('✅ WebSocket connection successful with valid table ID!');
  });
});