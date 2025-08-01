import { test, expect } from '@playwright/test';

test.describe('Detailed Game Page Analysis', () => {
  test('should analyze game page loading in detail', async ({ page }) => {
    console.log('=== DETAILED GAME PAGE ANALYSIS ===');
    
    // Navigate to game page
    await page.goto('/game/demo-table-1');
    console.log('Initial navigation completed');
    
    // Wait longer for React components to load
    await page.waitForTimeout(10000);
    console.log('Waited 10 seconds for loading');
    
    await page.screenshot({ path: 'game-page-detailed.png' });
    
    // Get comprehensive page info
    const pageInfo = await page.evaluate(() => {
      const body = document.body;
      const content = body.textContent || '';
      
      return {
        title: document.title,
        url: window.location.href,
        contentLength: content.length,
        contentPreview: content.substring(0, 1000),
        hasTable: content.includes('Table'),
        hasSeat: content.includes('Seat') || content.includes('seat'),
        hasJoinSeat: content.includes('Join') && content.includes('Seat'),
        hasBuyIn: content.includes('Buy-in') || content.includes('Buy in'),
        hasChips: content.includes('chips') || content.includes('Chips') || content.includes('$'),
        hasDemo: content.includes('Demo') || content.includes('demo'),
        hasConnected: content.includes('Connected'),
        hasError: content.includes('Error') || content.includes('error') || content.includes('404'),
        hasLoading: content.includes('Loading') || content.includes('loading'),
        hasPoker: content.includes('Poker') || content.includes('poker'),
        htmlLength: document.documentElement.outerHTML.length,
        bodyClasses: body.className,
        hasReactContent: content.includes('poker') || content.includes('Table') || content.length > 2000
      };
    });
    
    console.log('=== PAGE INFO ===');
    console.log(JSON.stringify(pageInfo, null, 2));
    
    // Check for specific UI elements
    const elements = await page.evaluate(() => {
      const results: any = {};
      
      // Count different types of elements
      results.buttons = document.querySelectorAll('button').length;
      results.inputs = document.querySelectorAll('input').length;
      results.divs = document.querySelectorAll('div').length;
      results.images = document.querySelectorAll('img').length;
      results.modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]').length;
      
      // Look for specific poker-related elements
      results.seatElements = document.querySelectorAll('[class*="seat"], [data-testid*="seat"]').length;
      results.tableElements = document.querySelectorAll('[class*="table"], [data-testid*="table"]').length;
      results.chipElements = document.querySelectorAll('[class*="chip"], [data-testid*="chip"]').length;
      
      // Get all button texts
      const buttons = Array.from(document.querySelectorAll('button'));
      results.buttonTexts = buttons.map(btn => btn.textContent?.trim()).filter(Boolean);
      
      return results;
    });
    
    console.log('=== UI ELEMENTS ===');
    console.log(JSON.stringify(elements, null, 2));
    
    // Check console logs for errors
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });
    
    // Wait a bit more and reload to capture console logs
    await page.reload();
    await page.waitForTimeout(5000);
    
    console.log('=== CONSOLE LOGS ===');
    logs.forEach(log => console.log(log));
    
    // Final analysis after reload
    const finalContent = await page.textContent('body');
    const finalUrl = page.url();
    
    console.log('=== FINAL STATE ===');
    console.log('URL:', finalUrl);
    console.log('Content length:', finalContent?.length);
    console.log('Has game content:', finalContent?.includes('Table') || finalContent?.includes('Seat'));
    
    if (finalContent && finalContent.length > 100 && finalContent.includes('Table')) {
      console.log('✅ Game page seems to be loading content');
    } else {
      console.log('❌ Game page not loading properly');
      console.log('Content sample:', finalContent?.substring(0, 200));
    }
  });
  
  test('should test seat selection modal specifically', async ({ page }) => {
    console.log('=== TESTING SEAT SELECTION MODAL ===');
    
    await page.goto('/game/demo-table-1');
    await page.waitForTimeout(8000);
    
    // Look for seat selection modal
    const modalExists = await page.evaluate(() => {
      const modalSelectors = [
        '[role="dialog"]',
        '.modal',
        '[class*="modal"]',
        '*:has-text("Select Your Seat")',
        '*:has-text("Join Table - Select")',
        '*:has-text("Buy-in")'
      ];
      
      const results: any = {};
      
      modalSelectors.forEach((selector, index) => {
        try {
          const elements = document.querySelectorAll(selector);
          results[`selector_${index}`] = {
            selector,
            count: elements.length,
            visible: elements.length > 0 ? Array.from(elements).some(el => 
              (el as HTMLElement).offsetParent !== null
            ) : false
          };
        } catch (error) {
          results[`selector_${index}`] = { selector, error: error.message };
        }
      });
      
      return results;
    });
    
    console.log('Modal search results:', JSON.stringify(modalExists, null, 2));
    
    // Try to find any interactive elements
    const interactiveElements = await page.$$('button, input, [role="button"], [onclick]');
    console.log('Interactive elements found:', interactiveElements.length);
    
    if (interactiveElements.length > 0) {
      console.log('✅ Found interactive elements - page is functional');
    } else {
      console.log('❌ No interactive elements found');
    }
  });
});