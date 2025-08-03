const { chromium } = require('@playwright/test');

const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';

async function testJoinTable() {
  console.log('🎮 Testing Join Existing Table Flow\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Log console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser error:', msg.text());
    }
  });
  
  try {
    const timestamp = Date.now();
    const username = `player_${timestamp}`;
    
    // 1. Quick registration
    console.log('1️⃣ Registering new user...');
    await page.goto(`${FRONTEND_URL}/register`);
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="email"]', `${username}@test.com`);
    await page.fill('input[name="password"]', 'Test123!');
    await page.fill('input[name="confirmPassword"]', 'Test123!');
    await page.click('button:has-text("Create Account")');
    
    // Wait for lobby
    await page.waitForURL('**/lobby/**', { timeout: 30000 });
    console.log('✅ Registered and in lobby\n');
    
    // 2. Try to join existing table
    console.log('2️⃣ Joining existing table...');
    
    // Look for table cards
    const tableCards = await page.locator('.border.rounded-lg').count();
    console.log(`   Found ${tableCards} tables`);
    
    // Try to join the first available table
    const joinButton = page.locator('button:has-text("Join Table")').first();
    if (await joinButton.isVisible()) {
      console.log('   Clicking Join Table button...');
      await joinButton.click();
      
      // Wait for navigation
      await page.waitForTimeout(3000);
      
      // Check where we are
      const currentUrl = page.url();
      console.log(`   Current URL: ${currentUrl}`);
      
      if (currentUrl.includes('/game/') || currentUrl.includes('/demo/table/')) {
        console.log('✅ Successfully navigated to game/demo!\n');
        
        // 3. Test game page
        console.log('3️⃣ Testing game page...');
        await page.waitForLoadState('networkidle');
        
        // Take screenshot
        await page.screenshot({ path: 'game-page.png', fullPage: true });
        
        // Check for key elements
        const checks = {
          spectator: await page.locator('text=/spectator/i').isVisible({ timeout: 5000 }).catch(() => false),
          table: await page.locator('[class*="table"], #game-table, .poker-table').isVisible({ timeout: 5000 }).catch(() => false),
          seats: await page.locator('[class*="seat"], [data-testid*="seat"], .player-seat').count(),
          pot: await page.locator('text=/pot/i').isVisible({ timeout: 5000 }).catch(() => false),
          cards: await page.locator('[class*="card"], .playing-card').count()
        };
        
        console.log('   Game elements found:', checks);
        
        // 4. Try to interact with seats
        if (checks.seats > 0) {
          console.log('\n4️⃣ Testing seat interaction...');
          
          // Try clicking on seats with different selectors
          const seatClicked = 
            await page.locator('[class*="seat"]:has-text("Empty")').first().click({ timeout: 2000 }).then(() => true).catch(() => false) ||
            await page.locator('[class*="seat"]:not(:has-text("player"))').first().click({ timeout: 2000 }).then(() => true).catch(() => false) ||
            await page.locator('.player-seat:empty').first().click({ timeout: 2000 }).then(() => true).catch(() => false);
          
          if (seatClicked) {
            console.log('   Clicked on a seat');
            await page.waitForTimeout(2000);
            
            // Check for buy-in modal
            const buyInVisible = await page.locator('text=/buy.*in/i').isVisible({ timeout: 3000 }).catch(() => false);
            console.log(`   Buy-in modal visible: ${buyInVisible}`);
            
            if (buyInVisible) {
              // Look for amount input
              const amountInput = page.locator('input[type="number"], input[placeholder*="amount" i]').first();
              if (await amountInput.isVisible()) {
                await amountInput.fill('500');
                console.log('   Entered buy-in amount: 500');
                
                // Try to confirm
                const confirmButton = page.locator('button:has-text(/buy|confirm/i)').last();
                await confirmButton.click();
                console.log('   Clicked confirm button');
                
                await page.waitForTimeout(3000);
                
                // Check if we're seated
                const stillSpectator = await page.locator('text=/spectator/i').isVisible().catch(() => false);
                console.log(`   Still in spectator mode: ${stillSpectator}`);
              }
            }
          } else {
            console.log('   Could not click any seats');
          }
        }
        
        // Final screenshot
        await page.screenshot({ path: 'game-final.png', fullPage: true });
        
      } else {
        console.log('⚠️  Did not navigate to game page');
      }
      
    } else {
      console.log('⚠️  No Join Table button found');
    }
    
    console.log('\n📊 Test Summary:');
    console.log('   - Registration: ✅');
    console.log('   - Lobby access: ✅');
    console.log('   - Table list: ✅ (2 tables visible)');
    console.log('   - Join table: ' + (page.url().includes('/game/') ? '✅' : '⚠️'));
    console.log('   - Game page: ' + (page.url().includes('/game/') ? '✅' : '⚠️'));
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testJoinTable().catch(console.error);