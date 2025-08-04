import { test, expect, Page } from '@playwright/test';

test.describe('Multiplayer Debug Feedback Loop', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';
  
  // Helper to capture detailed debug info
  async function captureDebugInfo(page: Page, step: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Capture screenshot
    await page.screenshot({ 
      path: `test-results/debug-${step}-${timestamp}.png`,
      fullPage: true 
    });
    
    // Capture console logs
    page.on('console', msg => {
      console.log(`[Browser Console - ${step}] ${msg.type()}: ${msg.text()}`);
    });
    
    // Capture network errors
    page.on('requestfailed', request => {
      console.log(`[Network Error - ${step}] ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    // Log current URL
    console.log(`[Current URL - ${step}] ${page.url()}`);
    
    // Try to capture any error messages on page
    const errorElements = await page.locator('text=/error|failed|disconnected/i').all();
    for (const element of errorElements) {
      const text = await element.textContent();
      console.log(`[Page Error - ${step}] ${text}`);
    }
  }
  
  // Helper to wait and check WebSocket connection
  async function checkWebSocketConnection(page: Page) {
    // Wait a bit for WebSocket to establish
    await page.waitForTimeout(2000);
    
    // Check for connection status indicators
    const wsConnected = await page.locator('text="WebSocket Connected"').count();
    const wsDisconnected = await page.locator('text=/websocket.*disconnected/i').count();
    const apiConnected = await page.locator('text="API Connected"').count();
    
    console.log(`WebSocket Status: Connected=${wsConnected > 0}, Disconnected=${wsDisconnected > 0}, API Connected=${apiConnected > 0}`);
    
    // Capture network tab info via CDP if available
    try {
      const client = await page.context().newCDPSession(page);
      await client.send('Network.enable');
      
      client.on('Network.webSocketFrameReceived', (params) => {
        console.log('[WebSocket Received]', params.response.payloadData);
      });
      
      client.on('Network.webSocketFrameSent', (params) => {
        console.log('[WebSocket Sent]', params.response.payloadData);
      });
      
      client.on('Network.webSocketFrameError', (params) => {
        console.log('[WebSocket Error]', params.errorMessage);
      });
    } catch (e) {
      console.log('CDP session not available for WebSocket debugging');
    }
  }
  
  test('Full multiplayer debug with feedback', async ({ page, context }) => {
    // Enable detailed tracing
    await context.tracing.start({ 
      screenshots: true, 
      snapshots: true,
      sources: true 
    });
    
    // Create test results directory
    await page.evaluate(() => {
      console.log('Starting multiplayer debug test...');
    });
    
    try {
      await test.step('1. Login and capture initial state', async () => {
        await page.goto('/auth/login');
        await captureDebugInfo(page, '1-login-page');
        
        await page.fill('input[placeholder*="email"]', testEmail);
        await page.fill('input[type="password"]', testPassword);
        await page.click('button:has-text("Sign In")');
        
        await page.waitForURL(/\/lobby/, { timeout: 10000 });
        await captureDebugInfo(page, '1-after-login');
        console.log('✅ Login successful');
      });

      await test.step('2. Navigate to multiplayer and check connections', async () => {
        const enterButton = page.locator('button:has-text("Enter Multiplayer")');
        await expect(enterButton).toBeVisible({ timeout: 10000 });
        
        await captureDebugInfo(page, '2-lobby-page');
        await enterButton.click();
        
        await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
        await captureDebugInfo(page, '2-multiplayer-page');
        
        // Check WebSocket connection
        await checkWebSocketConnection(page);
        console.log('✅ Navigated to multiplayer');
      });

      await test.step('3. Attempt table creation with detailed monitoring', async () => {
        // Wait for page to stabilize
        await page.waitForTimeout(3000);
        await captureDebugInfo(page, '3-before-create');
        
        // Monitor network requests during table creation
        const requestPromises: Promise<any>[] = [];
        
        page.on('request', request => {
          if (request.url().includes('/api/') || request.url().includes('ws://') || request.url().includes('wss://')) {
            console.log(`[Network Request] ${request.method()} ${request.url()}`);
            requestPromises.push(request.response().then(response => {
              if (response) {
                console.log(`[Network Response] ${response.status()} ${response.url()}`);
              }
            }).catch(() => {}));
          }
        });
        
        const createButton = page.locator('button:has-text("Create Table")');
        await expect(createButton).toBeVisible();
        
        console.log('Clicking Create Table button...');
        await createButton.click();
        
        // Wait for navigation or error
        const result = await Promise.race([
          page.waitForURL(/\/game\//, { timeout: 30000 }).then(() => 'navigated'),
          page.locator('text=/failed|error/i').waitFor({ timeout: 5000 }).then(() => 'error'),
          page.waitForTimeout(10000).then(() => 'timeout')
        ]);
        
        await captureDebugInfo(page, '3-after-create-attempt');
        
        if (result === 'navigated') {
          const url = page.url();
          const tableId = url.split('/game/')[1];
          console.log(`✅ Successfully navigated to game: ${url}`);
          console.log(`Table ID: ${tableId}`);
          
          // Check game page state
          await page.waitForTimeout(3000);
          await captureDebugInfo(page, '3-game-page-loaded');
          
          // Check for game elements
          const gameElements = {
            table: await page.locator('[data-testid="poker-table"], .poker-table, canvas').count(),
            players: await page.locator('[data-testid*="player"], .player-seat').count(),
            cards: await page.locator('[data-testid*="card"], .playing-card').count(),
            pot: await page.locator('[data-testid="pot"], .pot-amount').count(),
            actions: await page.locator('button:has-text("Fold"), button:has-text("Check"), button:has-text("Call"), button:has-text("Raise")').count()
          };
          
          console.log('Game elements found:', gameElements);
          
        } else if (result === 'error') {
          const errorText = await page.locator('text=/failed|error/i').first().textContent();
          console.log(`❌ Table creation failed with error: ${errorText}`);
          
          // Capture all text content for debugging
          const pageText = await page.textContent('body');
          console.log('Full page content:', pageText.substring(0, 500) + '...');
          
        } else {
          console.log('❌ Table creation timed out');
        }
        
        // Wait for all network requests to complete
        await Promise.all(requestPromises);
      });

      await test.step('4. Additional debugging - check localStorage and cookies', async () => {
        // Check localStorage
        const localStorage = await page.evaluate(() => {
          const items: Record<string, any> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              items[key] = window.localStorage.getItem(key);
            }
          }
          return items;
        });
        
        console.log('LocalStorage contents:', Object.keys(localStorage));
        
        // Check cookies
        const cookies = await context.cookies();
        console.log('Cookies:', cookies.map(c => ({ name: c.name, domain: c.domain, httpOnly: c.httpOnly })));
        
        // Final state capture
        await captureDebugInfo(page, '4-final-state');
      });
      
    } finally {
      // Save trace
      await context.tracing.stop({ path: 'test-results/trace-multiplayer-debug.zip' });
      console.log('\n📊 Debug artifacts saved to test-results/');
      console.log('- Screenshots: debug-*.png');
      console.log('- Trace: trace-multiplayer-debug.zip');
      console.log('\nTo view trace: npx playwright show-trace test-results/trace-multiplayer-debug.zip');
    }
  });
  
  test('Quick WebSocket connection test', async ({ page }) => {
    await test.step('Direct WebSocket test', async () => {
      // Navigate to multiplayer after login
      await page.goto('/auth/login');
      await page.fill('input[placeholder*="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.click('button:has-text("Sign In")');
      await page.waitForURL(/\/lobby/, { timeout: 10000 });
      
      // Go to multiplayer
      await page.goto('/multiplayer');
      
      // Inject WebSocket monitoring
      await page.evaluate(() => {
        const originalWebSocket = window.WebSocket;
        window.WebSocket = new Proxy(originalWebSocket, {
          construct(target, args) {
            console.log('[WebSocket] Creating connection to:', args[0]);
            const ws = new target(...args);
            
            ws.addEventListener('open', () => {
              console.log('[WebSocket] Connection opened');
            });
            
            ws.addEventListener('message', (event) => {
              console.log('[WebSocket] Message received:', event.data);
            });
            
            ws.addEventListener('error', (event) => {
              console.log('[WebSocket] Error:', event);
            });
            
            ws.addEventListener('close', (event) => {
              console.log('[WebSocket] Connection closed:', event.code, event.reason);
            });
            
            return ws;
          }
        });
      });
      
      // Wait and capture WebSocket activity
      await page.waitForTimeout(5000);
      
      // Try to trigger WebSocket activity
      const createButton = page.locator('button:has-text("Create Table")');
      if (await createButton.isVisible()) {
        await createButton.click();
        await page.waitForTimeout(5000);
      }
      
      await captureDebugInfo(page, 'websocket-test');
    });
  });
});