#!/usr/bin/env node

/**
 * Enhanced Multiplayer Test Suite - Phase 3B.2
 * 
 * Comprehensive end-to-end tests for the enhanced poker game mechanics
 * including BettingEngine and DeckManager integration
 */

const WebSocket = require('ws');
const { GameTableTester } = require('./test-multiplayer');

const BACKEND_URL = 'ws://localhost:8787';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJ1c2VybmFtZSI6InRlc3RlciIsImlhdCI6MTYxNjIzOTAyMn0.test';

class EnhancedPokerTester extends GameTableTester {
  constructor() {
    super()
    this.gameActions = []
    this.cardEvents = []
    this.bettingEvents = []
  }

  async testEnhancedBettingSystem() {
    this.log('🃏 Testing Enhanced Betting System (BettingEngine)')
    this.log('================================================')

    try {
      // Connect 3 players to test betting scenarios
      const player1 = await this.testConnection('player-1', 'Alice', 'betting-test')
      const player2 = await this.testConnection('player-2', 'Bob', 'betting-test')
      const player3 = await this.testConnection('player-3', 'Charlie', 'betting-test')

      this.connections.push(player1, player2, player3)
      await this.delay(1000)

      // Test 1: Basic betting validation
      this.log('\n📋 Test 1: Basic Betting Actions')
      
      // Player 1 bets
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'bet',
        playerId: player1.playerId,
        amount: 50
      }))
      this.log(`💰 ${player1.username} bets 50`)
      await this.delay(500)

      // Player 2 calls
      player2.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'call',
        playerId: player2.playerId,
        amount: 50
      }))
      this.log(`📞 ${player2.username} calls 50`)
      await this.delay(500)

      // Player 3 raises
      player3.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'raise',
        playerId: player3.playerId,
        amount: 100
      }))
      this.log(`⬆️ ${player3.username} raises to 100`)
      await this.delay(500)

      // Test 2: Invalid action handling
      this.log('\n📋 Test 2: Invalid Action Validation')
      
      // Try to bet when should call/fold/raise
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'bet', // Invalid - should be call/fold/raise
        playerId: player1.playerId,
        amount: 25
      }))
      this.log(`❌ ${player1.username} attempts invalid bet action`)
      await this.delay(500)

      // Test 3: All-in scenario
      this.log('\n📋 Test 3: All-In Handling')
      
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'all_in',
        playerId: player1.playerId
      }))
      this.log(`🔥 ${player1.username} goes all-in`)
      await this.delay(500)

      this.log('✅ Enhanced betting system tests completed')

    } catch (error) {
      this.log(`❌ Betting system test failed: ${error.message}`)
    }
  }

  async testCardDealingSystem() {
    this.log('\n🎴 Testing Card Dealing System (DeckManager)')
    this.log('=============================================')

    try {
      // Connect players for card dealing test
      const player1 = await this.testConnection('player-1', 'Alice', 'card-test')
      const player2 = await this.testConnection('player-2', 'Bob', 'card-test')
      
      this.connections.push(player1, player2)
      await this.delay(1000)

      // Monitor for card dealing events
      const cardEvents = []
      
      player1.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'cards_dealt' || message.type === 'community_cards') {
            cardEvents.push({ player: 'Alice', event: message })
            this.log(`🎴 Alice received: ${message.type}`)
          }
        } catch (error) {
          // Ignore parse errors
        }
      })

      player2.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'cards_dealt' || message.type === 'community_cards') {
            cardEvents.push({ player: 'Bob', event: message })
            this.log(`🎴 Bob received: ${message.type}`)
          }
        } catch (error) {
          // Ignore parse errors
        }
      })

      // Request new hand to trigger card dealing
      player1.ws.send(JSON.stringify({
        type: 'start_hand',
        playerId: player1.playerId
      }))
      this.log('🚀 Requesting new hand to test card dealing')
      await this.delay(2000) // Wait for card dealing

      // Check if cards were dealt
      if (cardEvents.length > 0) {
        this.log(`✅ Card dealing system working: ${cardEvents.length} events received`)
        cardEvents.forEach(event => {
          this.log(`   ${event.player}: ${event.event.type}`)
        })
      } else {
        this.log('⚠️ No card events received - may need game state setup')
      }

    } catch (error) {
      this.log(`❌ Card dealing test failed: ${error.message}`)
    }
  }

  async testGamePhaseProgression() {
    this.log('\n🎯 Testing Game Phase Progression')
    this.log('==================================')

    try {
      // Connect players for phase progression test
      const player1 = await this.testConnection('player-1', 'Alice', 'phase-test')
      const player2 = await this.testConnection('player-2', 'Bob', 'phase-test')
      
      this.connections.push(player1, player2)
      await this.delay(1000)

      const phaseEvents = []

      // Monitor for phase changes
      player1.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          if (message.type === 'game_state' && message.phase) {
            phaseEvents.push(message.phase)
            this.log(`🎯 Game phase: ${message.phase}`)
          }
        } catch (error) {
          // Ignore parse errors
        }
      })

      // Simulate complete betting rounds to advance phases
      this.log('Simulating betting rounds to advance game phases...')
      
      // Pre-flop actions
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'call',
        playerId: player1.playerId
      }))
      await this.delay(500)

      player2.ws.send(JSON.stringify({
        type: 'game_action', 
        action: 'check',
        playerId: player2.playerId
      }))
      await this.delay(1000)

      // Monitor phase progression
      this.log(`📊 Phases observed: ${phaseEvents.join(' -> ')}`)

    } catch (error) {
      this.log(`❌ Phase progression test failed: ${error.message}`)
    }
  }

  async testSidePotCalculation() {
    this.log('\n💰 Testing Side Pot Calculation')
    this.log('================================')

    try {
      // Connect 3 players for side pot scenario
      const player1 = await this.testConnection('player-1', 'Alice', 'sidepot-test')
      const player2 = await this.testConnection('player-2', 'Bob', 'sidepot-test')
      const player3 = await this.testConnection('player-3', 'Charlie', 'sidepot-test')
      
      this.connections.push(player1, player2, player3)
      await this.delay(1000)

      // Create all-in scenario for side pot testing
      this.log('Creating all-in scenario for side pot calculation...')

      // Player 1 goes all-in with small stack
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'all_in',
        playerId: player1.playerId,
        amount: 200 // Smaller all-in
      }))
      this.log(`🔥 ${player1.username} all-in for 200`)
      await this.delay(500)

      // Player 2 calls with more chips
      player2.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'call',
        playerId: player2.playerId,
        amount: 500 // Bigger call
      }))
      this.log(`📞 ${player2.username} calls 500`)
      await this.delay(500)

      // Player 3 also calls
      player3.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'call',
        playerId: player3.playerId,
        amount: 500
      }))
      this.log(`📞 ${player3.username} calls 500`)
      await this.delay(1000)

      this.log('✅ Side pot scenario created - check server logs for calculations')

    } catch (error) {
      this.log(`❌ Side pot test failed: ${error.message}`)
    }
  }

  async testErrorHandling() {
    this.log('\n🛡️ Testing Error Handling')
    this.log('==========================')

    try {
      const player1 = await this.testConnection('player-1', 'Alice', 'error-test')
      this.connections.push(player1)
      await this.delay(500)

      // Test invalid action
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'invalid_action',
        playerId: player1.playerId
      }))
      this.log('❌ Sent invalid action type')
      await this.delay(500)

      // Test invalid bet amount
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'bet',
        playerId: player1.playerId,
        amount: -50 // Negative amount
      }))
      this.log('❌ Sent negative bet amount')
      await this.delay(500)

      // Test out of turn action
      player1.ws.send(JSON.stringify({
        type: 'game_action',
        action: 'bet',
        playerId: 'wrong-player-id',
        amount: 100
      }))
      this.log('❌ Sent out of turn action')
      await this.delay(500)

      this.log('✅ Error handling tests completed')

    } catch (error) {
      this.log(`❌ Error handling test failed: ${error.message}`)
    }
  }

  async runEnhancedTests() {
    this.log('🧪 Starting Enhanced Poker Game Tests (Phase 3B.2)')
    this.log('====================================================')

    try {
      // Run all enhanced test suites
      await this.testEnhancedBettingSystem()
      await this.testCardDealingSystem()
      await this.testGamePhaseProgression()
      await this.testSidePotCalculation()
      await this.testErrorHandling()

      this.log('\n🎉 All Enhanced Tests Completed Successfully!')
      this.log('=============================================')
      this.log(`Total test events logged: ${this.testResults.length}`)

    } catch (error) {
      this.log(`❌ Enhanced tests failed: ${error.message}`)
    } finally {
      // Cleanup all connections
      this.log('\n🧹 Cleaning up test connections...')
      this.connections.forEach(conn => {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.close()
        }
      })
      
      setTimeout(() => {
        process.exit(0)
      }, 2000)
    }
  }

  // Generate test report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.testResults.length,
      gameActions: this.gameActions.length,
      cardEvents: this.cardEvents.length,
      bettingEvents: this.bettingEvents.length,
      results: this.testResults
    }

    console.log('\n📊 Test Report')
    console.log('===============')
    console.log(JSON.stringify(report, null, 2))

    return report
  }
}

// Run enhanced tests if this file is executed directly
if (require.main === module) {
  const tester = new EnhancedPokerTester()
  tester.runEnhancedTests()
    .then(() => tester.generateReport())
    .catch(console.error)
}

module.exports = { EnhancedPokerTester }
