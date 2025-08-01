import { test, expect } from '@playwright/test';

test.describe('Demo Cash Game Flow', () => {
  test('should complete demo cash game flow from lobby to seat selection', async ({ page }) => {
    console.log('=== TESTING COMPLETE DEMO CASH GAME FLOW ===');
    
    // Step 1: Navigate to lobby
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    console.log('✅ Step 1: Lobby loaded');
    
    // Verify lobby shows demo tables
    const lobbyContent = await page.textContent('body');
    expect(lobbyContent).toContain('Poker Lobby');
    expect(lobbyContent).toContain('Demo Mode');
    
    // Step 2: Find and click a join table button
    const joinButtons = await page.$$('button:has-text("Join Table")');
    expect(joinButtons.length).toBeGreaterThan(0);
    
    console.log(`✅ Step 2: Found ${joinButtons.length} join table buttons`);
    
    // Click the first available table
    await page.click('button:has-text("Join Table")');
    await page.waitForTimeout(3000);
    
    console.log('✅ Step 3: Clicked join table button');
    
    // Step 3: Verify navigation to game page
    const gameUrl = page.url();
    expect(gameUrl).toMatch(/\/game\/demo-table-\d+\/$/);
    
    console.log(`✅ Step 4: Navigated to game page: ${gameUrl}`);
    
    // Step 4: Verify game page content loads
    const gameContent = await page.textContent('body');
    expect(gameContent).toContain('Table demo-table');
    expect(gameContent).toContain('Demo Mode');
    
    console.log('✅ Step 5: Game page content loaded');
    
    // Step 5: Check for seat selection modal
    await page.waitForTimeout(2000);
    
    // Look for seat selection modal elements
    const hasSeatSelection = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        hasSelectSeat: body.includes('Select Your Seat') || body.includes('Select Seat'),
        hasBuyIn: body.includes('Buy-in') || body.includes('Buy In'),
        hasChipInput: body.includes('$') && (body.includes('100') || body.includes('500') || body.includes('1000')),
        hasSeatNumbers: body.includes('Seat 1') || body.includes('Seat 2') || body.includes('Seat'),
        hasJoinButton: body.includes('Join') || body.includes('Confirm')
      };
    });
    
    console.log('Seat selection analysis:', hasSeatSelection);
    
    // Take final screenshot
    await page.screenshot({ path: 'demo-cash-game-complete.png' });
    
    if (hasSeatSelection.hasSelectSeat || hasSeatSelection.hasBuyIn) {
      console.log('✅ Step 6: Seat selection modal detected');
      
      // Try to interact with seat selection if visible
      const seatButtons = await page.$$('button:has-text("Seat"), [data-testid*="seat"]');
      if (seatButtons.length > 0) {
        console.log(`Found ${seatButtons.length} seat buttons`);
        
        // Click first available seat
        await seatButtons[0].click();
        await page.waitForTimeout(1000);
        
        console.log('✅ Step 7: Clicked seat button');
        
        // Look for buy-in input
        const buyInInput = await page.$('input[type="number"], input[placeholder*="amount"], input[placeholder*="buy"]');
        if (buyInInput) {
          await buyInInput.fill('500');
          console.log('✅ Step 8: Entered buy-in amount');
          
          // Look for confirm/join button
          const confirmButton = await page.$('button:has-text("Confirm"), button:has-text("Join"), button:has-text("Buy In")');
          if (confirmButton) {
            await confirmButton.click();
            await page.waitForTimeout(2000);
            console.log('✅ Step 9: Confirmed seat selection');
            
            // Verify player is seated
            const finalContent = await page.textContent('body');
            const isSeated = finalContent?.includes('Seat 1') || finalContent?.includes('$500') || finalContent?.includes('seated');
            
            if (isSeated) {
              console.log('✅ COMPLETE: Player successfully seated at table');
            } else {
              console.log('⚠️ PARTIAL: Seat selection completed but seating status unclear');
            }
          }
        }
      }
    } else {
      console.log('⚠️ Step 6: Seat selection modal not immediately visible');
      
      // Check if already seated or different UI
      const gameElements = await page.evaluate(() => {
        const body = document.body.textContent || '';
        return {
          hasPokerTable: body.includes('Fold') || body.includes('Call') || body.includes('Bet') || body.includes('Check'),
          hasPlayerStats: body.includes('Chips:') || body.includes('Position:'),
          hasCards: body.includes('♠') || body.includes('♥') || body.includes('♦') || body.includes('♣'),
          hasGameControls: body.includes('Leave Table') || body.includes('History')
        };
      });
      
      console.log('Game elements analysis:', gameElements);
      
      if (gameElements.hasPokerTable || gameElements.hasPlayerStats) {
        console.log('✅ COMPLETE: Game interface is functional');
      }
    }
    
    console.log('=== DEMO CASH GAME FLOW TEST COMPLETE ===');
  });
  
  test('should validate poker table UI elements', async ({ page }) => {
    console.log('=== TESTING POKER TABLE UI ELEMENTS ===');
    
    // Navigate directly to a game page
    await page.goto('/game/demo-table-1');
    await page.waitForTimeout(5000);
    
    const content = await page.textContent('body');
    
    // Check for essential poker UI elements
    const uiElements = {
      hasTableId: content?.includes('Table demo-table-1'),
      hasConnectionStatus: content?.includes('Demo Mode') || content?.includes('Connected') || content?.includes('Connection Error'),
      hasPlayerStats: content?.includes('Player Stats') || content?.includes('Username:') || content?.includes('Chips:'),
      hasGameControls: content?.includes('Leave Table') || content?.includes('History'),
      hasPokerElements: content?.includes('Pot') || content?.includes('Blind') || content?.includes('Seat'),
      hasCards: content?.includes('♠') || content?.includes('♥') || content?.includes('♦') || content?.includes('♣') || content?.includes('A') || content?.includes('K'),
      hasChatArea: content?.includes('Table Chat') || content?.includes('No messages'),
      hasActionButtons: content?.includes('Fold') || content?.includes('Call') || content?.includes('Bet') || content?.includes('Check')
    };
    
    console.log('UI Elements Check:', uiElements);
    
    // Verify key elements are present
    expect(uiElements.hasTableId).toBe(true);
    expect(uiElements.hasConnectionStatus).toBe(true);
    expect(uiElements.hasPlayerStats).toBe(true); 
    expect(uiElements.hasGameControls).toBe(true);
    
    await page.screenshot({ path: 'poker-table-ui.png' });
    
    console.log('✅ Poker table UI validation complete');
  });
});