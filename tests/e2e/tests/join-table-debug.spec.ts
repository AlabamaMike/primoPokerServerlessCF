import { test, expect } from '@playwright/test';

test.describe('Join Table Button Debug', () => {
  test('should debug join table button behavior in detail', async ({ page }) => {
    console.log('=== DEBUGGING JOIN TABLE BUTTON ===');
    
    // Monitor console logs
    const consoleLogs: any[] = [];
    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    });
    
    // Monitor navigation
    const navigationEvents: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        navigationEvents.push(`Navigation to: ${frame.url()}`);
      }
    });
    
    await page.goto('/lobby');
    await page.waitForTimeout(5000);
    
    console.log('Lobby loaded, looking for join buttons...');
    
    // Get all join buttons
    const joinButtons = await page.$$('button:has-text("Join Table")');
    console.log(`Found ${joinButtons.length} Join Table buttons`);
    
    if (joinButtons.length > 0) {
      // Click the first join button
      console.log('Clicking first Join Table button...');
      
      // Use page.click with explicit selector instead
      await page.click('button:has-text("Join Table")');
      
      // Wait for any navigation or state changes
      await page.waitForTimeout(5000);
      
      const finalUrl = page.url();
      console.log('URL after click:', finalUrl);
      
      // Check console logs for any relevant messages
      const relevantLogs = consoleLogs.filter(log => 
        log.text.includes('Joining') || 
        log.text.includes('demo') || 
        log.text.includes('table') ||
        log.text.includes('navigation') ||
        log.text.includes('error')
      );
      
      console.log('Relevant console logs:', relevantLogs);
      console.log('Navigation events:', navigationEvents);
      
      // Check if any new content appeared
      const currentContent = await page.textContent('body');
      const hasNewContent = currentContent?.includes('Select Your Seat') || 
                           currentContent?.includes('Table demo') ||
                           currentContent?.includes('Seat 1');
      
      console.log('Has new content after click:', hasNewContent);
      
      if (finalUrl !== 'http://localhost:3000/lobby/' && finalUrl.includes('/game/')) {
        console.log('✅ Navigation successful to game page');
        
        // Take screenshot of game page
        await page.screenshot({ path: 'successful-navigation.png' });
        
        // Check for seat selection modal
        const gameContent = await page.textContent('body'); 
        console.log('Game page content preview:', gameContent?.substring(0, 300));
        
      } else if (hasNewContent) {
        console.log('✅ Content changed but URL stayed the same - possible modal');
        await page.screenshot({ path: 'modal-appeared.png' });
        
      } else {
        console.log('❌ No navigation or content change detected');
        await page.screenshot({ path: 'no-change.png' });
      }
    } else {
      console.log('❌ No Join Table buttons found');
    }
    
    // Final diagnostic info
    console.log('=== FINAL DIAGNOSTIC INFO ===');
    console.log('Total console logs:', consoleLogs.length);
    console.log('Navigation events:', navigationEvents.length);
    console.log('Final URL:', page.url());
  });
  
  test('should test join table programmatically', async ({ page }) => {
    console.log('=== TESTING PROGRAMMATIC JOIN TABLE ===');
    
    await page.goto('/lobby');
    await page.waitForTimeout(3000);
    
    // Try to trigger the join handler directly
    const result = await page.evaluate(() => {
      // Look for any handleJoinTable function in window
      // @ts-ignore
      if (window.handleJoinTable) {
        // @ts-ignore
        window.handleJoinTable('demo-table-1');
        return { method: 'window.handleJoinTable', success: true };
      }
      
      // Try to find React component and trigger handler
      const joinButton = document.querySelector('button:has-text("Join Table")');
      if (joinButton) {
        // @ts-ignore
        if (joinButton.onclick) {
          // @ts-ignore
          joinButton.onclick();
          return { method: 'button.onclick', success: true };
        }
        
        // Try to click directly
        (joinButton as HTMLElement).click();
        return { method: 'element.click', success: true };
      }
      
      return { method: 'none', success: false };
    });
    
    console.log('Programmatic trigger result:', result);
    
    await page.waitForTimeout(3000);
    
    const finalUrl = page.url();
    console.log('URL after programmatic trigger:', finalUrl);
    
    if (finalUrl.includes('/game/')) {
      console.log('✅ Programmatic navigation successful');
    } else {
      console.log('❌ Programmatic navigation failed');
    }
  });
});