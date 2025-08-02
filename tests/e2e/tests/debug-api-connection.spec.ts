import { test, expect } from '@playwright/test';

test.describe('Debug API Connection', () => {
  test('Check API connection and lobby loading', async ({ page }) => {
    console.log('🔧 Starting API connection debug test');
    
    // Monitor console messages
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const message = `${msg.type()}: ${msg.text()}`;
      consoleMessages.push(message);
      console.log(`📝 Console: ${message}`);
    });

    // Monitor network requests
    const networkRequests: { url: string, status?: number, error?: string }[] = [];
    page.on('request', request => {
      networkRequests.push({ url: request.url() });
      console.log(`📤 Request: ${request.method()} ${request.url()}`);
    });

    page.on('response', response => {
      const req = networkRequests.find(r => r.url === response.url());
      if (req) {
        req.status = response.status();
      }
      console.log(`📥 Response: ${response.status()} ${response.url()}`);
    });

    page.on('requestfailed', request => {
      const req = networkRequests.find(r => r.url === request.url());
      if (req) {
        req.error = request.failure()?.errorText || 'Unknown error';
      }
      console.log(`❌ Request failed: ${request.url()} - ${request.failure()?.errorText}`);
    });

    // Step 1: Navigate to lobby
    console.log('🏛️ Step 1: Navigating to lobby page');
    await page.goto('/lobby');
    
    // Wait for initial page load
    await page.waitForTimeout(5000);
    
    // Step 2: Check for API URL configuration
    console.log('🔧 Step 2: Checking API URL configuration');
    const apiUrlResolution = await page.evaluate(() => {
      return {
        envVar: (window as any).process?.env?.NEXT_PUBLIC_API_URL,
        actualApiUrl: typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_API_URL : undefined,
        windowLocation: window.location.href
      };
    });
    console.log('🌐 API URL Resolution:', apiUrlResolution);
    
    // Step 3: Check if page loaded successfully
    console.log('✅ Step 3: Checking page load status');
    const pageTitle = await page.title();
    const bodyText = await page.textContent('body');
    
    console.log(`📄 Page title: ${pageTitle}`);
    console.log(`📝 Body contains "Internal Server Error": ${bodyText?.includes('Internal Server Error')}`);
    console.log(`📝 Body contains "Poker Lobby": ${bodyText?.includes('Poker Lobby')}`);
    console.log(`📝 Body contains "Loading": ${bodyText?.includes('Loading')}`);
    
    // Step 4: Check for specific UI elements
    console.log('🎮 Step 4: Checking for lobby UI elements');
    const hasCreateButton = await page.isVisible('button:has-text("Create")');
    const hasJoinButton = await page.isVisible('button:has-text("Join")');
    const hasTableCards = await page.$$eval('.bg-white\\/10', elements => elements.length);
    const hasConnectionStatus = await page.isVisible('[class*="bg-green-400"], [class*="bg-yellow-400"], [class*="bg-red-400"]');
    
    console.log(`🔘 Has Create button: ${hasCreateButton}`);
    console.log(`🔘 Has Join button: ${hasJoinButton}`);
    console.log(`🃏 Number of table cards: ${hasTableCards}`);
    console.log(`🔌 Has connection status indicator: ${hasConnectionStatus}`);
    
    // Step 5: Check API requests made
    console.log('📡 Step 5: Analyzing API requests');
    const apiRequests = networkRequests.filter(req => 
      req.url.includes('/api/health') || req.url.includes('/api/tables')
    );
    
    console.log(`📊 Total API requests: ${apiRequests.length}`);
    apiRequests.forEach(req => {
      console.log(`  📋 ${req.url} - Status: ${req.status || 'pending'} - Error: ${req.error || 'none'}`);
    });
    
    // Step 6: Take screenshot for debugging
    await page.screenshot({ path: 'debug-api-connection.png', fullPage: true });
    console.log('📸 Screenshot saved as debug-api-connection.png');
    
    // Step 7: Wait a bit more and check again
    console.log('⏳ Step 7: Waiting additional 5 seconds for async operations');
    await page.waitForTimeout(5000);
    
    const finalConsoleMessages = consoleMessages.filter(msg => 
      msg.includes('API') || msg.includes('connection') || msg.includes('error')
    );
    
    console.log('📋 Final relevant console messages:');
    finalConsoleMessages.forEach(msg => console.log(`  ${msg}`));
    
    // Verify the page loaded (basic assertion)
    expect(page.url()).toContain('/lobby');
    console.log('✅ Test completed - page loaded to lobby');
  });
});