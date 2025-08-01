import { test, expect, Page } from '@playwright/test';

// Improved Page Object Model based on actual frontend structure
class ImprovedCashGamePage {
  constructor(private page: Page) {}

  async register(email: string, username: string, password: string) {
    await this.page.goto('/auth/register');
    await this.page.waitForTimeout(2000);
    
    // Use placeholder-based selectors since name attributes aren't present
    await this.page.fill('input[placeholder*="PokerPro" i]', username);
    await this.page.fill('input[placeholder*="email" i]', email);
    
    // Fill both password fields
    const passwordInputs = await this.page.$$('input[type="password"]');
    if (passwordInputs.length >= 2) {
      await passwordInputs[0].fill(password);
      await passwordInputs[1].fill(password); // Confirm password
    }
    
    await this.page.click('button:has-text("Create Account")');
    await this.page.waitForTimeout(3000);
  }

  async login(email: string, password: string) {
    await this.page.goto('/auth/login');
    await this.page.waitForTimeout(2000);
    
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button:has-text("Sign In")');
    await this.page.waitForTimeout(3000);
  }

  async navigateToLobby() {
    await this.page.goto('/lobby');
    await this.page.waitForTimeout(5000);
  }

  async takeDebugScreenshot(name: string) {
    await this.page.screenshot({ path: `debug-${name}.png` });
  }

  async analyzePageContent() {
    const content = await this.page.textContent('body');
    const title = await this.page.title();
    const url = this.page.url();
    
    return {
      title,
      url,
      contentPreview: content?.substring(0, 500),
      hasLogin: content?.includes('Login') || content?.includes('Sign In'),
      hasLobby: content?.includes('lobby') || content?.includes('Lobby'),
      hasTable: content?.includes('Table') || content?.includes('table'),
      hasJoin: content?.includes('Join'),
      hasCreate: content?.includes('Create'),
      hasDemoMode: content?.includes('Demo Mode'),
      hasConnected: content?.includes('Connected'),
      hasError: content?.includes('Error') || content?.includes('error')
    };
  }

  async findAvailableActions() {
    // Look for clickable elements
    const buttons = await this.page.$$('button');
    const links = await this.page.$$('a');
    
    const buttonTexts = [];
    for (const button of buttons) {
      const text = await button.textContent();
      if (text && text.trim()) {
        buttonTexts.push(text.trim());
      }
    }
    
    const linkTexts = [];
    for (const link of links) {
      const text = await link.textContent();
      if (text && text.trim()) {
        linkTexts.push(text.trim());
      }
    }
    
    return { buttons: buttonTexts, links: linkTexts };
  }

