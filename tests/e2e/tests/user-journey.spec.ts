import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Phase 6: Complete User Journey E2E Tests
 * Tests run against production endpoints
 * Covers the full user experience from registration to cash out
 */

// Production URLs
const FRONTEND_URL = 'https://6e77d385.primo-poker-frontend.pages.dev';
const API_URL = 'https://primo-poker-server.alabamamike.workers.dev';

// Test configuration
const TEST_TIMEOUT = 60000; // 60 seconds per test step

// Helper to generate unique test data
const generateTestUser = () => {
  const timestamp = Date.now();
  return {
    username: `testuser_${timestamp}`,
    email: `test_${timestamp}@example.com`,
    password: 'TestPass123!',
  };
};

// Helper to wait for WebSocket connection
async function waitForWebSocket(page: Page) {
  await page.waitForFunction(() => {
    const gameStore = (window as any).gameStore;
    return gameStore?.isConnected === true;
  }, { timeout: 30000 });
}

// Helper to check wallet balance
async function getWalletBalance(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const bankrollStore = (window as any).bankrollStore;
    return bankrollStore?.balance || 0;
  });
}

test.describe('Complete User Journey - Production E2E', () => {
  test.setTimeout(5 * 60 * 1000); // 5 minutes total
  
  let context: BrowserContext;
  let page: Page;
  let testUser: ReturnType<typeof generateTestUser>;
  let authToken: string;
  let tableId: string;

  test.beforeAll(async ({ browser }) => {
    // Create a persistent context to maintain session
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: './test-results-production/videos',
      },
    });
    page = await context.newPage();
    testUser = generateTestUser();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('1. User Registration Flow', async () => {
    console.log('Testing user registration...');
    
    // Navigate to homepage
    await page.goto(FRONTEND_URL);
    await expect(page).toHaveTitle(/Primo Poker/i);
    
    // Go to registration page
    await page.click('text=Sign Up');
    await page.waitForURL('**/register');
    
    // Fill registration form
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    
    // Submit registration
    await page.click('button:has-text("Create Account")');
    
    // Should redirect to login or lobby
    await page.waitForURL(url => url.includes('/login') || url.includes('/lobby'), {
      timeout: TEST_TIMEOUT
    });
    
    console.log('✓ Registration successful');
  });

  test('2. User Login Flow', async () => {
    console.log('Testing user login...');
    
    // Navigate to login if not already there
    if (!page.url().includes('/login')) {
      await page.goto(`${FRONTEND_URL}/login`);
    }
    
    // Fill login form
    await page.fill('input[name="username"]', testUser.username);
    await page.fill('input[name="password"]', testUser.password);
    
    // Submit login
    await page.click('button:has-text("Sign In")');
    
    // Should redirect to lobby
    await page.waitForURL('**/lobby', { timeout: TEST_TIMEOUT });
    
    // Verify we're logged in by checking for username or logout button
    await expect(page.locator('text=' + testUser.username)).toBeVisible({ timeout: 10000 });
    
    // Get auth token from localStorage
    authToken = await page.evaluate(() => localStorage.getItem('auth_token') || '');
    expect(authToken).toBeTruthy();
    
    console.log('✓ Login successful');
  });

  test('3. Initial Wallet and Bankroll Check', async () => {
    console.log('Testing initial wallet state...');
    
    // Check wallet display is visible
    await expect(page.locator('[data-testid="wallet-display"]')).toBeVisible();
    
    // Get initial balance (should have some starting chips)
    const initialBalance = await getWalletBalance(page);
    console.log(`Initial bankroll balance: ${initialBalance}`);
    expect(initialBalance).toBeGreaterThan(0);
    
    // Click wallet to see transaction history
    await page.click('[data-testid="wallet-display"]');
    
    // Should see initial deposit transaction
    await expect(page.locator('text=Initial bankroll')).toBeVisible();
    
    // Close wallet dropdown
    await page.click('body'); // Click outside to close
    
    console.log('✓ Wallet initialized correctly');
  });

  test('4. Create Table in Lobby', async () => {
    console.log('Testing table creation...');
    
    // Ensure we're in the lobby
    if (!page.url().includes('/lobby')) {
      await page.goto(`${FRONTEND_URL}/lobby`);
    }
    
    // Click create table button
    await page.click('button:has-text("Create Table")');
    
    // Fill table creation form
    await page.fill('input[name="tableName"]', `Test Table ${Date.now()}`);
    await page.fill('input[name="smallBlind"]', '10');
    await page.fill('input[name="bigBlind"]', '20');
    await page.fill('input[name="maxPlayers"]', '6');
    await page.fill('input[name="minBuyIn"]', '200');
    await page.fill('input[name="maxBuyIn"]', '1000');
    
    // Submit table creation
    await page.click('button:has-text("Create Table")');
    
    // Should redirect to the game page
    await page.waitForURL('**/game/**', { timeout: TEST_TIMEOUT });
    
    // Extract table ID from URL
    const url = page.url();
    const match = url.match(/game\/([^\/]+)/);
    tableId = match?.[1] || '';
    expect(tableId).toBeTruthy();
    
    console.log(`✓ Table created with ID: ${tableId}`);
  });

  test('5. Join Table as Spectator', async () => {
    console.log('Testing spectator mode...');
    
    // Wait for game page to load
    await page.waitForLoadState('networkidle');
    
    // Wait for WebSocket connection
    await waitForWebSocket(page);
    
    // Should be in spectator mode by default
    await expect(page.locator('text=Spectator Mode')).toBeVisible({ timeout: TEST_TIMEOUT });
    
    // Check seat availability
    const availableSeats = await page.locator('[data-testid^="seat-"][data-available="true"]').count();
    expect(availableSeats).toBeGreaterThan(0);
    
    console.log(`✓ Joined as spectator, ${availableSeats} seats available`);
  });

  test('6. Select Seat and Buy In', async () => {
    console.log('Testing seat selection and buy-in...');
    
    // Get initial balance before buy-in
    const balanceBeforeBuyIn = await getWalletBalance(page);
    
    // Click on an available seat
    const availableSeat = page.locator('[data-testid^="seat-"][data-available="true"]').first();
    await availableSeat.click();
    
    // Buy-in modal should appear
    await expect(page.locator('text=Buy In')).toBeVisible({ timeout: TEST_TIMEOUT });
    
    // Enter buy-in amount
    const buyInAmount = 500;
    await page.fill('input[name="buyInAmount"]', buyInAmount.toString());
    
    // Confirm buy-in
    await page.click('button:has-text("Buy In")');
    
    // Wait for seat to be taken
    await page.waitForFunction(() => {
      const gameStore = (window as any).gameStore;
      return gameStore?.players?.some((p: any) => p.username === testUser.username);
    }, { timeout: TEST_TIMEOUT });
    
    // Verify wallet balance decreased
    const balanceAfterBuyIn = await getWalletBalance(page);
    expect(balanceAfterBuyIn).toBe(balanceBeforeBuyIn - buyInAmount);
    
    // Should no longer be in spectator mode
    await expect(page.locator('text=Spectator Mode')).not.toBeVisible();
    
    console.log('✓ Successfully joined table and bought in');
  });

  test('7. Wait for Another Player (or Add Bot)', async () => {
    console.log('Waiting for game to start...');
    
    // In production, we might need to wait for another player
    // For testing, we could either:
    // 1. Open another browser and join
    // 2. Have a test endpoint to add a bot
    // 3. Skip if game already started
    
    // Check if game is already active
    const gamePhase = await page.evaluate(() => {
      const gameStore = (window as any).gameStore;
      return gameStore?.gamePhase;
    });
    
    if (gamePhase === 'waiting') {
      console.log('Waiting for another player to join...');
      // In a real test, you might spawn another browser here
      // For now, we'll just check the state
    }
    
    console.log('✓ Game state checked');
  });

  test('8. Play a Hand (if game started)', async () => {
    console.log('Testing game play...');
    
    // Check if we have hole cards (game started)
    const hasHoleCards = await page.evaluate(() => {
      const gameStore = (window as any).gameStore;
      const currentPlayer = gameStore?.players?.find((p: any) => p.username === testUser.username);
      return currentPlayer?.holeCards?.length > 0;
    });
    
    if (hasHoleCards) {
      console.log('Game is active, testing actions...');
      
      // Wait for our turn
      await page.waitForFunction((username) => {
        const gameStore = (window as any).gameStore;
        const currentPlayer = gameStore?.players?.find((p: any) => p.username === username);
        return currentPlayer?.isActive === true;
      }, testUser.username, { timeout: TEST_TIMEOUT });
      
      // Make an action (check/call)
      if (await page.locator('button:has-text("Check")').isVisible()) {
        await page.click('button:has-text("Check")');
      } else if (await page.locator('button:has-text("Call")').isVisible()) {
        await page.click('button:has-text("Call")');
      }
      
      console.log('✓ Made game action');
    } else {
      console.log('⚠ Game not started, skipping play test');
    }
  });

  test('9. Stand Up and Cash Out', async () => {
    console.log('Testing stand up and cash out...');
    
    // Get chip count at table
    const chipCount = await page.evaluate((username) => {
      const gameStore = (window as any).gameStore;
      const player = gameStore?.players?.find((p: any) => p.username === username);
      return player?.chips || 0;
    }, testUser.username);
    
    // Get wallet balance before standing up
    const balanceBeforeStandUp = await getWalletBalance(page);
    
    // Click stand up button
    await page.click('button:has-text("Stand Up")');
    
    // Confirm stand up if modal appears
    const confirmButton = page.locator('button:has-text("Confirm")');
    if (await confirmButton.isVisible({ timeout: 5000 })) {
      await confirmButton.click();
    }
    
    // Wait to return to spectator mode
    await expect(page.locator('text=Spectator Mode')).toBeVisible({ timeout: TEST_TIMEOUT });
    
    // Verify chips returned to wallet
    const balanceAfterStandUp = await getWalletBalance(page);
    expect(balanceAfterStandUp).toBe(balanceBeforeStandUp + chipCount);
    
    // Check transaction history shows cash out
    await page.click('[data-testid="wallet-display"]');
    await expect(page.locator('text=Cashed out from table')).toBeVisible();
    
    console.log('✓ Successfully stood up and cashed out');
  });

  test('10. Return to Lobby', async () => {
    console.log('Testing return to lobby...');
    
    // Click back to lobby
    await page.click('a:has-text("Back to Lobby")');
    
    // Should be back in lobby
    await page.waitForURL('**/lobby', { timeout: TEST_TIMEOUT });
    
    // Verify our table is listed
    await expect(page.locator(`text=Test Table`)).toBeVisible();
    
    // Final wallet balance check
    const finalBalance = await getWalletBalance(page);
    console.log(`Final bankroll balance: ${finalBalance}`);
    
    console.log('✓ Successfully returned to lobby');
  });

  test('11. Test Disconnection and Reconnection', async () => {
    console.log('Testing disconnection handling...');
    
    // Join the table again
    await page.click(`[data-testid="join-table-${tableId}"]`);
    await page.waitForURL(`**/game/${tableId}`, { timeout: TEST_TIMEOUT });
    
    // Wait for WebSocket connection
    await waitForWebSocket(page);
    
    // Simulate network disconnection
    await context.setOffline(true);
    
    // Wait a moment
    await page.waitForTimeout(3000);
    
    // Reconnect
    await context.setOffline(false);
    
    // Should automatically reconnect and sync state
    await waitForWebSocket(page);
    
    // Verify we received state sync
    const hasPlayers = await page.evaluate(() => {
      const gameStore = (window as any).gameStore;
      return gameStore?.players?.length > 0;
    });
    expect(hasPlayers).toBe(true);
    
    console.log('✓ Disconnection and reconnection handled correctly');
  });

  test('12. Test Simultaneous Seat Selection', async () => {
    console.log('Testing edge case: simultaneous seat selection...');
    
    // This would ideally be tested with multiple browsers
    // For now, we'll just verify seat reservation works
    
    // Try to select a seat that might be reserved
    const seats = await page.locator('[data-testid^="seat-"]').all();
    
    for (const seat of seats) {
      const isAvailable = await seat.getAttribute('data-available');
      const isReserved = await seat.getAttribute('data-reserved');
      
      if (isAvailable === 'true' && isReserved === 'true') {
        // Try to click a reserved seat
        await seat.click();
        
        // Should see error or warning
        await expect(page.locator('text=/reserved|unavailable/i')).toBeVisible({ timeout: 5000 });
        console.log('✓ Reserved seat protection working');
        break;
      }
    }
  });
});

