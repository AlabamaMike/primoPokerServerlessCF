import { test, expect } from '@playwright/test';

test.describe('Direct Game Page Navigation', () => {
  test('should navigate to game page directly', async ({ page }) => {
    console.log('=== TESTING DIRECT GAME NAVIGATION ===');
    
    // Navigate directly to a demo table
    await page.goto('/game/demo-table-1');
    await page.waitForTimeout(8000);
    
    await page.screenshot({ path: 'direct-game-nav.png' });
    
    const content = await page.textContent('body');
    const title = await page.title();
    const url = page.url();
    
    console.log('Final URL:', url);
    console.log('Page title:', title);
    console.log('Content preview:', content?.substring(0, 500));
    
    // Check if we're getting an error page
    const hasError = content?.includes('404') || content?.includes('Error') || content?.includes('missing param');
    const hasGameContent = content?.includes('Table') || content?.includes('Seat') || content?.includes('Chips');
    const hasSeatSelection = content?.includes('Select Your Seat') || content?.includes('Join Table - Select');
    
    console.log('Page analysis:', {
      hasError,
      hasGameContent,
      hasSeatSelection,
      urlChanged: url !== 'http://localhost:3000/game/demo-table-1'
    });
    
    if (hasError) {
      console.log('❌ Getting error page - likely static export routing issue');
    } else if (hasSeatSelection) {
      console.log('✅ Seat selection modal working');
    } else if (hasGameContent) {
      console.log('✅ Game page loading');
    } else {
      console.log('⚠️ Unknown page state');
    }
  });
  
  test('should test programmatic navigation via JavaScript', async ({ page }) => {
    console.log('=== TESTING PROGRAMMATIC NAVIGATION ===');
    
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    // Try to navigate programmatically
    const navigationResult = await page.evaluate(() => {
      // Test if router is available
      const hasRouter = typeof window !== 'undefined';
      
      // Try Next.js router navigation
      if (hasRouter) {
        try {
          // @ts-ignore
          if (window.next && window.next.router) {
            // @ts-ignore
            window.next.router.push('/game/demo-table-1');
            return { method: 'next-router', success: true };
          }
        } catch (error) {
          console.log('Next router failed:', error);
        }
        
        // Try regular navigation
        try {
          window.location.href = '/game/demo-table-1';
          return { method: 'location-href', success: true };
        } catch (error) {
          return { method: 'location-href', success: false, error: error.message };
        }
      }
      
      return { method: 'none', success: false };
    });
    
    console.log('Navigation attempt:', navigationResult);
    
    // Wait to see if navigation occurred
    await page.waitForTimeout(5000);
    
    const finalUrl = page.url();
    console.log('Final URL after programmatic navigation:', finalUrl);
    
    if (finalUrl.includes('/game/')) {
      console.log('✅ Programmatic navigation successful');
      
      await page.screenshot({ path: 'programmatic-nav-success.png' });
      
      const gameContent = await page.textContent('body');
      console.log('Game page content:', gameContent?.substring(0, 300));
    } else {
      console.log('❌ Programmatic navigation failed');
    }
  });
  
  test('should check Next.js static export configuration', async ({ page }) => {
    console.log('=== CHECKING STATIC EXPORT CONFIG ===');
    
    // Check if we can access the _next metadata
    await page.goto('/');
    
    const nextInfo = await page.evaluate(() => {
      const info: any = {};
      
      // Check for Next.js build info
      // @ts-ignore
      if (window.__NEXT_DATA__) {
        // @ts-ignore
        info.nextData = window.__NEXT_DATA__;
      }
      
      // Check for build ID
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const nextScripts = scripts.filter(script => 
        script.getAttribute('src')?.includes('_next')
      );
      
      info.nextScripts = nextScripts.length;
      info.staticExport = nextScripts.some(script => 
        script.getAttribute('src')?.includes('static')
      );
      
      return info;
    });
    
    console.log('Next.js info:', JSON.stringify(nextInfo, null, 2));
    
    // Test if dynamic routes are working by checking build output
    const staticPaths = await page.evaluate(() => {
      // Try to access route info
      // @ts-ignore
      const nextData = window.__NEXT_DATA__;
      if (nextData) {
        return {
          buildId: nextData.buildId,
          page: nextData.page,
          query: nextData.query,
          runtimeConfig: nextData.runtimeConfig
        };
      }
      return null;
    });
    
    console.log('Static paths info:', staticPaths);
  });
});