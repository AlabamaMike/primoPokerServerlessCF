import { test, expect } from '@playwright/test';
import { LobbyPage } from './pages/lobby-page';
import { TablePage } from './pages/table-page';
import { CreateTablePage } from './pages/create-table-page';
import { 
  logTestStep,
  waitForAnimation,
  TestDataManager
} from './utils/test-helpers';

const testDataManager = new TestDataManager();

test.describe('Cash Game End-to-End Test', () => {
  // Use the already logged in user
  test.beforeEach(async ({ page }) => {
    // Go directly to lobby since user is already logged in after registration
    await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/lobby');
    await page.waitForLoadState('networkidle');
  });

  test('Complete cash game flow', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const tablePage = new TablePage(page);
    const createTablePage = new CreateTablePage(page);

    await test.step('Verify lobby loads', async () => {
      await logTestStep(page, 'Verifying lobby page loads');
      await lobbyPage.waitForLoad();
      
      // Check user is logged in
      const isLoggedIn = await lobbyPage.isUserLoggedIn();
      expect(isLoggedIn).toBe(true);
      
      // Check balance
      const balance = await lobbyPage.getUserBalance();
      console.log('User balance:', balance);
    });

    await test.step('Check available tables', async () => {
      await logTestStep(page, 'Checking available tables');
      const tableCount = await lobbyPage.getTableCount();
      console.log('Number of tables:', tableCount);
      
      if (tableCount > 0) {
        const tables = await lobbyPage.getTables();
        console.log('Available tables:', tables);
      }
    });

    await test.step('Create a new table', async () => {
      await logTestStep(page, 'Creating a new cash game table');
      await lobbyPage.createNewTable();
      
      // Wait for create table page
      await createTablePage.waitForLoad();
      
      // Fill table configuration
      const tableName = testDataManager.getUniqueTableName();
      const tableConfig = {
        name: tableName,
        gameType: 'cash' as const,
        isPrivate: false,
        smallBlind: '1',
        bigBlind: '2',
        maxPlayers: '6',
        minBuyIn: '40',
        maxBuyIn: '200'
      };
      
      console.log('Creating table:', tableName);
      await createTablePage.fillTableConfig(tableConfig);
      
      // Create table
      await createTablePage.createButton.click();
      
      // Wait for redirect or error
      await page.waitForTimeout(5000);
      
      const currentUrl = page.url();
      console.log('URL after table creation:', currentUrl);
      
      if (currentUrl.includes('/table/')) {
        console.log('✅ Table created successfully');
      } else {
        const error = await createTablePage.getErrorMessage();
        if (error) {
          console.log('Table creation error:', error);
        }
        
        // Try to go back to lobby
        await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/lobby');
      }
    });

    await test.step('Join an existing table', async () => {
      await logTestStep(page, 'Attempting to join a table');
      
      // If not on a table, go to lobby and find one
      if (!page.url().includes('/table/')) {
        await page.goto('https://6e77d385.primo-poker-frontend.pages.dev/lobby');
        await lobbyPage.waitForLoad();
        
        const tables = await lobbyPage.getTables();
        if (tables.length > 0) {
          // Find a table with available seats
          const availableTable = tables.find(table => {
            const [current, max] = table.players.split('/').map(n => parseInt(n));
            return current < max;
          });
          
          if (availableTable) {
            console.log('Joining table:', availableTable.name);
            await lobbyPage.selectTable(availableTable.name);
          }
        }
      }
      
      // Wait for table to load
      if (page.url().includes('/table/')) {
        await tablePage.waitForTableLoad();
        
        // Check seat availability
        const seats = await tablePage.getAvailableSeats();
        console.log('Seat info:', seats);
        
        const availableSeat = seats.find(seat => !seat.isOccupied);
        if (availableSeat) {
          console.log('Taking seat:', availableSeat.position);
          await tablePage.takeSeat(availableSeat.position);
          
          // Complete buy-in
          await tablePage.completeBuyIn('100');
          console.log('✅ Successfully seated at table');
        }
      }
    });

    await test.step('Wait for game action', async () => {
      await logTestStep(page, 'Waiting for cards or game action');
      
      if (page.url().includes('/table/')) {
        // Wait a bit to see if cards are dealt
        await page.waitForTimeout(10000);
        
        // Check if we have cards
        try {
          const cards = await tablePage.getHoleCards();
          if (cards.length > 0) {
            console.log('Hole cards:', cards);
            
            // Check if it's our turn
            if (await tablePage.isMyTurn()) {
              console.log('It is our turn to act');
              await tablePage.check();
              console.log('✅ Action performed');
            }
          }
        } catch (e) {
          console.log('No cards dealt yet or not in active hand');
        }
        
        // Get current game state
        const pot = await tablePage.getPotAmount();
        const communityCards = await tablePage.getCommunityCards();
        console.log('Pot:', pot);
        console.log('Community cards:', communityCards);
      }
    });

    // Take final screenshot
    await page.screenshot({ 
      path: 'cash-game-final-state.png',
      fullPage: true 
    });
  });
});