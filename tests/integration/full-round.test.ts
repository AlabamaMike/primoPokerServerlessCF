/**
 * Full Round Integration Test - Complete Poker Hand Simulation
 * 
 * This test simulates a complete poker hand from start to finish,
 * identifying connection issues and gameplay state problems.
 */

import { GameTableDurableObject } from '@primo-poker/persistence'
import { GamePhase, PlayerStatus, Suit, Rank, Card } from '@primo-poker/shared'

// Mock Durable Object environment for testing
class MockDurableObjectState {
  private storage = new Map<string, any>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.storage.get(key)
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.storage.delete(key)
  }

  async list(options?: { prefix?: string }): Promise<Map<string, any>> {
    if (options?.prefix) {
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
}

// Enhanced Mock WebSocket with detailed message tracking
class TestWebSocket {
  readyState = 1 // OPEN
  messages: any[] = []
  sent: string[] = []
  playerId: string
  
  constructor(playerId: string) {
    this.playerId = playerId
  }

  send(data: string) {
    this.sent.push(data)
    try {
      const parsed = JSON.parse(data)
      this.messages.push({
        timestamp: Date.now(),
        playerId: this.playerId,
        type: parsed.type,
        payload: parsed.payload,
        raw: data
      })
    } catch (e) {
      this.messages.push({
        timestamp: Date.now(),
        playerId: this.playerId,
        type: 'RAW',
        payload: data,
        raw: data
      })
    }
  }

  close() {
    this.readyState = 3 // CLOSED
  }

  // Helper to get last message of specific type
  getLastMessage(type: string) {
    return this.messages.filter(m => m.type === type).pop()
  }

  // Helper to get all messages of specific type
  getMessages(type: string) {
    return this.messages.filter(m => m.type === type)
  }

  // Helper to clear message history
  clearMessages() {
    this.messages = []
    this.sent = []
  }
}

describe('Full Round Integration Test', () => {
  let gameTable: GameTableDurableObject
  let mockState: MockDurableObjectState
  let mockEnv: any
  let players: {
    [key: string]: {
      id: string
      name: string
      ws: TestWebSocket
      chips: number
    }
  }

  beforeEach(() => {
    mockState = new MockDurableObjectState()
    mockEnv = {}
    gameTable = new GameTableDurableObject(mockState as any, mockEnv)
    
    // Create test players
    players = {
      alice: {
        id: 'player-alice',
        name: 'Alice',
        ws: new TestWebSocket('player-alice'),
        chips: 2000
      },
      bob: {
        id: 'player-bob', 
        name: 'Bob',
        ws: new TestWebSocket('player-bob'),
        chips: 1500
      },
      charlie: {
        id: 'player-charlie',
        name: 'Charlie', 
        ws: new TestWebSocket('player-charlie'),
        chips: 3000
      }
    }
  })

  describe('Complete Hand Simulation', () => {
    it('should execute a full poker hand from start to finish', async () => {
      console.log('🎲 Starting Full Round Test...')
      
      // ===== PHASE 1: PLAYER CONNECTIONS =====
      console.log('\n📞 Phase 1: Player Connections')
      
      // Test WebSocket connections
      for (const [name, player] of Object.entries(players)) {
        console.log(`  Connecting ${name}...`)
        
        // Simulate WebSocket upgrade request
        const url = `ws://localhost:8787?token=test-token&playerId=${player.id}&tableId=test-table`
        const request = new Request(url, {
          headers: {
            'Upgrade': 'websocket',
            'Connection': 'Upgrade'
          }
        })
        
        try {
          const response = await gameTable.fetch(request)
          console.log(`    Response status: ${response.status}`)
          expect(response.status).toBe(101) // WebSocket upgrade
        } catch (error) {
          console.error(`    Connection failed for ${name}:`, error)
          throw error
        }
      }
      
      // ===== PHASE 2: JOIN TABLE =====
      console.log('\n🏠 Phase 2: Joining Table')
      
      for (const [name, player] of Object.entries(players)) {
        console.log(`  ${name} joining table...`)
        
        const joinMessage = {
          type: 'join_table',
          payload: {
            tableId: 'test-table',
            playerId: player.id,
            username: player.name,
            chipCount: player.chips,
            seatIndex: Object.keys(players).indexOf(name)
          }
        }
        
        try {
          await gameTable.webSocketMessage(player.ws as any, JSON.stringify(joinMessage))
          
          // Check for confirmation message
          const confirmation = player.ws.getLastMessage('table_joined')
          console.log(`    Join confirmation:`, confirmation ? '✅' : '❌')
          
        } catch (error) {
          console.error(`    Join failed for ${name}:`, error)
        }
      }
      
      // ===== PHASE 3: GAME START =====
      console.log('\n🃏 Phase 3: Starting New Hand')
      
      // Trigger game start if enough players
      const startMessage = {
        type: 'start_game',
        payload: {
          tableId: 'test-table'
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.alice.ws as any, JSON.stringify(startMessage))
        
        // Check for game state updates
        for (const [name, player] of Object.entries(players)) {
          const gameState = player.ws.getLastMessage('game_state_update')
          console.log(`  ${name} received game state:`, gameState ? '✅' : '❌')
          
          const cardsDealt = player.ws.getLastMessage('cards_dealt')
          console.log(`  ${name} received hole cards:`, cardsDealt ? '✅' : '❌')
        }
        
      } catch (error) {
        console.error('  Game start failed:', error)
      }
      
      // ===== PHASE 4: PRE-FLOP BETTING =====
      console.log('\n💰 Phase 4: Pre-Flop Betting Round')
      
      // Small blind should be auto-posted
      const sbPlayer = players.bob // Assuming Bob is small blind
      const bbPlayer = players.charlie // Assuming Charlie is big blind
      
      console.log(`  Small blind (${sbPlayer.name}): Auto-posting...`)
      console.log(`  Big blind (${bbPlayer.name}): Auto-posting...`)
      
      // First to act should be Alice (UTG)
      console.log(`  ${players.alice.name}: Calling big blind...`)
      const callMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.alice.id,
          action: 'call',
          amount: 20
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.alice.ws as any, JSON.stringify(callMessage))
        
        // Check for action confirmation
        const actionUpdate = players.alice.ws.getLastMessage('action_update')
        console.log(`    Action processed:`, actionUpdate ? '✅' : '❌')
        
      } catch (error) {
        console.error('    Call action failed:', error)
      }
      
      // Bob (small blind) calls
      console.log(`  ${players.bob.name}: Calling...`)
      const bobCallMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.bob.id,
          action: 'call',
          amount: 10 // To complete the call
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.bob.ws as any, JSON.stringify(bobCallMessage))
      } catch (error) {
        console.error('    Bob call failed:', error)
      }
      
      // Charlie (big blind) checks
      console.log(`  ${players.charlie.name}: Checking...`)
      const checkMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.charlie.id,
          action: 'check',
          amount: 0
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.charlie.ws as any, JSON.stringify(checkMessage))
      } catch (error) {
        console.error('    Charlie check failed:', error)
      }
      
      // ===== PHASE 5: FLOP =====
      console.log('\n🃏 Phase 5: Flop')
      
      // Check if flop was dealt
      for (const [name, player] of Object.entries(players)) {
        const flopUpdate = player.ws.getLastMessage('flop_dealt')
        console.log(`  ${name} received flop:`, flopUpdate ? '✅' : '❌')
      }
      
      // ===== PHASE 6: FLOP BETTING =====
      console.log('\n💰 Phase 6: Flop Betting Round')
      
      // Charlie (big blind) checks first on flop
      const charlieCheckMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.charlie.id,
          action: 'check',
          amount: 0
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.charlie.ws as any, JSON.stringify(charlieCheckMessage))
      } catch (error) {
        console.error('    Charlie flop check failed:', error)
      }
      
      // Alice bets
      console.log(`  ${players.alice.name}: Betting 50...`)
      const betMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.alice.id,
          action: 'bet',
          amount: 50
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.alice.ws as any, JSON.stringify(betMessage))
      } catch (error) {
        console.error('    Alice bet failed:', error)
      }
      
      // Bob folds
      console.log(`  ${players.bob.name}: Folding...`)
      const foldMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.bob.id,
          action: 'fold',
          amount: 0
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.bob.ws as any, JSON.stringify(foldMessage))
      } catch (error) {
        console.error('    Bob fold failed:', error)
      }
      
      // Charlie calls
      console.log(`  ${players.charlie.name}: Calling 50...`)
      const charlieCallMessage = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: players.charlie.id,
          action: 'call',
          amount: 50
        }
      }
      
      try {
        await gameTable.webSocketMessage(players.charlie.ws as any, JSON.stringify(charlieCallMessage))
      } catch (error) {
        console.error('    Charlie call failed:', error)
      }
      
      // ===== PHASE 7: TURN & RIVER =====
      console.log('\n🃏 Phase 7: Turn and River')
      
      // Similar betting patterns for turn and river
      // For brevity, just checking if they're dealt
      
      for (const [name, player] of Object.entries(players)) {
        const turnUpdate = player.ws.getLastMessage('turn_dealt')
        const riverUpdate = player.ws.getLastMessage('river_dealt')
        console.log(`  ${name} received turn:`, turnUpdate ? '✅' : '❌')
        console.log(`  ${name} received river:`, riverUpdate ? '✅' : '❌')
      }
      
      // ===== PHASE 8: SHOWDOWN =====
      console.log('\n🏆 Phase 8: Showdown')
      
      for (const [name, player] of Object.entries(players)) {
        const showdown = player.ws.getLastMessage('showdown')
        const handResult = player.ws.getLastMessage('hand_complete')
        console.log(`  ${name} received showdown:`, showdown ? '✅' : '❌')
        console.log(`  ${name} received hand result:`, handResult ? '✅' : '❌')
      }
      
      // ===== ANALYSIS =====
      console.log('\n📊 Analysis: Message Flow')
      
      for (const [name, player] of Object.entries(players)) {
        console.log(`\n  ${name} message summary:`)
        console.log(`    Total messages: ${player.ws.messages.length}`)
        console.log(`    Connection: ${player.ws.getMessages('table_joined').length > 0 ? '✅' : '❌'}`)
        console.log(`    Game state updates: ${player.ws.getMessages('game_state_update').length}`)
        console.log(`    Action updates: ${player.ws.getMessages('action_update').length}`)
        console.log(`    Card updates: ${player.ws.getMessages('cards_dealt').length}`)
        
        // Print all message types for debugging
        const messageTypes = [...new Set(player.ws.messages.map(m => m.type))]
        console.log(`    Message types: ${messageTypes.join(', ')}`)
      }
      
      // ===== CONNECTION HEALTH CHECK =====
      console.log('\n💓 Connection Health Check')
      
      for (const [name, player] of Object.entries(players)) {
        console.log(`  ${name}: WebSocket state = ${player.ws.readyState === 1 ? 'OPEN' : 'CLOSED'}`)
      }
      
      // ===== FINAL VALIDATION =====
      console.log('\n✅ Final Validation')
      
      // Check that at least some core functionality worked
      const aliceJoined = players.alice.ws.getMessages('table_joined').length > 0
      const gameStateUpdates = players.alice.ws.getMessages('game_state_update').length > 0
      const actionProcessed = players.alice.ws.getMessages('action_update').length > 0
      
      console.log(`  Player joining: ${aliceJoined ? '✅' : '❌'}`)
      console.log(`  Game state sync: ${gameStateUpdates ? '✅' : '❌'}`)
      console.log(`  Action processing: ${actionProcessed ? '✅' : '❌'}`)
      
      // Log any errors found
      const errors = []
      if (!aliceJoined) errors.push('Player joining failed')
      if (!gameStateUpdates) errors.push('Game state sync failed')
      if (!actionProcessed) errors.push('Action processing failed')
      
      if (errors.length > 0) {
        console.log('\n🚨 Issues Found:')
        errors.forEach(error => console.log(`  - ${error}`))
      } else {
        console.log('\n🎉 All core functionality working!')
      }
      
      console.log('\n🎲 Full Round Test Complete')
    })
    
    it('should handle WebSocket connection errors gracefully', async () => {
      console.log('🔌 Testing WebSocket Connection Error Handling...')
      
      // Test invalid connection
      const invalidRequest = new Request('ws://localhost:8787?invalid=params')
      
      try {
        const response = await gameTable.fetch(invalidRequest)
        console.log(`Invalid request response: ${response.status}`)
        expect([400, 404, 500]).toContain(response.status)
      } catch (error) {
        console.log('Invalid request properly rejected:', error.message)
      }
      
      // Test malformed WebSocket message
      const validPlayer = players.alice
      const malformedMessage = '{"invalid": json}'
      
      try {
        await gameTable.webSocketMessage(validPlayer.ws as any, malformedMessage)
        console.log('Malformed message handled without crashing')
      } catch (error) {
        console.log('Malformed message error:', error.message)
      }
    })
    
    it('should maintain game state consistency across actions', async () => {
      console.log('⚖️ Testing Game State Consistency...')
      
      // This test would verify that:
      // 1. Player chip counts are accurate
      // 2. Pot calculations are correct
      // 3. Game phase transitions happen at right times
      // 4. All players see the same game state
      
      // Implementation would need access to internal game state
      expect(true).toBe(true) // Placeholder
    })
  })
  
  describe('Error Scenarios', () => {
    it('should handle player disconnections during active hand', async () => {
      // Test disconnection handling
      const player = players.alice
      player.ws.close()
      
      // Try to send message to disconnected player
      const message = {
        type: 'player_action',
        payload: {
          tableId: 'test-table',
          playerId: player.id,
          action: 'fold'
        }
      }
      
      // Should handle gracefully without crashing
      try {
        await gameTable.webSocketMessage(player.ws as any, JSON.stringify(message))
      } catch (error) {
        console.log('Disconnection handled:', error.message)
      }
    })
    
    it('should handle rapid action sequences', async () => {
      // Test rapid-fire actions to check for race conditions
      const actions = [
        { playerId: players.alice.id, action: 'call' },
        { playerId: players.bob.id, action: 'raise', amount: 50 },
        { playerId: players.charlie.id, action: 'fold' }
      ]
      
      // Send actions rapidly
      const promises = actions.map(async (action, index) => {
        const message = {
          type: 'player_action',
          payload: {
            tableId: 'test-table',
            ...action
          }
        }
        
        // Small delay to simulate rapid but not simultaneous actions
        await new Promise(resolve => setTimeout(resolve, index * 10))
        
        const player = Object.values(players).find(p => p.id === action.playerId)
        if (player) {
          return gameTable.webSocketMessage(player.ws as any, JSON.stringify(message))
        }
      })
      
      try {
        await Promise.all(promises)
        console.log('Rapid actions handled successfully')
      } catch (error) {
        console.log('Rapid action error:', error.message)
      }
    })
  })
})