  async testAPIEndpoints() {
    return await this.page.evaluate(async () => {
      const results: any = {};
      const baseUrl = 'http://localhost:8787';
      
      // Test health endpoint
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
      
      // Test tables endpoint
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
      
      // Test wallet endpoint (should require auth)
      try {
        const walletResponse = await fetch(`${baseUrl}/api/wallet`);
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
  }
}

test.describe('Improved Cash Game Flow Tests', () => {
  let cashGamePage: ImprovedCashGamePage;

  test.beforeEach(async ({ page }) => {
    cashGamePage = new ImprovedCashGamePage(page);
  });

  test('should analyze registration and login flow', async ({ page }) => {
    console.log('=== ANALYZING REGISTRATION AND LOGIN FLOW ===');
    
    // Test registration page
    await page.goto('/auth/register');
    await page.waitForTimeout(3000);
    
    const registerAnalysis = await cashGamePage.analyzePageContent();
    const registerActions = await cashGamePage.findAvailableActions();
    
    console.log('Registration page analysis:', registerAnalysis);
    console.log('Available actions:', registerActions);
    
    await cashGamePage.takeDebugScreenshot('register');
    
    // Try to register a new user
    const timestamp = Date.now();
    const testEmail = `test${timestamp}@example.com`;
    const testUsername = `testuser${timestamp}`;
    
    try {
      await cashGamePage.register(testEmail, testUsername, 'password123');
      
      const postRegisterAnalysis = await cashGamePage.analyzePageContent();
      console.log('After registration:', postRegisterAnalysis);
      
      await cashGamePage.takeDebugScreenshot('post-register');
      
      // Try to login
      await cashGamePage.login(testEmail, 'password123');
      
      const postLoginAnalysis = await cashGamePage.analyzePageContent();
      console.log('After login:', postLoginAnalysis);
      
      await cashGamePage.takeDebugScreenshot('post-login');
      
    } catch (error) {
      console.log('Registration/Login failed:', error);
      await cashGamePage.takeDebugScreenshot('register-error');
    }
  });

  test('should explore lobby functionality', async ({ page }) => {
    console.log('=== EXPLORING LOBBY FUNCTIONALITY ===');
    
    await cashGamePage.navigateToLobby();
    
    const lobbyAnalysis = await cashGamePage.analyzePageContent();
    const lobbyActions = await cashGamePage.findAvailableActions();
    
    console.log('Lobby analysis:', lobbyAnalysis);
    console.log('Lobby actions:', lobbyActions);
    
    await cashGamePage.takeDebugScreenshot('lobby');
    
    // Try to find any tables or join buttons
    const tableElements = await page.$$('*:has-text("Table")');
    const joinElements = await page.$$('*:has-text("Join")');
    
    console.log('Found elements with "Table":', tableElements.length);
    console.log('Found elements with "Join":', joinElements.length);
    
    // Check for any game-related buttons
    const gameButtons = lobbyActions.buttons.filter(btn => 
      btn.includes('Join') || 
      btn.includes('Create') || 
      btn.includes('Table') ||
      btn.includes('Game')
    );
    
    console.log('Game-related buttons:', gameButtons);
  });

  test('should test direct table navigation', async ({ page }) => {
    console.log('=== TESTING DIRECT TABLE NAVIGATION ===');
    
    // Try to navigate directly to a game table
    await page.goto('/game/test-table-1');
    await page.waitForTimeout(5000);
    
    const gameAnalysis = await cashGamePage.analyzePageContent();
    const gameActions = await cashGamePage.findAvailableActions();
    
    console.log('Game page analysis:', gameAnalysis);
    console.log('Game actions:', gameActions);
    
    await cashGamePage.takeDebugScreenshot('game-table');
    
    // Look for seat selection or poker-related elements
    const seatElements = await page.$$('*:has-text("Seat")');
    const chipElements = await page.$$('*:has-text("$")');
    const pokerElements = await page.$$('*:has-text("Poker")');
    
    console.log('Seat elements:', seatElements.length);
    console.log('Chip elements:', chipElements.length);
    console.log('Poker elements:', pokerElements.length);
  });

  test('should test API connectivity and integration', async ({ page }) => {
    console.log('=== TESTING API CONNECTIVITY ===');
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const apiResults = await cashGamePage.testAPIEndpoints();
    
    console.log('=== API TEST RESULTS ===');
    console.log(JSON.stringify(apiResults, null, 2));
    
    // Validate API responses
    expect(apiResults.health?.status).toBe(200);
    expect(apiResults.health?.data?.success).toBe(true);
    
    if (apiResults.tables?.status === 200) {
      console.log('✅ Tables API is working');
      expect(apiResults.tables.data?.success).toBe(true);
    } else {
      console.log('⚠️ Tables API returned:', apiResults.tables?.status);
    }
    
    // Wallet should require authentication
    expect(apiResults.wallet?.status).toBe(401);
    console.log('✅ Wallet API properly requires authentication');
  });

  test('should test manual game flow if possible', async ({ page }) => {
    console.log('=== TESTING MANUAL GAME FLOW ===');
    
    // Go to lobby and look for any available interactions
    await cashGamePage.navigateToLobby();
    await page.waitForTimeout(5000);
    
    const actions = await cashGamePage.findAvailableActions();
    console.log('Available actions in lobby:', actions);
    
    // Try clicking on any table-related buttons
    const tableButtons = actions.buttons.filter(btn => 
      btn.toLowerCase().includes('table') || 
      btn.toLowerCase().includes('join') ||
      btn.toLowerCase().includes('play')
    );
    
    if (tableButtons.length > 0) {
      console.log('Found table buttons:', tableButtons);
      
      try {
        // Click the first table-related button
        await page.click(`button:has-text("${tableButtons[0]}")`);
        await page.waitForTimeout(3000);
        
        const afterClickAnalysis = await cashGamePage.analyzePageContent();
        console.log('After clicking table button:', afterClickAnalysis);
        
        await cashGamePage.takeDebugScreenshot('after-table-click');
        
        // Look for seat selection modal or game interface
        const modalElements = await page.$$('[role="dialog"], .modal, *:has-text("Select Your Seat")');
        console.log('Found modal elements:', modalElements.length);
        
        if (modalElements.length > 0) {
          console.log('✅ Found modal or dialog - likely seat selection');
          
          // Look for seat-related elements
          const seatButtons = await page.$$('*:has-text("Seat")');
          console.log('Found seat elements:', seatButtons.length);
          
          if (seatButtons.length > 0) {
            // Try clicking a seat
            await seatButtons[0].click();
            await page.waitForTimeout(2000);
            
            await cashGamePage.takeDebugScreenshot('seat-selected');
            
            // Look for buy-in controls
            const buyInElements = await page.$$('input[type="range"], input[type="number"], *:has-text("Buy-in")');
            console.log('Found buy-in elements:', buyInElements.length);
          }
        }
        
      } catch (error) {
        console.log('Error clicking table button:', error);
      }
    } else {
      console.log('No table-related buttons found');
    }
  });
});