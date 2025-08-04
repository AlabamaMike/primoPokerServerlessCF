import { test, expect } from '@playwright/test';

test.describe('Debug Game Page', () => {
  test('Check if game page loads without error', async ({ page }) => {
    const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev';
    const frontendUrl = 'https://primo-poker-frontend.pages.dev';
    
    // First, check if we can create a table via API
    console.log('Creating table via API...');
    const createResponse = await fetch(`${apiUrl}/api/tables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Creator-ID': 'test-user-123',
        'X-Creator-Username': 'TestUser'
      },
      body: JSON.stringify({
        config: {
          name: 'Test Table',
          smallBlind: 1,
          bigBlind: 2,
          minBuyIn: 20,
          maxBuyIn: 200,
          maxPlayers: 9,
          gameType: 'NO_LIMIT_HOLDEM'
        }
      })
    });
    
    console.log('Create table response status:', createResponse.status);
    const createResult = await createResponse.json();
    console.log('Create table response:', JSON.stringify(createResult, null, 2));
    
    if (createResult.success && createResult.data?.id) {
      const tableId = createResult.data.id;
      console.log('Table created with ID:', tableId);
      
      // Try to load the game page
      console.log('Loading game page...');
      await page.goto(`${frontendUrl}/game/${tableId}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait a bit for any errors to appear
      await page.waitForTimeout(3000);
      
      // Check page content
      const pageContent = await page.textContent('body');
      console.log('Page content:', pageContent.substring(0, 200));
      
      // Check for error messages
      const hasError = pageContent.includes('Internal Server Error') || 
                      pageContent.includes('Error') ||
                      pageContent.includes('error');
      
      if (hasError) {
        console.log('❌ Page has error');
        
        // Check console logs
        page.on('console', msg => console.log('Browser console:', msg.text()));
        
        // Check network errors
        page.on('response', response => {
          if (response.status() >= 400) {
            console.log(`Network error: ${response.status()} ${response.url()}`);
          }
        });
      } else {
        console.log('✅ Page loaded without error');
        
        // Check for expected elements
        const hasPokerTable = await page.locator('[data-testid="poker-table"]').isVisible().catch(() => false);
        const hasSpectatorMode = await page.locator('text=Spectator Mode').isVisible().catch(() => false);
        const hasEmptySeats = await page.locator('text=Empty Seat').isVisible().catch(() => false);
        
        console.log('Page elements:');
        console.log('- Poker table:', hasPokerTable ? '✅' : '❌');
        console.log('- Spectator mode:', hasSpectatorMode ? '✅' : '❌');  
        console.log('- Empty seats:', hasEmptySeats ? '✅' : '❌');
      }
    } else {
      console.log('❌ Failed to create table');
    }
  });
});