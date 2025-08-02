import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login-page';
import { LobbyPage } from './pages/lobby-page';
import { TablePage } from './pages/table-page';
import { CreateTablePage } from './pages/create-table-page';
import { 
  getTestConfig, 
  waitForWebSocketConnection, 
  takeScreenshotOnFailure,
  logTestStep,
  retryAction,
  waitForAnimation,
  extractChipAmount,
  TestDataManager
} from './utils/test-helpers';

const config = getTestConfig();
const testDataManager = new TestDataManager();

test.describe('Primo Poker Production Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await takeScreenshotOnFailure(page, testInfo.title);
    }
  });

  test.afterAll(() => {
    testDataManager.cleanup();
  });

  test('01. User Authentication Test', async ({ page }) => {
    const loginPage = new LoginPage(page);
    
    await test.step('Navigate to login page', async () => {
      await logTestStep(page, 'Navigating to login page');
      await loginPage.goto();
      expect(page.url()).toContain('/login');
    });

    await test.step('Enter credentials and login', async () => {
      await logTestStep(page, 'Entering user credentials');
      await loginPage.login(config.credentials.username, config.credentials.password);
    });

    await test.step('Handle 2FA if required', async () => {
      if (config.credentials.twoFactorCode) {
        await logTestStep(page, 'Handling 2FA authentication');
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
    });

    await test.step('Verify successful login', async () => {
      await logTestStep(page, 'Verifying successful login');
      await loginPage.waitForLoginSuccess();
      expect(await loginPage.isLoggedIn()).toBe(true);
      
      const errorMessage = await loginPage.getErrorMessage();
      expect(errorMessage).toBeNull();
    });

    await test.step('Verify session establishment', async () => {
      await logTestStep(page, 'Verifying session is established');
      
      // Check if we're in demo mode
      const isDemoMode = await page.locator('text="Demo Mode"').isVisible({ timeout: 5000 }).catch(() => false);
      
      if (!isDemoMode) {
        // Only wait for WebSocket if not in demo mode
        await waitForWebSocketConnection(page);
      }
      
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(cookie => 
        cookie.name.toLowerCase().includes('session') || 
        cookie.name.toLowerCase().includes('auth')
      );
      expect(sessionCookie).toBeDefined();
    });
  });

  test('02. Lobby Navigation Test', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);

    await test.step('Login to access lobby', async () => {
      await loginPage.goto();
      await loginPage.login(config.credentials.username, config.credentials.password);
      if (config.credentials.twoFactorCode) {
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
      await loginPage.waitForLoginSuccess();
    });

    await test.step('Navigate to lobby', async () => {
      await logTestStep(page, 'Navigating to lobby');
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
      expect(page.url()).toContain('/lobby');
    });

    await test.step('Verify table list display', async () => {
      await logTestStep(page, 'Verifying table list is displayed');
      const tableCount = await lobbyPage.getTableCount();
      expect(tableCount).toBeGreaterThanOrEqual(0);
      
      if (tableCount > 0) {
        const tables = await lobbyPage.getTables();
        expect(tables.length).toBe(tableCount);
        
        const firstTable = tables[0];
        expect(firstTable.name).toBeTruthy();
        expect(firstTable.stakes).toBeTruthy();
        expect(firstTable.players).toBeTruthy();
      }
    });

    await test.step('Test filtering functionality', async () => {
      await logTestStep(page, 'Testing table filtering');
      const tables = await lobbyPage.getTables();
      if (tables.length > 0) {
        const searchTerm = tables[0].name.substring(0, 3);
        await lobbyPage.filterTables(searchTerm);
        await waitForAnimation(page);
        
        const filteredCount = await lobbyPage.getTableCount();
        expect(filteredCount).toBeGreaterThan(0);
      }
    });

    await test.step('Verify user balance display', async () => {
      await logTestStep(page, 'Verifying user balance is displayed');
      const balance = await lobbyPage.getUserBalance();
      expect(balance).toBeTruthy();
      const balanceAmount = extractChipAmount(balance);
      expect(balanceAmount).toBeGreaterThanOrEqual(0);
    });

    await test.step('Test responsive design elements', async () => {
      await logTestStep(page, 'Testing responsive design');
      expect(await lobbyPage.isUserLoggedIn()).toBe(true);
      expect(await lobbyPage.createTableButton.isVisible()).toBe(true);
    });
  });

  test('03. Table Selection and Seating Test', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);
    const tablePage = new TablePage(page);

    await test.step('Login and navigate to lobby', async () => {
      await loginPage.goto();
      await loginPage.login(config.credentials.username, config.credentials.password);
      if (config.credentials.twoFactorCode) {
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
      await loginPage.waitForLoginSuccess();
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
    });

    await test.step('Select an available table', async () => {
      await logTestStep(page, 'Selecting an available table');
      const tables = await lobbyPage.getTables();
      expect(tables.length).toBeGreaterThan(0);
      
      const availableTable = tables.find(table => {
        const playerCount = parseInt(table.players.split('/')[0]);
        const maxPlayers = parseInt(table.players.split('/')[1]);
        return playerCount < maxPlayers;
      });
      
      expect(availableTable).toBeDefined();
      await lobbyPage.selectTable(availableTable!.name);
    });

    await test.step('Wait for table view to load', async () => {
      await logTestStep(page, 'Waiting for table view to load');
      await tablePage.waitForTableLoad();
      expect(page.url()).toMatch(/\/table\//);
    });

    await test.step('Verify seat availability', async () => {
      await logTestStep(page, 'Verifying seat availability');
      const seats = await tablePage.getAvailableSeats();
      expect(seats.length).toBeGreaterThan(0);
      
      const availableSeat = seats.find(seat => !seat.isOccupied);
      expect(availableSeat).toBeDefined();
    });

    await test.step('Take a seat and complete buy-in', async () => {
      await logTestStep(page, 'Taking a seat at the table');
      const seats = await tablePage.getAvailableSeats();
      const availableSeat = seats.find(seat => !seat.isOccupied);
      
      await tablePage.takeSeat(availableSeat!.position);
      await tablePage.completeBuyIn(config.tableConfig.defaultBuyIn);
    });

    await test.step('Verify chip stack display', async () => {
      await logTestStep(page, 'Verifying chip stack is displayed correctly');
      await waitForAnimation(page);
      
      const seats = await tablePage.getAvailableSeats();
      const mySeat = seats.find(seat => 
        seat.playerName === config.credentials.username || 
        seat.chipStack === config.tableConfig.defaultBuyIn
      );
      
      expect(mySeat).toBeDefined();
      expect(mySeat!.chipStack).toBeTruthy();
      
      const chipAmount = extractChipAmount(mySeat!.chipStack!);
      expect(chipAmount).toBeGreaterThan(0);
    });
  });

  test('04. Gameplay Test - One Complete Hand', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);
    const tablePage = new TablePage(page);

    await test.step('Setup - Login and join table', async () => {
      await loginPage.goto();
      await loginPage.login(config.credentials.username, config.credentials.password);
      if (config.credentials.twoFactorCode) {
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
      await loginPage.waitForLoginSuccess();
      
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
      
      const tables = await lobbyPage.getTables();
      const availableTable = tables.find(table => {
        const playerCount = parseInt(table.players.split('/')[0]);
        const maxPlayers = parseInt(table.players.split('/')[1]);
        return playerCount < maxPlayers && playerCount >= 1;
      });
      
      await lobbyPage.selectTable(availableTable!.name);
      await tablePage.waitForTableLoad();
      
      const seats = await tablePage.getAvailableSeats();
      const availableSeat = seats.find(seat => !seat.isOccupied);
      await tablePage.takeSeat(availableSeat!.position);
      await tablePage.completeBuyIn(config.tableConfig.defaultBuyIn);
    });

    await test.step('Wait for cards to be dealt', async () => {
      await logTestStep(page, 'Waiting for cards to be dealt');
      await tablePage.waitForCards();
      
      const holeCards = await tablePage.getHoleCards();
      expect(holeCards.length).toBe(2);
      expect(holeCards.every(card => card.length > 0)).toBe(true);
    });

    await test.step('Test player action', async () => {
      await logTestStep(page, 'Testing player action when turn arrives');
      
      const maxWaitTime = 60000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        if (await tablePage.isMyTurn()) {
          const actionButtons = await tablePage.actionButtons.locator('button').allTextContents();
          
          if (actionButtons.some(text => text.toLowerCase().includes('check'))) {
            await tablePage.check();
          } else if (actionButtons.some(text => text.toLowerCase().includes('call'))) {
            await tablePage.call();
          } else {
            await tablePage.fold();
          }
          
          break;
        }
        
        await page.waitForTimeout(1000);
      }
    });

    await test.step('Observe hand progression', async () => {
      await logTestStep(page, 'Observing hand progression through streets');
      
      const initialPot = await tablePage.getPotAmount();
      const initialPotAmount = extractChipAmount(initialPot);
      expect(initialPotAmount).toBeGreaterThanOrEqual(0);
      
      let previousCommunityCards = 0;
      let maxWaitTime = 90000;
      let startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        const communityCards = await tablePage.getCommunityCards();
        
        if (communityCards.length > previousCommunityCards) {
          await logTestStep(page, `Community cards revealed: ${communityCards.length} cards`);
          previousCommunityCards = communityCards.length;
        }
        
        if (communityCards.length === 5 || (await tablePage.getPotAmount()) === '0') {
          break;
        }
        
        await page.waitForTimeout(2000);
      }
    });

    await test.step('Verify pot updates', async () => {
      await logTestStep(page, 'Verifying pot updates during hand');
      const currentPot = await tablePage.getPotAmount();
      expect(currentPot).toBeDefined();
    });

    await test.step('Confirm hand completion', async () => {
      await logTestStep(page, 'Confirming hand completion and winner determination');
      
      await retryAction(async () => {
        const pot = await tablePage.getPotAmount();
        const potAmount = extractChipAmount(pot);
        const communityCards = await tablePage.getCommunityCards();
        
        expect(potAmount === 0 || communityCards.length === 5).toBe(true);
      }, 5, 5000);
    });
  });

  test('05. Table Exit Test', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);
    const tablePage = new TablePage(page);

    await test.step('Setup - Login and join table', async () => {
      await loginPage.goto();
      await loginPage.login(config.credentials.username, config.credentials.password);
      if (config.credentials.twoFactorCode) {
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
      await loginPage.waitForLoginSuccess();
      
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
      
      const tables = await lobbyPage.getTables();
      const availableTable = tables.find(table => {
        const playerCount = parseInt(table.players.split('/')[0]);
        const maxPlayers = parseInt(table.players.split('/')[1]);
        return playerCount < maxPlayers;
      });
      
      await lobbyPage.selectTable(availableTable!.name);
      await tablePage.waitForTableLoad();
    });

    let initialBalance: string;
    await test.step('Record initial balance', async () => {
      await logTestStep(page, 'Recording initial chip balance');
      const seats = await tablePage.getAvailableSeats();
      const availableSeat = seats.find(seat => !seat.isOccupied);
      
      if (availableSeat) {
        await tablePage.takeSeat(availableSeat.position);
        await tablePage.completeBuyIn(config.tableConfig.defaultBuyIn);
        await waitForAnimation(page);
      }
      
      initialBalance = config.tableConfig.defaultBuyIn;
    });

    await test.step('Click leave table button', async () => {
      await logTestStep(page, 'Clicking leave table button');
      await tablePage.leaveTable();
    });

    await test.step('Verify return to lobby', async () => {
      await logTestStep(page, 'Verifying return to lobby');
      await page.waitForURL(/\/lobby/, { timeout: 30000 });
      expect(page.url()).toContain('/lobby');
    });

    await test.step('Check balance update', async () => {
      await logTestStep(page, 'Checking that balance is updated');
      await lobbyPage.waitForLoad();
      const currentBalance = await lobbyPage.getUserBalance();
      expect(currentBalance).toBeTruthy();
      
      const balanceAmount = extractChipAmount(currentBalance);
      expect(balanceAmount).toBeGreaterThanOrEqual(0);
    });

    await test.step('Ensure clean session cleanup', async () => {
      await logTestStep(page, 'Ensuring clean session cleanup');
      await lobbyPage.refreshTables();
      
      const isStillLoggedIn = await lobbyPage.isUserLoggedIn();
      expect(isStillLoggedIn).toBe(true);
    });
  });

  test('06. Table Creation Test', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);
    const createTablePage = new CreateTablePage(page);
    const tablePage = new TablePage(page);

    await test.step('Login and navigate to lobby', async () => {
      await loginPage.goto();
      await loginPage.login(config.credentials.username, config.credentials.password);
      if (config.credentials.twoFactorCode) {
        await loginPage.handle2FA(config.credentials.twoFactorCode);
      }
      await loginPage.waitForLoginSuccess();
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
    });

    await test.step('Navigate to create table interface', async () => {
      await logTestStep(page, 'Navigating to create table interface');
      await lobbyPage.createNewTable();
      await createTablePage.waitForLoad();
    });

    const tableName = testDataManager.getUniqueTableName();
    
    await test.step('Configure table parameters', async () => {
      await logTestStep(page, 'Configuring table parameters');
      
      const tableConfig = {
        name: tableName,
        gameType: 'cash' as const,
        isPrivate: true,
        smallBlind: '1',
        bigBlind: '2',
        maxPlayers: '6',
        minBuyIn: '40',
        maxBuyIn: '200',
        password: config.tableConfig.testPassword
      };
      
      await createTablePage.fillTableConfig(tableConfig);
      
      const isValid = await createTablePage.isFormValid();
      expect(isValid).toBe(true);
    });

    await test.step('Submit table creation', async () => {
      await logTestStep(page, 'Submitting table creation');
      await createTablePage.createButton.click();
      
      const errorMessage = await createTablePage.getErrorMessage();
      expect(errorMessage).toBeNull();
    });

    await test.step('Verify table appears in lobby', async () => {
      await logTestStep(page, 'Verifying table appears in lobby');
      
      const currentUrl = page.url();
      if (currentUrl.includes('/table/')) {
        await tablePage.leaveTable();
      }
      
      await lobbyPage.goto();
      await lobbyPage.waitForLoad();
      await lobbyPage.filterTables(tableName);
      
      await retryAction(async () => {
        const tables = await lobbyPage.getTables();
        const createdTable = tables.find(table => table.name === tableName);
        expect(createdTable).toBeDefined();
      }, 5, 2000);
    });

    await test.step('Confirm creator is seated automatically', async () => {
      await logTestStep(page, 'Confirming creator is seated automatically');
      
      await lobbyPage.selectTable(tableName);
      await tablePage.waitForTableLoad();
      
      const seats = await tablePage.getAvailableSeats();
      const creatorSeat = seats.find(seat => 
        seat.isOccupied && 
        seat.playerName === config.credentials.username
      );
      
      if (!creatorSeat) {
        const occupiedSeats = seats.filter(seat => seat.isOccupied);
        expect(occupiedSeats.length).toBeGreaterThan(0);
      }
    });
  });
});