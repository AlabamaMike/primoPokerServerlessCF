/**
 * Test Setup for Phase 3B.2 - Enhanced Poker Game Mechanics
 * 
 * Global test configuration and utilities
 */

// Mock console methods for cleaner test output
global.console = {
  ...console,
  // Uncomment to suppress console output during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn()
}

// Global test utilities
global.createMockPlayer = (overrides = {}) => ({
  id: 'test-player-1',
  name: 'Test Player',
  status: 'playing',
  chipCount: 1000,
  position: { seat: 0, isButton: false, isSmallBlind: false, isBigBlind: false },
  chips: 1000,
  currentBet: 0,
  hasActed: false,
  isFolded: false,
  isAllIn: false,
  holeCards: [],
  ...overrides
})

global.createMockCard = (suit = 'hearts', rank = 'ace') => ({
  suit,
  rank
})

global.createMockGameState = (overrides = {}) => ({
  tableId: 'test-table',
  gameId: 'test-game',
  phase: 'pre_flop',
  pot: 0,
  sidePots: [],
  communityCards: [],
  currentBet: 0,
  minRaise: 20,
  activePlayerId: 'test-player-1',
  dealerId: 'test-player-1',
  smallBlindId: 'test-player-1',
  bigBlindId: 'test-player-2',
  handNumber: 1,
  timestamp: new Date(),
  ...overrides
})

// Test timeouts
jest.setTimeout(30000)

// Mock WebSocket for testing
global.MockWebSocket = class MockWebSocket {
  constructor() {
    this.readyState = 1 // OPEN
    this.messages = []
    this.listeners = {}
  }

  send(data) {
    this.messages.push(data)
    // Simulate message processing delay
    setTimeout(() => {
      if (this.listeners.message) {
        this.listeners.message({ data })
      }
    }, 10)
  }

  on(event, callback) {
    this.listeners[event] = callback
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event](data)
    }
  }

  close() {
    this.readyState = 3 // CLOSED
    if (this.listeners.close) {
      this.listeners.close()
    }
  }
}

// Mock Durable Object State for testing
global.MockDurableObjectState = class MockDurableObjectState {
  constructor() {
    this.storage = new Map()
  }

  async get(key) {
    return this.storage.get(key)
  }

  async put(key, value) {
    this.storage.set(key, value)
  }

  async delete(key) {
    return this.storage.delete(key)
  }

  async list(options = {}) {
    if (options.prefix) {
      const filtered = new Map()
      for (const [key, value] of this.storage) {
        if (key.startsWith(options.prefix)) {
          filtered.set(key, value)
        }
      }
      return filtered
    }
    return new Map(this.storage)
  }

  transaction(callback) {
    return callback({
      get: this.get.bind(this),
      put: this.put.bind(this),
      delete: this.delete.bind(this),
      list: this.list.bind(this)
    })
  }
}

// Shared test constants
global.TEST_CONSTANTS = {
  DEFAULT_SMALL_BLIND: 10,
  DEFAULT_BIG_BLIND: 20,
  DEFAULT_STARTING_CHIPS: 1000,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 9,
  CARDS_PER_PLAYER: 2,
  COMMUNITY_CARDS_FLOP: 3,
  COMMUNITY_CARDS_TURN: 1,
  COMMUNITY_CARDS_RIVER: 1,
  TOTAL_DECK_SIZE: 52
}

// Test data generators
global.generateTestPlayers = (count = 3) => {
  return Array.from({ length: count }, (_, i) => 
    createMockPlayer({
      id: `player-${i + 1}`,
      name: `Player ${i + 1}`,
      position: { 
        seat: i, 
        isButton: i === 0,
        isSmallBlind: i === 1,
        isBigBlind: i === 2
      }
    })
  )
}

global.generateTestCards = (count = 5) => {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace']
  
  const cards = []
  for (let i = 0; i < count && i < 52; i++) {
    const suit = suits[Math.floor(i / 13)]
    const rank = ranks[i % 13]
    cards.push(createMockCard(suit, rank))
  }
  return cards
}

// Assertion helpers
global.expectValidBettingResult = (result) => {
  expect(result).toHaveProperty('isValid')
  expect(result).toHaveProperty('actionType')
  if (result.isValid) {
    expect(result).toHaveProperty('effectiveAmount')
    expect(typeof result.effectiveAmount).toBe('number')
    expect(result.effectiveAmount).toBeGreaterThanOrEqual(0)
  } else {
    expect(result).toHaveProperty('error')
    expect(result.error).toHaveProperty('type')
    expect(result.error).toHaveProperty('message')
  }
}

global.expectValidCard = (card) => {
  expect(card).toHaveProperty('suit')
  expect(card).toHaveProperty('rank')
  expect(typeof card.suit).toBe('string')
  expect(typeof card.rank).toBe('string')
}

global.expectValidGameState = (gameState) => {
  expect(gameState).toHaveProperty('tableId')
  expect(gameState).toHaveProperty('gameId')
  expect(gameState).toHaveProperty('phase')
  expect(gameState).toHaveProperty('pot')
  expect(gameState).toHaveProperty('currentBet')
  expect(gameState).toHaveProperty('activePlayerId')
  expect(gameState).toHaveProperty('dealerId')
  expect(gameState).toHaveProperty('handNumber')
  expect(Array.isArray(gameState.communityCards)).toBe(true)
  expect(Array.isArray(gameState.sidePots)).toBe(true)
}

// Performance testing utilities
global.measurePerformance = async (fn, iterations = 1000) => {
  const start = process.hrtime.bigint()
  
  for (let i = 0; i < iterations; i++) {
    await fn()
  }
  
  const end = process.hrtime.bigint()
  const totalTime = Number(end - start) / 1000000 // Convert to milliseconds
  const avgTime = totalTime / iterations
  
  return {
    totalTime,
    averageTime: avgTime,
    iterations
  }
}

// Cleanup function for tests
global.cleanupTest = () => {
  // Reset any global state if needed
  jest.clearAllMocks()
}

// Run cleanup after each test
afterEach(() => {
  cleanupTest()
})

console.log('🧪 Phase 3B.2 Test Environment Initialized')
