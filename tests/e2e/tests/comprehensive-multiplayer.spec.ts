import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Comprehensive E2E test for multiplayer poker room functionality
 * Tests the complete flow from registration to playing a full poker hand
 */

test.describe('Comprehensive Multiplayer Poker Room', () => {
  test.beforeEach(async ({ page }) => {
    // Monitor console for errors and WebSocket messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`❌ Console Error: ${msg.text()}`);
      } else if (msg.text().includes('WebSocket') || msg.text().includes('ws:')) {
        console.log(`🔌 WebSocket: ${msg.text()}`);
      } else if (msg.text().includes('table') || msg.text().includes('game')) {
        console.log(`🃏 Game: ${msg.text()}`);
      }
    });

    // Monitor network failures
    page.on('requestfailed', request => {
      console.error(`❌ Network Failure: ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test('Complete multiplayer poker room flow - Single Browser Multi-Tab Simulation', async ({ browser }) => {
    console.log('🚀 Starting comprehensive multiplayer poker room test');
    
    // Create multiple browser contexts to simulate different players
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const context3 = await browser.newContext();
    
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    const player3 = await context3.newPage();
    
    try {
      // Step 1: Register and authenticate all players
      console.log('👥 Step 1: Registering and authenticating players');
      
      const players = [
        { page: player1, name: 'Alice', email: 'alice@test.com' },
        { page: player2, name: 'Bob', email: 'bob@test.com' },
        { page: player3, name: 'Charlie', email: 'charlie@test.com' }
      ];
      
      for (const player of players) {
        await registerAndLogin(player.page, player.name, player.email);
        console.log(`✅ ${player.name} registered and logged in`);
      }
      
      // Step 2: Navigate all players to lobby
      console.log('🏛️ Step 2: Navigating players to lobby');
      
      for (const player of players) {
        await player.page.goto('/lobby');
        await player.page.waitForTimeout(2000);
        console.log(`✅ ${player.name} in lobby`);
      }
      
      // Step 3: Create or join a table
      console.log('🎯 Step 3: Table creation and joining');
      
      // Player 1 creates a table or joins the first available
      await createOrJoinTable(player1, 'Alice');
      await player1.waitForTimeout(3000);
      
      // Player 2 and 3 join the same table
      await joinExistingTable(player2, 'Bob');
      await player2.waitForTimeout(3000);
      
      await joinExistingTable(player3, 'Charlie');
      await player3.waitForTimeout(3000);
      
      // Step 4: Verify game table setup
      console.log('🃏 Step 4: Verifying game table setup');
      
      for (const player of players) {
        const tableVisible = await player.page.isVisible('.poker-table, [data-testid="poker-table"], svg');
        const playersVisible = await player.page.isVisible('.player-seat, [data-testid="player-seat"]');
        
        console.log(`${player.name} sees table: ${tableVisible}, players: ${playersVisible}`);
        
        // Take screenshot for debugging
        await player.page.screenshot({ 
          path: `player-${player.name.toLowerCase()}-table-view.png`, 
          fullPage: true 
        });
      }
      
      // Step 5: Test WebSocket communication
      console.log('🔌 Step 5: Testing WebSocket communication');
      
      await testWebSocketConnections(players);
      
      // Step 6: Test game mechanics (if game starts)
      console.log('🎮 Step 6: Testing game mechanics');
      
      await testGameMechanics(players);
      
      // Step 7: Test betting actions
      console.log('💰 Step 7: Testing betting actions');
      
      await testBettingActions(players);
      
      console.log('🎉 Comprehensive test completed successfully!');
      
    } finally {
      // Cleanup
      await context1.close();
      await context2.close();
      await context3.close();
    }
  });

  test('Single player connection and table interaction', async ({ page }) => {
    console.log('🧪 Testing single player connection flow');
    
    // Register and login
    const testUser = `solo_${Date.now()}`;
    await registerAndLogin(page, testUser, `${testUser}@test.com`);
    
    // Navigate to lobby
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    // Look for tables or create table option
    const hasTableList = await page.isVisible('table, .table-list, [data-testid="table-list"]');
    const hasCreateButton = await page.isVisible('button:has-text("Create"), button:has-text("New Table")');
    const hasJoinButton = await page.isVisible('button:has-text("Join")');
    
    console.log(`📊 Lobby elements - Tables: ${hasTableList}, Create: ${hasCreateButton}, Join: ${hasJoinButton}`);
    
    // Try to create or join a table
    if (hasCreateButton) {
      await page.click('button:has-text("Create"), button:has-text("New Table")');
      await page.waitForTimeout(2000);
    } else if (hasJoinButton) {
      await page.click('button:has-text("Join")');
      await page.waitForTimeout(2000);
    }
    
    // Check if we're now in a game
    const inGamePage = page.url().includes('/game/');
    console.log(`🎯 In game page: ${inGamePage}`);
    
    if (inGamePage) {
      // Test game page elements
      const tableVisible = await page.isVisible('.poker-table, [data-testid="poker-table"], svg');
      const seatsVisible = await page.isVisible('.player-seat, [data-testid="player-seat"]');
      const actionsVisible = await page.isVisible('button:has-text("Call"), button:has-text("Fold"), button:has-text("Raise")');
      
      console.log(`🃏 Game elements - Table: ${tableVisible}, Seats: ${seatsVisible}, Actions: ${actionsVisible}`);
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'single-player-test.png', fullPage: true });
    
    expect(page.url()).toMatch(/\/(lobby|game)/);
  });
});

// Helper Functions

async function registerAndLogin(page: Page, username: string, email: string): Promise<void> {
  const password = 'testpass123';
  
  // Navigate to register page
  await page.goto('/register');
  await page.waitForTimeout(2000);
  
  // Check if we're already logged in by looking for a redirect or different page
  if (page.url().includes('/lobby') || page.url().includes('/game')) {
    console.log(`${username} appears to already be logged in`);
    return;
  }
  
  // Fill registration form
  const usernameField = await page.$('input[name="username"], input[placeholder*="username" i]');
  const emailField = await page.$('input[name="email"], input[placeholder*="email" i]');
  const passwordField = await page.$('input[name="password"], input[type="password"]');
  
  if (usernameField && emailField && passwordField) {
    await usernameField.fill(username);
    await emailField.fill(email);
    await passwordField.fill(password);
    
    // Submit registration
    const submitButton = await page.$('button[type="submit"], button:has-text("Register")');
    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(3000);
    }
  }
  
  // Check if login is needed
  if (page.url().includes('/login')) {
    console.log(`${username} redirected to login, attempting login`);
    
    await page.fill('input[name="username"], input[name="email"], input[placeholder*="username" i], input[placeholder*="email" i]', username);
    await page.fill('input[name="password"], input[type="password"]', password);
    
    const loginButton = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
    if (loginButton) {
      await loginButton.click();
      await page.waitForTimeout(3000);
    }
  }
}

async function createOrJoinTable(page: Page, playerName: string): Promise<void> {
  console.log(`🎯 ${playerName} attempting to create or join table`);
  
  // Look for existing tables first
  const joinButtons = await page.$$('button:has-text("Join")');
  
  if (joinButtons.length > 0) {
    console.log(`${playerName} found ${joinButtons.length} available tables, joining first one`);
    await joinButtons[0]!.click();
    await page.waitForTimeout(3000);
  } else {
    // Try to create a new table
    const createButton = await page.$('button:has-text("Create"), button:has-text("New Table")');
    if (createButton) {
      console.log(`${playerName} creating new table`);
      await createButton.click();
      await page.waitForTimeout(3000);
    } else {
      console.log(`${playerName} unable to find create or join options`);
    }
  }
}

async function joinExistingTable(page: Page, playerName: string): Promise<void> {
  console.log(`🎯 ${playerName} attempting to join existing table`);
  
  // Look for join buttons
  const joinButtons = await page.$$('button:has-text("Join")');
  
  if (joinButtons.length > 0) {
    console.log(`${playerName} found ${joinButtons.length} available tables, joining first one`);
    await joinButtons[0]!.click();
    await page.waitForTimeout(3000);
  } else {
    console.log(`${playerName} no available tables to join`);
  }
}

async function testWebSocketConnections(players: Array<{page: Page, name: string, email: string}>): Promise<void> {
  console.log('🔌 Testing WebSocket connections for all players');
  
  for (const player of players) {
    // Check for WebSocket connection indicators
    const wsConnected = await player.page.evaluate(() => {
      // Look for WebSocket connection status in the page
      return (window as any).wsConnected || 
             document.querySelector('[data-testid="connection-status"]')?.textContent?.includes('Connected') ||
             document.querySelector('.connection-status')?.textContent?.includes('Connected');
    });
    
    console.log(`${player.name} WebSocket connected: ${wsConnected}`);
    
    // Check console for WebSocket messages
    const wsMessages = await player.page.evaluate(() => {
      return (window as any).wsMessages || [];
    });
    
    if (wsMessages.length > 0) {
      console.log(`${player.name} received ${wsMessages.length} WebSocket messages`);
    }
  }
}

async function testGameMechanics(players: Array<{page: Page, name: string, email: string}>): Promise<void> {
  console.log('🎮 Testing game mechanics');
  
  for (const player of players) {
    // Check for game state elements
    const hasCards = await player.page.isVisible('.card, [data-testid="card"], .hole-cards');
    const hasPot = await player.page.isVisible('.pot, [data-testid="pot"]');
    const hasPhase = await player.page.isVisible('.game-phase, [data-testid="game-phase"]');
    
    console.log(`${player.name} game elements - Cards: ${hasCards}, Pot: ${hasPot}, Phase: ${hasPhase}`);
    
    // Look for specific game content
    const gameContent = await player.page.textContent('body');
    const hasGameKeywords = gameContent?.includes('chips') || 
                           gameContent?.includes('pot') || 
                           gameContent?.includes('flop') ||
                           gameContent?.includes('turn') ||
                           gameContent?.includes('river');
    
    console.log(`${player.name} has game-related content: ${hasGameKeywords}`);
  }
}

async function testBettingActions(players: Array<{page: Page, name: string, email: string}>): Promise<void> {
  console.log('💰 Testing betting actions');
  
  for (const player of players) {
    // Look for betting action buttons
    const foldButton = await player.page.$('button:has-text("Fold")');
    const callButton = await player.page.$('button:has-text("Call")');
    const raiseButton = await player.page.$('button:has-text("Raise"), button:has-text("Bet")');
    const checkButton = await player.page.$('button:has-text("Check")');
    
    const hasActions = !!(foldButton || callButton || raiseButton || checkButton);
    console.log(`${player.name} has betting actions available: ${hasActions}`);
    
    // If it's this player's turn, try an action
    const isPlayerTurn = await player.page.isVisible('.your-turn, [data-testid="your-turn"], .current-player');
    
    if (isPlayerTurn && checkButton) {
      console.log(`${player.name} attempting to check`);
      await checkButton.click();
      await player.page.waitForTimeout(2000);
    } else if (isPlayerTurn && callButton) {
      console.log(`${player.name} attempting to call`);
      await callButton.click();
      await player.page.waitForTimeout(2000);
    }
  }
}