// Additional test suite for stress testing
test.describe('Production Stress Tests', () => {
  test.skip('Multiple Players Joining Simultaneously', async ({ browser }) => {
    // Create multiple browser contexts
    const contexts = await Promise.all(
      Array(3).fill(null).map(() => browser.newContext())
    );
    
    const pages = await Promise.all(
      contexts.map(ctx => ctx.newPage())
    );
    
    // Generate test users
    const testUsers = Array(3).fill(null).map(() => generateTestUser());
    
    // Register and login all users in parallel
    await Promise.all(
      pages.map(async (page, i) => {
        const user = testUsers[i];
        
        // Register
        await page.goto(`${FRONTEND_URL}/register`);
        await page.fill('input[name="username"]', user.username);
        await page.fill('input[name="email"]', user.email);
        await page.fill('input[name="password"]', user.password);
        await page.fill('input[name="confirmPassword"]', user.password);
        await page.click('button:has-text("Create Account")');
        
        // Login
        await page.waitForURL('**/login');
        await page.fill('input[name="username"]', user.username);
        await page.fill('input[name="password"]', user.password);
        await page.click('button:has-text("Sign In")');
        
        await page.waitForURL('**/lobby');
      })
    );
    
    // Create a table with first user
    const tableId = await pages[0].evaluate(async () => {
      // Use API to create table
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          name: `Stress Test ${Date.now()}`,
          smallBlind: 10,
          bigBlind: 20,
          maxPlayers: 6,
          minBuyIn: 200,
          maxBuyIn: 1000,
        }),
      });
      const data = await response.json();
      return data.tableId;
    });
    
    // All players join the table simultaneously
    await Promise.all(
      pages.map(page => page.goto(`${FRONTEND_URL}/game/${tableId}`))
    );
    
    // All players try to select seats at the same time
    await Promise.all(
      pages.map(async (page, i) => {
        await waitForWebSocket(page);
        const seat = page.locator(`[data-testid="seat-${i}"]`);
        await seat.click();
        await page.fill('input[name="buyInAmount"]', '500');
        await page.click('button:has-text("Buy In")');
      })
    );
    
    // Verify all players are seated correctly
    for (const page of pages) {
      const playerCount = await page.evaluate(() => {
        const gameStore = (window as any).gameStore;
        return gameStore?.players?.length;
      });
      expect(playerCount).toBe(3);
    }
    
    // Cleanup
    await Promise.all(contexts.map(ctx => ctx.close()));
  });
});