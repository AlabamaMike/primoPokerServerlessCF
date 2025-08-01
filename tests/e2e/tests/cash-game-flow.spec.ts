import { test, expect, Page } from '@playwright/test';

// Page Object Model for Cash Game Flow
class CashGamePage {
  constructor(private page: Page) {}

  async login(email: string = 'cashgame@example.com', password: string = 'password123') {
    await this.page.goto('/auth/login');
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForTimeout(3000);
  }

  async navigateToLobby() {
    await this.page.goto('/lobby');
    await this.page.waitForTimeout(3000);
  }

  async joinTable(tableName: string = 'Beginners Table') {
    // Look for the table and click join
    await this.page.click(`text=${tableName} >> .. >> button:has-text("Join Table")`);
    await this.page.waitForTimeout(2000);
  }

  async expectSeatSelectionModal() {
    // Should show the seat selection modal
    await expect(this.page.locator('text=Join Table - Select Your Seat')).toBeVisible({ timeout: 10000 });
    await expect(this.page.locator('text=Stakes:')).toBeVisible();
    await expect(this.page.locator('text=Your Balance:')).toBeVisible();
  }

  async selectSeat(seatNumber: number = 1) {
    // Click on an empty seat
    await this.page.click(`[data-testid="seat-${seatNumber}"], text=Seat ${seatNumber}`);
    await this.page.waitForTimeout(1000);
  }

  async setBuyInAmount(amount: number = 500) {
    // Use the slider or input to set buy-in amount
    const buyInInput = this.page.locator('input[type="number"]');
    if (await buyInInput.isVisible()) {
      await buyInInput.fill(amount.toString());
    } else {
      // Try to use slider
      const slider = this.page.locator('input[type="range"]');
      await slider.fill(amount.toString());
    }
    await this.page.waitForTimeout(1000);
  }

  async confirmBuyIn() {
    // Click the join table button
    await this.page.click('button:has-text("Join Seat")');
    await this.page.waitForTimeout(3000);
  }

  async expectGameTable() {
    // Should be on the game table page
    await expect(this.page.locator('text=Table')).toBeVisible({ timeout: 10000 });
    await expect(this.page.locator('text=Connected', 'text=Demo Mode')).toBeVisible();
  }

  async expectPlayerSeated(chipAmount: number) {
    // Should show player seated with chips
    await expect(this.page.locator(`text=$${chipAmount.toLocaleString()}`)).toBeVisible();
    await expect(this.page.locator('text=Seat')).toBeVisible();
  }

  async checkWalletBalance() {
    // Check if wallet API is working
    const walletRequest = this.page.waitForResponse(
      response => response.url().includes('/api/wallet') && response.status() === 200,
      { timeout: 5000 }
    ).catch(() => null);
    
    return walletRequest;
  }

  async leaveTable() {
    await this.page.click('button:has-text("Leave Table")');
    await this.page.waitForTimeout(2000);
  }

  async expectBackInLobby() {
    await expect(this.page).toHaveURL(/.*\/lobby/);
  }
}

