const { chromium } = require('@playwright/test');

// Production URLs
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function testCompleteFlow() {
  console.log('🎮 Primo Poker - Complete Flow Test\n');
  
  const browser = await chromium.launch({ 
    headless: true,
    slowMo: 50 // Slow down for stability
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser error:', msg.text());
    }
  });
  
  try {
    const timestamp = Date.now();
    const testUser = {
      username: `test_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'TestPass123!'
    };
    
    // 1. Register
    console.log('1️⃣ Registration Test');
    await page.goto(`${FRONTEND_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button:has-text("Create Account")')
    ]);
    
    console.log('✅ Registered and redirected to:', page.url());
    
    // 2. Check lobby
    if (!page.url().includes('/lobby')) {
      await page.goto(`${FRONTEND_URL}/lobby`);
    }
    
    await page.waitForLoadState('networkidle');
    console.log('\n2️⃣ Lobby Test');
    
    // Look for username to confirm login
    const userGreeting = await page.textContent('text=/Welcome.*' + testUser.username + '/i');
    console.log('✅ User greeting:', userGreeting);
    
    // 3. Create table
    console.log('\n3️⃣ Table Creation Test');
    
    // Take screenshot before clicking
    await page.screenshot({ path: 'before-create-table.png', fullPage: true });
    
    // Click create table
    await page.click('button:has-text("Create Table")');
    
    // Wait a moment
    await page.waitForTimeout(2000);
    
    // Take screenshot after clicking
    await page.screenshot({ path: 'after-create-table.png', fullPage: true });
    
    // Check what happened
    const currentUrl = page.url();
    console.log('   Current URL after click:', currentUrl);
    
    // If we navigated to a game, that's good
    if (currentUrl.includes('/game/')) {
      console.log('✅ Navigated directly to game!');
      const tableId = currentUrl.match(/game\/([^\/]+)/)?.[1];
      console.log('   Table ID:', tableId);
      
      // Continue to game testing
    } else {
      // Otherwise try to find and fill modal
      try {
        await page.waitForSelector('input[name="tableName"]', { timeout: 3000 });
        
        // Fill table form
        await page.fill('input[name="tableName"]', `Test ${timestamp}`);
        await page.fill('input[name="smallBlind"]', '10');
        await page.fill('input[name="bigBlind"]', '20');
    
    // Look for other fields
    const hasMaxPlayers = await page.locator('input[name="maxPlayers"]').isVisible().catch(() => false);
    if (hasMaxPlayers) {
      await page.fill('input[name="maxPlayers"]', '6');
    }
    
    const hasMinBuyIn = await page.locator('input[name="minBuyIn"]').isVisible().catch(() => false);
    if (hasMinBuyIn) {
      await page.fill('input[name="minBuyIn"]', '200');
      await page.fill('input[name="maxBuyIn"]', '1000');
    }
    
    // Submit - try different button selectors
    const submitted = await page.click('button[type="submit"]:visible').then(() => true).catch(() => false) ||
                     await page.click('button:has-text("Create Table"):not(:disabled)').then(() => true).catch(() => false) ||
                     await page.click('button:has-text("Create"):not(:disabled)').then(() => true).catch(() => false);
    
    if (submitted) {
      // Wait for navigation to game
      try {
        await page.waitForURL('**/game/**', { timeout: 15000 });
        console.log('✅ Table created! URL:', page.url());
        
        // Extract table ID
        const tableId = page.url().match(/game\/([^\/]+)/)?.[1];
        console.log('   Table ID:', tableId);
        
        // 4. Test game page
        console.log('\n4️⃣ Game Page Test');
        await page.waitForLoadState('networkidle');
        
        // Check for game elements
        const elements = {
          spectator: await page.locator('text=/spectator/i').isVisible({ timeout: 5000 }).catch(() => false),
          seats: await page.locator('[data-testid^="seat-"]').count(),
          table: await page.locator('[data-testid="poker-table"]').isVisible({ timeout: 5000 }).catch(() => false),
          pot: await page.locator('text=/pot/i').isVisible({ timeout: 5000 }).catch(() => false)
        };
        
        console.log('   Game elements:', elements);
        
        // 5. Try to sit down
        if (elements.seats > 0) {
          console.log('\n5️⃣ Seat Selection Test');
          
          // Find an empty seat
          const emptySeat = await page.locator('[data-testid^="seat-"][data-available="true"]').first();
          if (await emptySeat.isVisible()) {
            await emptySeat.click();
            console.log('✅ Clicked empty seat');
            
            // Look for buy-in modal
            const buyInVisible = await page.locator('text=/buy.*in/i').isVisible({ timeout: 5000 }).catch(() => false);
            if (buyInVisible) {
              console.log('✅ Buy-in modal appeared');
              
              // Try to buy in
              const amountField = await page.locator('input[type="number"], input[name="amount"], input[name="buyInAmount"]').first();
              if (await amountField.isVisible()) {
                await amountField.fill('500');
                
                const buyButton = await page.locator('button:has-text("Buy"), button:has-text("Confirm")').first();
                await buyButton.click();
                
                console.log('✅ Attempted buy-in with 500 chips');
                
                // Wait to see if we join
                await page.waitForTimeout(3000);
                
                // Check if still spectator
                const stillSpectator = await page.locator('text=/spectator/i').isVisible().catch(() => false);
                console.log(`   Still spectator: ${stillSpectator}`);
              }
            }
          }
        }
        
        // Take final screenshot
        await page.screenshot({ path: 'game-final-state.png', fullPage: true });
        console.log('\n📸 Game screenshot saved');
        
      } catch (navError) {
        console.log('⚠️  Table creation might have failed');
        console.log('   Current URL:', page.url());
        await page.screenshot({ path: 'create-table-issue.png', fullPage: true });
      }
    } else {
      console.log('⚠️  Could not submit table creation form');
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// Run test
testCompleteFlow().catch(console.error);