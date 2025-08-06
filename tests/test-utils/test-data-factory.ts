/**
 * Test data factory for creating reusable test objects
 * Used across unit, integration, and E2E tests
 */

import { Player, GamePhase, PlayerStatus } from '@primo-poker/shared';

/**
 * Creates an array of test players
 * @param count Number of players to create
 * @param startingChips Chips for each player (default: 1000)
 * @returns Array of Player objects
 */
export function createTestPlayers(count: number, startingChips: number = 1000): Player[] {
  const playerNames = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
  
  if (count > playerNames.length) {
    throw new Error(`Cannot create more than ${playerNames.length} players`);
  }

  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: playerNames[index],
    chips: startingChips,
    bet: 0,
    status: 'active' as PlayerStatus,
    position: index,
    cards: [],
    isDealer: index === 0,
    isBigBlind: false,
    isSmallBlind: false,
    isAllIn: false,
    hasActed: false,
    hasFolded: false,
    showCards: false,
    winAmount: 0,
    handDescription: '',
    connected: true,
    lastAction: null,
    timeBank: 30000,
    seatNumber: index
  }));
}

/**
 * Creates a test player with custom properties
 * @param overrides Partial player properties to override defaults
 * @returns Player object
 */
export function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'test-player-1',
    name: 'TestPlayer',
    chips: 1000,
    bet: 0,
    status: 'active' as PlayerStatus,
    position: 0,
    cards: [],
    isDealer: false,
    isBigBlind: false,
    isSmallBlind: false,
    isAllIn: false,
    hasActed: false,
    hasFolded: false,
    showCards: false,
    winAmount: 0,
    handDescription: '',
    connected: true,
    lastAction: null,
    timeBank: 30000,
    seatNumber: 0,
    ...overrides
  };
}

/**
 * Creates a basic game state for testing
 * @param phase Game phase
 * @param players Array of players (or count to auto-generate)
 * @returns Basic game state object
 */
export function createTestGameState(
  phase: GamePhase = GamePhase.WAITING,
  players: Player[] | number = 2
) {
  const playerArray = typeof players === 'number' ? createTestPlayers(players) : players;
  
  return {
    phase,
    players: playerArray,
    pot: 0,
    currentBet: 0,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    communityCards: [],
    deck: [],
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 100,
    maxBuyIn: 2000,
    handNumber: 1,
    roundBets: new Map(),
    lastAction: null,
    sidePots: [],
    isHeadsUp: playerArray.length === 2,
    buttonPosition: 0,
    actionCount: 0,
    bettingRound: 0
  };
}

/**
 * Creates test WebSocket message data
 * @param type Message type
 * @param payload Message payload
 * @returns WebSocket message object
 */
export function createTestWebSocketMessage(type: string, payload: any = {}) {
  return {
    type,
    payload,
    timestamp: Date.now(),
    messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
  };
}

/**
 * Creates test authentication data
 * @param userId Optional user ID
 * @returns Authentication test data
 */
export function createTestAuthData(userId: string = 'test-user-1') {
  return {
    userId,
    email: `${userId}@example.com`,
    password: 'TestPassword123!',
    token: `test-jwt-token-${userId}`,
    refreshToken: `test-refresh-token-${userId}`,
    expiresIn: 3600
  };
}

/**
 * Creates test table configuration
 * @param overrides Partial table config to override defaults
 * @returns Table configuration object
 */
export function createTestTableConfig(overrides: any = {}) {
  return {
    tableId: 'test-table-1',
    tableName: 'Test Table',
    maxPlayers: 6,
    smallBlind: 10,
    bigBlind: 20,
    minBuyIn: 100,
    maxBuyIn: 2000,
    gameType: 'cash',
    ...overrides
  };
}