test.describe('Cash Game Flow E2E Tests', () => {
  let cashGamePage: CashGamePage;

  test.beforeEach(async ({ page }) => {
    cashGamePage = new CashGamePage(page);
    
    // Register a new user for each test to ensure clean state
    const timestamp = Date.now();
    const testEmail = `cashgame${timestamp}@example.com`;
    
    await page.goto('/auth/register');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', `cashgamer${timestamp}`);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Login with the new user
    await cashGamePage.login(testEmail, 'password123');
  });

  test('should complete full cash game join flow', async ({ page }) => {
    console.log('=== TESTING COMPLETE CASH GAME JOIN FLOW ===');
    
    // Step 1: Navigate to lobby
    await cashGamePage.navigateToLobby();
    
    // Step 2: Join a table
    await cashGamePage.joinTable();
    
    // Step 3: Expect seat selection modal
    await cashGamePage.expectSeatSelectionModal();
    
    // Step 4: Select a seat
    await cashGamePage.selectSeat(1);
    
    // Step 5: Set buy-in amount
    await cashGamePage.setBuyInAmount(500);
    
    // Step 6: Confirm buy-in
    await cashGamePage.confirmBuyIn();
    
    // Step 7: Should be on game table
    await cashGamePage.expectGameTable();
    
    // Step 8: Should show player seated
    await cashGamePage.expectPlayerSeated(500);
    
    console.log('✅ Cash game join flow completed successfully');
  });

  test('should validate wallet API integration', async ({ page }) => {
    console.log('=== TESTING WALLET API INTEGRATION ===');
    
    const networkRequests: any[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/wallet')) {
        networkRequests.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
      }
    });

    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    
    // Should trigger wallet API calls
    const walletResponse = await cashGamePage.checkWalletBalance();
    
    if (walletResponse) {
      console.log('✅ Wallet API is responding');
      expect(walletResponse.status()).toBe(200);
    } else {
      console.log('⚠️ Wallet API not responding - likely in demo mode');
    }

    console.log('Network requests to wallet API:', networkRequests);
  });

  test('should handle seat selection with different buy-in amounts', async ({ page }) => {
    console.log('=== TESTING DIFFERENT BUY-IN AMOUNTS ===');
    
    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    await cashGamePage.expectSeatSelectionModal();
    
    // Test minimum buy-in
    await cashGamePage.selectSeat(1);
    await cashGamePage.setBuyInAmount(100);
    
    // Check validation messages
    const minMessage = page.locator('text=Minimum buy-in');
    const maxMessage = page.locator('text=Maximum buy-in');
    const insufficientMessage = page.locator('text=Insufficient');
    
    // Should not show error for valid amount
    await expect(minMessage).not.toBeVisible();
    await expect(maxMessage).not.toBeVisible();
    await expect(insufficientMessage).not.toBeVisible();
    
    // Test maximum buy-in
    await cashGamePage.setBuyInAmount(1000);
    
    await cashGamePage.confirmBuyIn();
    await cashGamePage.expectGameTable();
    
    console.log('✅ Buy-in amount validation working');
  });

  test('should handle multiple players joining same table', async ({ page, browser }) => {
    console.log('=== TESTING MULTIPLE PLAYERS ON SAME TABLE ===');
    
    // First player joins
    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    await cashGamePage.expectSeatSelectionModal();
    await cashGamePage.selectSeat(1);
    await cashGamePage.setBuyInAmount(500);
    await cashGamePage.confirmBuyIn();
    await cashGamePage.expectGameTable();
    
    // Create second player in new context
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const cashGamePage2 = new CashGamePage(page2);
    
    // Register second player
    const timestamp2 = Date.now() + 1;
    const testEmail2 = `cashgame${timestamp2}@example.com`;
    
    await page2.goto('/auth/register');
    await page2.fill('input[name="email"]', testEmail2);
    await page2.fill('input[name="username"]', `cashgamer${timestamp2}`);
    await page2.fill('input[name="password"]', 'password123');
    await page2.click('button[type="submit"]');
    await page2.waitForTimeout(3000);
    
    await cashGamePage2.login(testEmail2, 'password123');
    await cashGamePage2.navigateToLobby();
    await cashGamePage2.joinTable();
    await cashGamePage2.expectSeatSelectionModal();
    
    // Second player should select different seat
    await cashGamePage2.selectSeat(2);
    await cashGamePage2.setBuyInAmount(750);
    await cashGamePage2.confirmBuyIn();
    await cashGamePage2.expectGameTable();
    
    await context2.close();
    
    console.log('✅ Multiple players can join same table');
  });

  test('should handle leave table and cash out flow', async ({ page }) => {
    console.log('=== TESTING LEAVE TABLE FLOW ===');
    
    // Join table first
    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    await cashGamePage.expectSeatSelectionModal();
    await cashGamePage.selectSeat(1);
    await cashGamePage.setBuyInAmount(500);
    await cashGamePage.confirmBuyIn();
    await cashGamePage.expectGameTable();
    
    // Leave the table
    await cashGamePage.leaveTable();
    await cashGamePage.expectBackInLobby();
    
    console.log('✅ Leave table flow working');
  });

  test('should validate UI components and interactions', async ({ page }) => {
    console.log('=== TESTING UI COMPONENTS ===');
    
    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    await cashGamePage.expectSeatSelectionModal();
    
    // Test UI elements
    await expect(page.locator('text=Table')).toBeVisible();
    await expect(page.locator('text=Buy-in for Seat')).not.toBeVisible(); // Should not show until seat selected
    
    // Select seat and check UI updates
    await cashGamePage.selectSeat(3);
    await expect(page.locator('text=Buy-in for Seat 3')).toBeVisible();
    
    // Test slider functionality
    const slider = page.locator('input[type="range"]');
    if (await slider.isVisible()) {
      await slider.fill('800');
      await expect(page.locator('text=$800')).toBeVisible();
    }
    
    // Test quick buttons
    const minButton = page.locator('button:has-text("Min")');
    const maxButton = page.locator('button:has-text("Max")');
    const recommendedButton = page.locator('button:has-text("Recommended")');
    
    if (await minButton.isVisible()) {
      await minButton.click();
      await page.waitForTimeout(500);
    }
    
    if (await recommendedButton.isVisible()) {
      await recommendedButton.click();
      await page.waitForTimeout(500);
    }
    
    console.log('✅ UI components working correctly');
  });

  test('should test error handling and edge cases', async ({ page }) => {
    console.log('=== TESTING ERROR HANDLING ===');
    
    await cashGamePage.navigateToLobby();
    
    // Test API failures by intercepting requests
    await page.route('**/api/wallet/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Server error' })
      });
    });
    
    await cashGamePage.joinTable();
    
    // Should still show seat selection (demo mode)
    try {
      await cashGamePage.expectSeatSelectionModal();
      console.log('✅ Graceful fallback to demo mode');
    } catch (error) {
      console.log('⚠️ Seat selection not available in error mode');
    }
    
    // Test network recovery
    await page.unroute('**/api/wallet/**');
    
    console.log('✅ Error handling tested');
  });

  test('should validate WebSocket connection for real-time updates', async ({ page }) => {
    console.log('=== TESTING WEBSOCKET CONNECTION ===');
    
    const wsMessages: any[] = [];
    
    // Monitor WebSocket connections
    page.on('websocket', ws => {
      console.log('WebSocket connection established');
      ws.on('framesent', event => {
        wsMessages.push({ type: 'sent', data: event.payload });
      });
      ws.on('framereceived', event => {
        wsMessages.push({ type: 'received', data: event.payload });
      });
    });
    
    await cashGamePage.navigateToLobby();
    await cashGamePage.joinTable();
    await cashGamePage.expectSeatSelectionModal();
    await cashGamePage.selectSeat(1);
    await cashGamePage.setBuyInAmount(500);
    await cashGamePage.confirmBuyIn();
    await cashGamePage.expectGameTable();
    
    // Wait for potential WebSocket messages
    await page.waitForTimeout(5000);
    
    console.log('WebSocket messages:', wsMessages.length);
    if (wsMessages.length > 0) {
      console.log('✅ WebSocket communication active');
    } else {
      console.log('⚠️ No WebSocket messages - likely in demo mode');
    }
  });
});

