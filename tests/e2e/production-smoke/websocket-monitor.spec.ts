import { test, expect } from '@playwright/test';

test.describe('WebSocket Connection Monitor', () => {
  const testEmail = 'e2e_test_1754187899779@example.com';
  const testPassword = 'TestPass123!_1754187899779';

  test('Monitor WebSocket connections in multiplayer', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WebSocket') || text.includes('socket') || text.includes('connection')) {
        console.log(`[Console ${msg.type()}] ${text}`);
      }
    });

    // Monitor network WebSocket connections
    page.on('websocket', ws => {
      console.log(`[WebSocket Created] ${ws.url()}`);
      
      ws.on('framereceived', event => {
        console.log(`[WS Received] ${event.payload}`);
      });
      
      ws.on('framesent', event => {
        console.log(`[WS Sent] ${event.payload}`);
      });
      
      ws.on('close', () => {
        console.log('[WebSocket Closed]');
      });
      
      ws.on('socketerror', error => {
        console.log(`[WebSocket Error] ${error}`);
      });
    });

    // Monitor failed requests
    page.on('requestfailed', request => {
      if (request.url().includes('ws://') || request.url().includes('wss://')) {
        console.log(`[WebSocket Request Failed] ${request.url()} - ${request.failure()?.errorText}`);
      }
    });

    // Step 1: Login
    console.log('\n=== Step 1: Login ===');
    await page.goto('/auth/login');
    await page.fill('input[placeholder="your@email.com"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/lobby/, { timeout: 10000 });
    console.log('✅ Logged in successfully');

    // Step 2: Navigate to multiplayer
    console.log('\n=== Step 2: Navigate to multiplayer ===');
    await page.click('button:has-text("Enter Multiplayer")');
    await page.waitForURL(/\/multiplayer/, { timeout: 10000 });
    console.log('✅ Reached multiplayer page');

    // Step 3: Inject WebSocket monitoring
    console.log('\n=== Step 3: Monitoring WebSocket activity ===');
    await page.evaluate(() => {
      // Override WebSocket constructor
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
          console.log(`[WS Constructor] Creating WebSocket to: ${args[0]}`);
          const ws = new target(...args);
          
          // Store reference for debugging
          (window as any)._activeWebSocket = ws;
          
          const originalSend = ws.send.bind(ws);
          ws.send = function(data: any) {
            console.log('[WS Send]', data);
            return originalSend(data);
          };
          
          ws.addEventListener('open', () => {
            console.log('[WS Open] Connection established');
            console.log('[WS State]', {
              url: ws.url,
              readyState: ws.readyState,
              protocol: ws.protocol,
              extensions: ws.extensions
            });
          });
          
          ws.addEventListener('message', (event) => {
            console.log('[WS Message]', event.data);
          });
          
          ws.addEventListener('error', (event) => {
            console.log('[WS Error]', event);
          });
          
          ws.addEventListener('close', (event) => {
            console.log('[WS Close]', {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean
            });
          });
          
          return ws;
        }
      });
      
      console.log('WebSocket monitoring injected');
    });

    // Wait for WebSocket activity
    await page.waitForTimeout(5000);

    // Step 4: Check WebSocket status
    console.log('\n=== Step 4: Check WebSocket status ===');
    const wsStatus = await page.evaluate(() => {
      const ws = (window as any)._activeWebSocket;
      if (ws) {
        return {
          exists: true,
          url: ws.url,
          readyState: ws.readyState,
          readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
          bufferedAmount: ws.bufferedAmount
        };
      }
      return { exists: false };
    });
    
    console.log('WebSocket status:', JSON.stringify(wsStatus, null, 2));

    // Step 5: Check for connection errors on page
    const pageContent = await page.textContent('body');
    const hasConnectionError = pageContent?.includes('Connection failed') || pageContent?.includes('Connection Error');
    console.log(`\nConnection error visible on page: ${hasConnectionError}`);

    // Step 6: Try to trigger WebSocket activity
    console.log('\n=== Step 6: Attempting to trigger WebSocket activity ===');
    const createButton = page.locator('button:has-text("Create Table")');
    if (await createButton.isVisible()) {
      console.log('Clicking Create Table button...');
      await createButton.click();
      await page.waitForTimeout(3000);
      
      // Check if we navigated or got an error
      const currentUrl = page.url();
      console.log('Current URL after create:', currentUrl);
      
      if (currentUrl.includes('/game/')) {
        console.log('✅ Successfully created table and navigated to game!');
      } else {
        const errorText = await page.locator('text=/error|failed/i').first().textContent().catch(() => null);
        if (errorText) {
          console.log('❌ Error:', errorText);
        }
      }
    }

    // Final screenshot
    await page.screenshot({ path: 'test-results/websocket-monitor-final.png', fullPage: true });
    
    // Step 7: Check network tab for WebSocket URLs
    console.log('\n=== Step 7: Checking for WebSocket endpoints ===');
    const wsEndpoints = await page.evaluate(() => {
      // Try to find WebSocket URLs in the environment or config
      const possibleEndpoints = [];
      
      // Check window object for config
      if ((window as any).ENV) {
        possibleEndpoints.push((window as any).ENV);
      }
      
      // Check for API URL configurations
      const scripts = Array.from(document.scripts);
      scripts.forEach(script => {
        const content = script.textContent || '';
        const wsMatches = content.match(/wss?:\/\/[^\s"']+/g);
        if (wsMatches) {
          possibleEndpoints.push(...wsMatches);
        }
      });
      
      return possibleEndpoints;
    });
    
    console.log('Possible WebSocket endpoints found:', wsEndpoints);
  });
});