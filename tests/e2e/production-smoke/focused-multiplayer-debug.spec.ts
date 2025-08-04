import { test, expect } from '@playwright/test';

test.describe('Focused Multiplayer Debug', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';
  
  test('Debug multiplayer flow step by step', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    });
    
    page.on('requestfailed', request => {
      console.log(`[Request Failed] ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    // Step 1: Go directly to login page
    console.log('\n=== Step 1: Navigate to login page ===');
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/auth/login');
    await page.screenshot({ path: 'test-results/step1-login-page.png' });
    
    // Step 2: Login
    console.log('\n=== Step 2: Perform login ===');
    await page.fill('input[placeholder="your@email.com"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button:has-text("Sign In")');
    
    // Wait for navigation
    await page.waitForURL(/\/lobby/, { timeout: 10000 });
    console.log('Successfully logged in and reached lobby');
    await page.screenshot({ path: 'test-results/step2-lobby.png' });
    
    // Step 3: Check lobby state
    console.log('\n=== Step 3: Check lobby state ===');
    const lobbyText = await page.textContent('body');
    console.log('Lobby contains "Enter Multiplayer"?', lobbyText?.includes('Enter Multiplayer'));
    
    // Step 4: Navigate to multiplayer
    console.log('\n=== Step 4: Navigate to multiplayer ===');
    const enterButton = page.locator('button:has-text("Enter Multiplayer")');
    await expect(enterButton).toBeVisible({ timeout: 10000 });
    await enterButton.click();
    
    // Wait for multiplayer page
    await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
    console.log('Reached multiplayer page');
    await page.screenshot({ path: 'test-results/step4-multiplayer.png' });
    
    // Step 5: Check multiplayer page state
    console.log('\n=== Step 5: Check multiplayer page state ===');
    await page.waitForTimeout(3000); // Give time for WebSocket to connect
    
    const pageContent = await page.textContent('body');
    console.log('API Connected visible?', pageContent?.includes('API Connected'));
    console.log('Create Table visible?', pageContent?.includes('Create Table'));
    console.log('Any errors visible?', /error|failed|disconnected/i.test(pageContent || ''));
    
    // Check for specific elements
    const apiStatus = await page.locator('text="API Connected"').count();
    const wsStatus = await page.locator('text=/websocket.*connected/i').count();
    const createBtn = await page.locator('button:has-text("Create Table")').count();
    
    console.log(`Elements found - API Status: ${apiStatus}, WS Status: ${wsStatus}, Create Button: ${createBtn}`);
    
    // Step 6: Monitor WebSocket
    console.log('\n=== Step 6: Inject WebSocket monitor ===');
    const wsInfo = await page.evaluate(() => {
      // Check if there are any WebSocket connections
      const sockets: any[] = [];
      // @ts-ignore
      if (window._wsConnections) {
        // @ts-ignore
        window._wsConnections.forEach((ws: any) => {
          sockets.push({
            url: ws.url,
            readyState: ws.readyState,
            readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState]
          });
        });
      }
      return { socketCount: sockets.length, sockets };
    });
    
    console.log('WebSocket info:', JSON.stringify(wsInfo, null, 2));
    
    // Step 7: Try to create table
    console.log('\n=== Step 7: Attempt table creation ===');
    const createButton = page.locator('button:has-text("Create Table")');
    
    if (await createButton.isVisible()) {
      console.log('Create Table button is visible, clicking...');
      
      // Set up request monitoring
      const apiCalls: any[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          apiCalls.push({
            method: request.method(),
            url: request.url(),
            headers: request.headers()
          });
        }
      });
      
      page.on('response', response => {
        if (response.url().includes('/api/')) {
          console.log(`[API Response] ${response.status()} ${response.url()}`);
        }
      });
      
      await createButton.click();
      
      // Wait for either navigation or error
      const result = await Promise.race([
        page.waitForURL(/\/game\//, { timeout: 15000 }).then(() => 'success'),
        page.locator('text=/failed|error/i').waitFor({ timeout: 5000 }).then(() => 'error'),
        page.waitForTimeout(10000).then(() => 'timeout')
      ]);
      
      console.log(`Table creation result: ${result}`);
      console.log('API calls made:', JSON.stringify(apiCalls, null, 2));
      
      await page.screenshot({ path: 'test-results/step7-after-create.png' });
      
      if (result === 'success') {
        console.log('Successfully navigated to game page!');
        console.log('Current URL:', page.url());
      } else if (result === 'error') {
        const errorText = await page.locator('text=/failed|error/i').first().textContent();
        console.log('Error message:', errorText);
      }
    } else {
      console.log('Create Table button not visible!');
    }
    
    // Final screenshot
    await page.screenshot({ path: 'test-results/final-state.png', fullPage: true });
  });
});