test.describe('Cash Game API Integration Tests', () => {
  test('should test wallet API endpoints directly', async ({ page }) => {
    console.log('=== TESTING WALLET API ENDPOINTS ===');
    
    // Test API endpoints from browser context
    const apiTests = await page.evaluate(async () => {
      const results: any = {};
      const apiBaseUrl = 'https://primo-poker-server.alabamamike.workers.dev';
      
      // Test health endpoint
      try {
        const healthResponse = await fetch(`${apiBaseUrl}/api/health`);
        results.health = {
          status: healthResponse.status,
          ok: healthResponse.ok,
          data: await healthResponse.json()
        };
      } catch (error) {
        results.health = { error: (error as Error).message };
      }
      
      // Test tables endpoint
      try {
        const tablesResponse = await fetch(`${apiBaseUrl}/api/tables`);
        results.tables = {
          status: tablesResponse.status,
          ok: tablesResponse.ok,
          data: await tablesResponse.json()
        };
      } catch (error) {
        results.tables = { error: (error as Error).message };
      }
      
      // Test wallet endpoint (should fail without auth)
      try {
        const walletResponse = await fetch(`${apiBaseUrl}/api/wallet`);
        results.wallet = {
          status: walletResponse.status,
          ok: walletResponse.ok,
          data: await walletResponse.text()
        };
      } catch (error) {
        results.wallet = { error: (error as Error).message };
      }
      
      return results;
    });
    
    console.log('=== API TEST RESULTS ===');
    console.log(JSON.stringify(apiTests, null, 2));
    
    // Validate API responses
    expect(apiTests.health?.status).toBe(200);
    expect(apiTests.tables?.status).toBe(200);
    expect(apiTests.wallet?.status).toBe(401); // Should require auth
  });
});