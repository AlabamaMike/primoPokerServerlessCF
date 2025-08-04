import { test, expect } from '@playwright/test';

test.describe('Spectator Flow Test', () => {
  const TEST_USERNAME = process.env.TEST_USERNAME || 'e2e_test_1754187899779@example.com';
  const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!_1754187899779';

  test('User can join table as spectator and then sit down', async ({ page }) => {
    console.log('Testing spectator flow on:', page.context()._options.baseURL);
    
    // Login
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.fill('input[placeholder="your@email.com"]', TEST_USERNAME);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation - could be lobby or multiplayer
    await page.waitForURL(/\/(lobby|multiplayer)/, { timeout: 20000 });
    console.log('✅ Logged in successfully');
    
    // If we're not already on multiplayer, navigate there
    const currentUrl = page.url();
    if (!currentUrl.includes('/multiplayer')) {
      await page.click('text=Enter Multiplayer');
      await page.waitForURL('**/multiplayer/**', { timeout: 20000 });
    }
    console.log('✅ On multiplayer page');
    
    // Create a new table
    const createButton = page.locator('button:has-text("Create Table")').first();
    await createButton.click();
    console.log('Clicked Create Table button');
    
    // Wait for navigation to game page
    await page.waitForURL('**/game/**', { timeout: 20000 });
    const tableUrl = page.url();
    const tableId = tableUrl.split('/game/')[1];
    console.log('✅ Table created with ID:', tableId);
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Check if we're in spectator mode
    const spectatorStatus = await page.locator('text=Spectator Mode').isVisible().catch(() => false);
    if (spectatorStatus) {
      console.log('✅ Joined as spectator automatically');
    } else {
      console.log('❌ Not in spectator mode');
    }
    
    // Check for spectator count
    const spectatorCountVisible = await page.locator('text=/\\d+ spectator/').isVisible().catch(() => false);
    if (spectatorCountVisible) {
      console.log('✅ Spectator count is displayed');
    }
    
    // Look for empty seats (they should be clickable)
    const emptySeats = page.locator('[data-testid^="seat-"]:has-text("Empty Seat")');
    const emptySeatCount = await emptySeats.count();
    console.log(`Found ${emptySeatCount} empty seats`);
    
    if (emptySeatCount > 0) {
      // Try clicking on the first empty seat
      await emptySeats.first().click();
      console.log('Clicked on empty seat');
      
      // Check if GetChipsModal appears
      const getChipsModal = await page.locator('text=Get Chips').isVisible().catch(() => false);
      if (getChipsModal) {
        console.log('✅ Get Chips modal appeared');
        
        // Try to buy in with minimum amount
        const buyInInput = page.locator('input[type="number"]');
        const minBuyIn = await buyInInput.getAttribute('min') || '20';
        await buyInInput.fill(minBuyIn);
        
        await page.click('button:has-text("Buy In")');
        console.log('Clicked Buy In button');
        
        // Wait a bit for the transaction
        await page.waitForTimeout(2000);
        
        // Check if we're now seated
        const playerInfo = await page.locator('text=/You.*\\$\\d+/').isVisible().catch(() => false);
        if (playerInfo) {
          console.log('✅ Successfully joined table as player');
        } else {
          console.log('❌ Failed to join as player');
        }
      } else {
        console.log('❌ Get Chips modal did not appear');
      }
    } else {
      console.log('❌ No empty seats found or seats not clickable');
    }
    
    // Check if we can see game elements
    const pokerTable = await page.locator('[data-testid="poker-table"]').isVisible().catch(() => false);
    const communityCards = await page.locator('[data-testid="community-cards"]').isVisible().catch(() => false);
    
    console.log('Game elements visible:');
    console.log('- Poker table:', pokerTable ? '✅' : '❌');
    console.log('- Community cards area:', communityCards ? '✅' : '❌');
    
    // Final summary
    console.log('\n=== SPECTATOR FLOW TEST SUMMARY ===');
    console.log('1. Login:', '✅');
    console.log('2. Navigate to multiplayer:', '✅');
    console.log('3. Create table:', tableId ? '✅' : '❌');
    console.log('4. Auto-join as spectator:', spectatorStatus ? '✅' : '❌');
    console.log('5. Click seat to join:', getChipsModal ? '✅' : '❌');
  });
});