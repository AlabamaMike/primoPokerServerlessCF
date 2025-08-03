const { chromium } = require('@playwright/test');

// Production URLs
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

async function runTests() {
  console.log('🎮 Primo Poker - Production E2E Tests\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Generate unique test user
    const timestamp = Date.now();
    const testUser = {
      username: `testuser_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'TestPass123!'
    };
    
    console.log('1️⃣ Testing Registration...');
    await page.goto(`${FRONTEND_URL}/register`);
    await page.waitForLoadState('networkidle');
    
    // Fill form
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    
    // Submit
    await page.click('button:has-text("Create Account")');
    
    // Wait for redirect (could go to lobby or login)
    await page.waitForURL(url => {
      const urlStr = url.toString();
      return urlStr.includes('/lobby') || urlStr.includes('/login');
    }, { timeout: 30000 });
    
    console.log('✅ Registration successful');
    console.log(`   Redirected to: ${page.url()}`);
    
    // Check if we need to login or if we're already in lobby
    if (page.url().includes('/login')) {
      console.log('\n2️⃣ Testing Login...');
      await page.fill('input[name="username"]', testUser.username);
      await page.fill('input[name="password"]', testUser.password);
      await page.click('button:has-text("Sign In")');
      await page.waitForURL('**/lobby');
      console.log('✅ Login successful');
    }
    
    // Should be in lobby now
    console.log('\n3️⃣ Testing Lobby...');
    
    // Check for wallet display
    const hasWallet = await page.locator('[data-testid="wallet-display"]').isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Wallet visible: ${hasWallet}`);
    
    // Check for create table button
    const hasCreateTable = await page.locator('button:has-text("Create Table")').isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`   Create Table button visible: ${hasCreateTable}`);
    
    if (hasCreateTable) {
      console.log('\n4️⃣ Testing Table Creation...');
      await page.click('button:has-text("Create Table")');
      
      // Fill table form if modal appears
      const formVisible = await page.locator('input[name="tableName"]').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (formVisible) {
        await page.fill('input[name="tableName"]', `Test Table ${timestamp}`);
        await page.fill('input[name="smallBlind"]', '10');
        await page.fill('input[name="bigBlind"]', '20');
        await page.fill('input[name="maxPlayers"]', '6');
        await page.fill('input[name="minBuyIn"]', '200');
        await page.fill('input[name="maxBuyIn"]', '1000');
        
        // Submit form
        await page.click('button[type="submit"]:has-text("Create")');
        
        // Wait for redirect to game
        await page.waitForURL('**/game/**', { timeout: 30000 });
        console.log('✅ Table created successfully');
        console.log(`   Game URL: ${page.url()}`);
        
        // Check for spectator mode
        console.log('\n5️⃣ Testing Game Page...');
        await page.waitForLoadState('networkidle');
        
        const isSpectator = await page.locator('text=/spectator/i').isVisible({ timeout: 5000 }).catch(() => false);
        console.log(`   In spectator mode: ${isSpectator}`);
        
        // Check for seats
        const seatCount = await page.locator('[data-testid^="seat-"]').count();
        console.log(`   Seat elements found: ${seatCount}`);
        
        // Try clicking a seat
        if (seatCount > 0) {
          console.log('\n6️⃣ Testing Seat Selection...');
          const firstSeat = page.locator('[data-testid^="seat-"]:visible').first();
          await firstSeat.click();
          
          // Check for buy-in modal
          const buyInVisible = await page.locator('text=/buy.*in/i').isVisible({ timeout: 5000 }).catch(() => false);
          console.log(`   Buy-in modal appeared: ${buyInVisible}`);
          
          if (buyInVisible) {
            // Try to buy in
            const amountInput = await page.locator('input[name="buyInAmount"]').isVisible({ timeout: 2000 }).catch(() => false);
            if (amountInput) {
              await page.fill('input[name="buyInAmount"]', '500');
              await page.click('button:has-text("Buy In")');
              
              // Wait for seat to be taken
              await page.waitForTimeout(3000);
              
              // Check if we're no longer spectator
              const stillSpectator = await page.locator('text=/spectator/i').isVisible({ timeout: 2000 }).catch(() => false);
              console.log(`   Still in spectator mode: ${stillSpectator}`);
              
              if (!stillSpectator) {
                console.log('✅ Successfully joined table!');
              }
            }
          }
        }
      }
    }
    
    console.log('\n🎉 Production tests completed!');
    
    // Take final screenshot
    await page.screenshot({ path: 'final-state.png', fullPage: true });
    console.log('📸 Final screenshot saved');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    console.log('📸 Error screenshot saved');
  } finally {
    await browser.close();
  }
}

runTests().catch(console.error);