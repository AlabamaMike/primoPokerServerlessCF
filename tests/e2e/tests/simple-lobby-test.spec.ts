import { test, expect } from '@playwright/test';

test.describe('Simple Lobby Integration Test', () => {
  test('should load lobby with demo data when not authenticated', async ({ page }) => {
    console.log('=== TESTING LOBBY DEMO MODE ===');
    
    // Go directly to lobby (should show demo data even without auth)
    await page.goto('/lobby');
    await page.waitForTimeout(8000); // Wait longer for loading
    
    await page.screenshot({ path: 'lobby-test.png' });
    
    // Get page content
    const content = await page.textContent('body');
    const title = await page.title();
    
    console.log('Page title:', title);
    console.log('Content preview:', content?.substring(0, 800));
    
    // Look for key lobby elements
    const hasPokerLobby = content?.includes('Poker Lobby');
    const hasWelcome = content?.includes('Welcome') || content?.includes('Beginners');
    const hasHighStakes = content?.includes('High Stakes');
    const hasCreateTable = content?.includes('Create Table');
    const hasJoinTable = content?.includes('Join Table');
    const hasDemoData = content?.includes('Demo') || content?.includes('demo');
    const hasConnectionStatus = content?.includes('Connected') || content?.includes('Demo Data');
    
    console.log('Lobby features found:', {
      hasPokerLobby,
      hasWelcome,
      hasHighStakes,
      hasCreateTable,
      hasJoinTable,
      hasDemoData,
      hasConnectionStatus
    });
    
    // Look for table cards
    const tableCards = await page.$$('[class*="bg-white/10"]');
    console.log('Found potential table cards:', tableCards.length);
    
    // Look for buttons
    const allButtons = await page.$$('button');
    const buttonTexts = [];
    for (const button of allButtons) {
      const text = await button.textContent();
      if (text && text.trim()) {
        buttonTexts.push(text.trim());
      }
    }
    console.log('All buttons found:', buttonTexts);
    
    // Test if we can click on Join Table
    const joinButtons = buttonTexts.filter(btn => btn.includes('Join'));
    if (joinButtons.length > 0) {
      console.log('Found join buttons:', joinButtons);
      
      try {
        await page.click('button:has-text("Join Table")');
        await page.waitForTimeout(3000);
        
        const afterJoinUrl = page.url();
        console.log('URL after clicking Join Table:', afterJoinUrl);
        
        if (afterJoinUrl.includes('/game/')) {
          console.log('✅ Successfully navigated to game page');
          
          // Take screenshot of game page
          await page.screenshot({ path: 'game-page-test.png' });
          
          const gameContent = await page.textContent('body');
          console.log('Game page content preview:', gameContent?.substring(0, 400));
          
          // Look for seat selection modal or game interface
          const hasSeatSelection = gameContent?.includes('Select Your Seat') || gameContent?.includes('Seat');
          const hasBuyIn = gameContent?.includes('Buy-in') || gameContent?.includes('Buy in');
          const hasChips = gameContent?.includes('$') && gameContent?.includes('chips');
          
          console.log('Game page features:', {
            hasSeatSelection,
            hasBuyIn,
            hasChips
          });
        }
        
      } catch (error) {
        console.log('Could not click Join Table button:', error);
      }
    }
  });
  
  test('should test API connectivity from frontend', async ({ page }) => {
    console.log('=== TESTING API CONNECTIVITY FROM FRONTEND ===');
    
    await page.goto('/');
    
    // Test API calls directly from browser
    const apiResults = await page.evaluate(async () => {
      const results: any = {};
      const baseUrl = 'http://localhost:8787';
      
      try {
        const healthResponse = await fetch(`${baseUrl}/api/health`);
        results.health = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          data: await healthResponse.json()
        };
      } catch (error) {
        results.health = { error: (error as Error).message };
      }
      
      try {
        const tablesResponse = await fetch(`${baseUrl}/api/tables`);
        results.tables = {
          status: tablesResponse.status,
          ok: tablesResponse.ok,
          data: await tablesResponse.json()
        };
      } catch (error) {
        results.tables = { error: (error as Error).message };
      }
      
      // Test authentication endpoints
      try {
        const testEmail = `test${Date.now()}@example.com`;
        const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: `testuser${Date.now()}`,
            email: testEmail,
            password: 'password123'
          })
        });
        
        results.register = {
          status: registerResponse.status,
          ok: registerResponse.ok,
          data: await registerResponse.json()
        };
        
        // If registration succeeded, try to get wallet info
        if (registerResponse.ok && results.register.data?.tokens?.accessToken) {
          const walletResponse = await fetch(`${baseUrl}/api/wallet`, {
            headers: {
              'Authorization': `Bearer ${results.register.data.tokens.accessToken}`
            }
          });
          
          results.wallet = {
            status: walletResponse.status,
            ok: walletResponse.ok,
            data: await walletResponse.json()
          };
        }
        
      } catch (error) {
        results.register = { error: (error as Error).message };
      }
      
      return results;
    });
    
    console.log('=== API TEST RESULTS ===');
    console.log(JSON.stringify(apiResults, null, 2));
    
    // Validate results
    expect(apiResults.health?.status).toBe(200);
    expect(apiResults.tables?.status).toBe(200);
    
    if (apiResults.register?.status === 200) {
      console.log('✅ Registration working');
      expect(apiResults.register.data?.tokens?.accessToken).toBeTruthy();
      
      if (apiResults.wallet?.status === 200) {
        console.log('✅ Wallet API working with authentication');
        expect(apiResults.wallet.data?.success).toBe(true);
      }
    } else {
      console.log('⚠️ Registration failed:', apiResults.register);
    }
  });
  
  test('should test table creation flow', async ({ page }) => {
    console.log('=== TESTING TABLE CREATION ===');
    
    await page.goto('/lobby');
    await page.waitForTimeout(5000);
    
    // Look for Create Table button
    const createTableButtons = await page.$$('button:has-text("Create Table"), button:has-text("Create New Table")');
    
    if (createTableButtons.length > 0) {
      console.log('Found Create Table button');
      
      try {
        await createTableButtons[0].click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ path: 'create-table-modal.png' });
        
        // Look for modal
        const modalContent = await page.textContent('body');
        const hasModal = modalContent?.includes('Create New Table') || modalContent?.includes('Table Name');
        
        if (hasModal) {
          console.log('✅ Create Table modal opened');
          
          // Fill in table details
          const tableNameInput = await page.$('input[placeholder*="table name" i], input#tableName');
          if (tableNameInput) {
            await tableNameInput.fill('Test Cash Game Table');
            await page.waitForTimeout(1000);
            
            // Submit form
            const submitButton = await page.$('button[type="submit"], button:has-text("Create Table")');
            if (submitButton) {
              await submitButton.click();
              await page.waitForTimeout(3000);
              
              const afterCreateUrl = page.url();
              console.log('URL after creating table:', afterCreateUrl);
              
              if (afterCreateUrl.includes('/game/')) {
                console.log('✅ Successfully created table and navigated to game');
              }
            }
          }
        } else {
          console.log('⚠️ Create Table modal did not open');
        }
      } catch (error) {
        console.log('Error testing table creation:', error);
      }
    } else {
      console.log('⚠️ No Create Table button found');
    }
  });
});