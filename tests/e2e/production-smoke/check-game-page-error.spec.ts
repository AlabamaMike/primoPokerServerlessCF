import { test, expect } from '@playwright/test';

test.describe('Check Game Page Error', () => {
  test('Check game page with dummy table ID', async ({ page }) => {
    // Use a dummy table ID
    const dummyTableId = 'test-table-123';
    
    // Try to load the game page directly
    console.log('Loading game page with dummy table ID:', dummyTableId);
    
    await page.goto(`/game/${dummyTableId}`, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Wait a bit for any errors
    await page.waitForTimeout(2000);
    
    // Take a screenshot
    await page.screenshot({ path: 'game-page-error.png', fullPage: true });
    
    // Get page content
    const pageContent = await page.textContent('body');
    console.log('Page content:', pageContent);
    
    // Check console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      console.log(`Browser console [${msg.type()}]:`, text);
    });
    
    // Check network errors
    const networkErrors: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400) {
        const error = `${response.status()} ${response.url()}`;
        networkErrors.push(error);
        console.log('Network error:', error);
      }
    });
    
    // Wait a bit more to catch any async errors
    await page.waitForTimeout(2000);
    
    console.log('\n=== SUMMARY ===');
    console.log('Console logs:', consoleLogs.length);
    console.log('Network errors:', networkErrors.length);
    
    // Check if it's showing the expected UI or an error
    const hasError = pageContent.includes('Internal Server Error') || 
                    pageContent.includes('Error') ||
                    pageContent.includes('Something went wrong');
    
    if (hasError) {
      console.log('❌ Page shows an error');
    } else {
      console.log('✅ Page loaded without visible error');
      
      // Check for expected elements
      const hasLoadingMessage = pageContent.includes('Loading table');
      const hasErrorMessage = pageContent.includes('Table not found');
      const hasPokerTable = await page.locator('[data-testid="poker-table"]').isVisible().catch(() => false);
      
      console.log('- Loading message:', hasLoadingMessage ? '✅' : '❌');
      console.log('- Error message:', hasErrorMessage ? '✅' : '❌');
      console.log('- Poker table visible:', hasPokerTable ? '✅' : '❌');
    }
  });
});