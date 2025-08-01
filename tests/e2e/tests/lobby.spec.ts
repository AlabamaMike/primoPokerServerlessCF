import { test, expect, Page } from '@playwright/test';

// Test lobby functionality including connection issues
class LobbyPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/lobby');
  }

  async expectConnectionStatus(status: 'connected' | 'connecting' | 'disconnected') {
    let expectedText = '';
    switch (status) {
      case 'connected':
        expectedText = 'Live Updates Active';
        break;
      case 'connecting':
        expectedText = 'Connecting...';
        break;
      case 'disconnected':
        expectedText = 'Using Demo Data';
        break;
    }
    await expect(this.page.locator(`text=${expectedText}`)).toBeVisible({ timeout: 10000 });
  }

  async expectConnectionError() {
    await expect(this.page.locator('text=Connection Error')).toBeVisible();
    await expect(this.page.locator('text=Running in demo mode')).toBeVisible();
  }

  async expectNoConnectionError() {
    await expect(this.page.locator('text=Connection Error')).not.toBeVisible();
  }

  async expectDemoMode() {
    await expect(this.page.locator('text=Demo Mode')).toBeVisible();
  }

  async expectLiveTables() {
    // Should show live tables or at least the table structure
    await expect(this.page.locator('[data-testid="table-list"]')).toBeVisible();
  }

  async checkAPIConnectivity() {
    // Test API connectivity by checking network requests
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/health') && response.status() === 200,
      { timeout: 10000 }
    );
    
    await this.page.reload();
    await responsePromise;
  }

  async checkTablesAPI() {
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/tables') && response.status() === 200,
      { timeout: 10000 }
    );
    
    await this.page.reload();
    await responsePromise;
  }

  async waitForTablesLoad() {
    // Wait for tables to load (either demo or real)
    await expect(this.page.locator('text=Beginners Table')).toBeVisible({ timeout: 15000 });
  }

  async createTable(tableName: string) {
    await this.page.click('text=Create Table');
    await this.page.fill('input[placeholder*="table name" i]', tableName);
    await this.page.click('button:has-text("Create Table")');
  }

  async joinTable(tableName: string) {
    await this.page.click(`text=${tableName} >> .. >> text=Join Table`);
  }
}

test.describe('Lobby Connection and Functionality', () => {
  let lobbyPage: LobbyPage;

  test.beforeEach(async ({ page }) => {
    lobbyPage = new LobbyPage(page);
    
    // Login first
    await page.goto('/auth/login');
    await page.fill('input[type="email"]', 'freshuser2025@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should redirect to lobby
    await expect(page).toHaveURL(/.*\/lobby/);
  });

  test('should load lobby without connection errors', async ({ page }) => {
    await lobbyPage.expectNoConnectionError();
    await lobbyPage.waitForTablesLoad();
  });

  test('should show proper connection status', async ({ page }) => {
    // Wait for connection to establish or fail
    await page.waitForTimeout(5000);
    
    // Should show either connected or demo mode, but not connecting indefinitely
    const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent();
    expect(connectionStatus).not.toContain('Connecting...');
  });

  test('should test API connectivity', async ({ page }) => {
    await lobbyPage.checkAPIConnectivity();
    // If this passes, the API is reachable
  });

  test('should test tables API endpoint', async ({ page }) => {
    await lobbyPage.checkTablesAPI();
    // If this passes, the tables endpoint is working
  });

  test('should handle demo mode gracefully if API fails', async ({ page }) => {
    // Simulate API failure by blocking network requests
    await page.route('**/api/**', route => route.abort());
    
    await lobbyPage.goto();
    await lobbyPage.expectDemoMode();
    await lobbyPage.waitForTablesLoad();
  });

  test('should display tables (demo or live)', async ({ page }) => {
    await lobbyPage.waitForTablesLoad();
    
    // Should show at least the demo tables
    await expect(page.locator('text=Beginners Table')).toBeVisible();
    await expect(page.locator('text=High Stakes')).toBeVisible();
  });

  test('should allow table filtering', async ({ page }) => {
    await lobbyPage.waitForTablesLoad();
    
    // Test search functionality
    await page.fill('input[placeholder*="Search" i]', 'Beginners');
    await expect(page.locator('text=Beginners Table')).toBeVisible();
  });

  test('should handle join table action', async ({ page }) => {
    await lobbyPage.waitForTablesLoad();
    
    // Click join on a demo table
    await page.click('text=Beginners Table >> .. >> button:has-text("Join Table")');
    
    // Should either redirect to game or show some response
    await page.waitForTimeout(2000);
  });

  test('should test network requests in detail', async ({ page }) => {
    // Capture all network requests
    const requests: string[] = [];
    const responses: string[] = [];
    
    page.on('request', request => {
      if (request.url().includes('primo-poker-server')) {
        requests.push(`${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('primo-poker-server')) {
        responses.push(`${response.status()} ${response.url()}`);
      }
    });
    
    await lobbyPage.goto();
    await page.waitForTimeout(10000); // Wait for all requests to complete
    
    console.log('Network Requests:', requests);
    console.log('Network Responses:', responses);
    
    // Verify we're making API calls
    expect(requests.length).toBeGreaterThan(0);
  });
});
