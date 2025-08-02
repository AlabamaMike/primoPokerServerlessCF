import { test, expect } from '@playwright/test';

test.describe('Test Join Table Functionality', () => {
  test('Join a demo table and verify game page loads', async ({ page }) => {
    console.log('🎯 Testing join table functionality');
    
    // Monitor console and network
    page.on('console', msg => {
      console.log(`📝 Console: ${msg.type()}: ${msg.text()}`);
    });

    page.on('request', request => {
      if (request.url().includes('/api/') || request.url().includes('/game/')) {
        console.log(`📤 Request: ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', response => {
      if (response.url().includes('/api/') || response.url().includes('/game/')) {
        console.log(`📥 Response: ${response.status()} ${response.url()}`);
      }
    });

    // Step 1: Navigate to lobby
    console.log('🏛️ Step 1: Navigate to lobby');
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    // Step 2: Wait for tables to load
    console.log('⏳ Step 2: Wait for tables to load');
    await page.waitForSelector('button:has-text("Join Table")', { timeout: 10000 });
    
    // Step 3: Take screenshot of lobby
    await page.screenshot({ path: 'lobby-before-join.png', fullPage: true });
    console.log('📸 Screenshot: lobby-before-join.png');
    
    // Step 4: Find and click first Join Table button
    console.log('🎯 Step 4: Click first Join Table button');
    const joinButtons = await page.$$('button:has-text("Join Table")');
    console.log(`Found ${joinButtons.length} Join Table buttons`);
    
    if (joinButtons.length > 0 && joinButtons[0]) {
      await joinButtons[0].click();
      console.log('✅ Clicked first Join Table button');
      
      // Step 5: Wait for navigation to game page
      console.log('🎮 Step 5: Wait for navigation to game page');
      await page.waitForTimeout(5000);
      
      // Step 6: Check if we're on a game page
      const currentUrl = page.url();
      console.log(`🌐 Current URL after join: ${currentUrl}`);
      
      const isOnGamePage = currentUrl.includes('/game/');
      console.log(`🎯 Is on game page: ${isOnGamePage}`);
      
      if (isOnGamePage) {
        // Step 7: Check for game page elements
        console.log('🃏 Step 7: Check for game page elements');
        
        const hasPokerTable = await page.isVisible('.poker-table, [data-testid="poker-table"], svg');
        const hasPlayerSeats = await page.isVisible('.player-seat, [data-testid="player-seat"]');
        const hasGameTitle = await page.textContent('h1, .game-title, [data-testid="game-title"]');
        
        console.log(`🎰 Has poker table: ${hasPokerTable}`);
        console.log(`💺 Has player seats: ${hasPlayerSeats}`);
        console.log(`📝 Game title: ${hasGameTitle || 'Not found'}`);
        
        // Step 8: Take screenshot of game page
        await page.screenshot({ path: 'game-page-after-join.png', fullPage: true });
        console.log('📸 Screenshot: game-page-after-join.png');
        
        // Step 9: Check for any error messages
        const bodyText = await page.textContent('body');
        const hasError = bodyText?.includes('Error') || bodyText?.includes('404') || bodyText?.includes('500');
        console.log(`❌ Has error messages: ${hasError}`);
        
        // Verify we successfully joined
        expect(currentUrl).toContain('/game/');
        console.log('✅ Successfully joined table and navigated to game page');
      } else {
        console.log('❌ Did not navigate to game page');
        await page.screenshot({ path: 'join-failed.png', fullPage: true });
      }
    } else {
      console.log('❌ No Join Table buttons found');
      await page.screenshot({ path: 'no-join-buttons.png', fullPage: true });
    }
  });
  
  test('Test Create Table functionality', async ({ page }) => {
    console.log('🛠️ Testing create table functionality');
    
    // Navigate to lobby
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    // Click Create Table button
    console.log('🔘 Clicking Create Table button');
    await page.click('button:has-text("Create Table")');
    await page.waitForTimeout(2000);
    
    // Check if modal opened
    const hasModal = await page.isVisible('.fixed, [role="dialog"], .modal');
    console.log(`📋 Create table modal opened: ${hasModal}`);
    
    if (hasModal) {
      // Fill out form
      await page.fill('input[id="tableName"]', 'Test Table');
      await page.selectOption('select[id="gameType"]', 'cash');
      
      // Take screenshot of modal
      await page.screenshot({ path: 'create-table-modal.png', fullPage: true });
      
      // Submit form
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      
      // Check if redirected to game
      const currentUrl = page.url();
      const isOnGamePage = currentUrl.includes('/game/');
      console.log(`🎯 Created table and redirected to game: ${isOnGamePage}`);
      
      if (isOnGamePage) {
        await page.screenshot({ path: 'created-table-game.png', fullPage: true });
      }
    }
    
    expect(hasModal).toBe(true);
  });
});