/**
 * TypeScript Global Declarations for Phase 3B.2 Tests
 * 
 * Provides type definitions for global test utilities
 */

declare global {
  interface MockCard {
    suit: string
    rank: string
  }

  interface MockPlayer {
    id: string
    name: string
    status: string
    chipCount: number
    position: {
      seat: number
      isButton: boolean
      isSmallBlind: boolean
      isBigBlind: boolean
    }
    chips: number
    currentBet: number
    hasActed: boolean
    isFolded: boolean
    isAllIn: boolean
    holeCards: MockCard[]
  }

  interface MockGameState {
    tableId: string
    gameId: string
    phase: string
    pot: number
    sidePots: any[]
    communityCards: MockCard[]
    currentBet: number
    minRaise: number
    activePlayerId: string
    dealerId: string
    smallBlindId: string
    bigBlindId: string
    handNumber: number
    timestamp: Date
  }

  interface MockWebSocketClass {
    new (): {
      readyState: number
      messages: any[]
      listeners: Record<string, Function>
      send(data: any): void
      on(event: string, callback: Function): void
      emit(event: string, data: any): void
      close(): void
    }
  }

  interface MockDurableObjectStateClass {
    new (): {
      storage: Map<string, any>
      get(key: string): Promise<any>
      put(key: string, value: any): Promise<void>
      delete(key: string): Promise<boolean>
      list(options?: { prefix?: string }): Promise<Map<string, any>>
      transaction(callback: Function): Promise<any>
    }
  }

  interface PerformanceResult {
    totalTime: number
    averageTime: number
    iterations: number
  }

  interface BettingResult {
    isValid: boolean
    actionType: string
    effectiveAmount?: number
    error?: {
      type: string
      message: string
    }
  }

  interface TestConstants {
    DEFAULT_SMALL_BLIND: number
    DEFAULT_BIG_BLIND: number
    DEFAULT_STARTING_CHIPS: number
    MIN_PLAYERS: number
    MAX_PLAYERS: number
    CARDS_PER_PLAYER: number
    COMMUNITY_CARDS_FLOP: number
    COMMUNITY_CARDS_TURN: number
    COMMUNITY_CARDS_RIVER: number
    TOTAL_DECK_SIZE: number
  }

  // Global test utility functions
  var createMockPlayer: (overrides?: Partial<MockPlayer>) => MockPlayer
  var createMockCard: (suit?: string, rank?: string) => MockCard
  var createMockGameState: (overrides?: Partial<MockGameState>) => MockGameState
  var MockWebSocket: MockWebSocketClass
  var MockDurableObjectState: MockDurableObjectStateClass
  var TEST_CONSTANTS: TestConstants
  var generateTestPlayers: (count?: number) => MockPlayer[]
  var generateTestCards: (count?: number) => MockCard[]
  var expectValidBettingResult: (result: BettingResult) => void
  var expectValidCard: (card: MockCard) => void
  var expectValidGameState: (gameState: MockGameState) => void
  var measurePerformance: (fn: () => Promise<void> | void, iterations?: number) => Promise<PerformanceResult>
  var cleanupTest: () => void

  // Jest types
  namespace jest {
    interface Matchers<R> {
      toBeValidCard(): R
      toBeValidPlayer(): R
      toBeValidGameState(): R
      toHaveValidBettingAction(): R
    }
  }
}

export {}
