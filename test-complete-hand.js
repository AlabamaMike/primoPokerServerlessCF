#!/usr/bin/env node

/**
 * Comprehensive Poker Hand Test
 * Tests complete poker round including joining, betting, and pot distribution
 */

import WebSocket from 'ws';

const BACKEND_URL = 'wss://primo-poker-server.alabamamike.workers.dev';
const TABLE_ID = 'demo-table-1';

// Create demo JWT tokens for multiple players
function createDemoToken(playerId, username) {
  const payload = JSON.stringify({
    sub: playerId,
    username: username,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const encodedPayload = Buffer.from(payload).toString('base64');
  return `header.${encodedPayload}.signature`;
}

class PokerPlayer {
  constructor(playerId, username) {
    this.playerId = playerId;
    this.username = username;
    this.token = createDemoToken(playerId, username);
    this.ws = null;
    this.connected = false;
    this.seated = false;
    this.chips = 2000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${BACKEND_URL}?token=${this.token}&tableId=${TABLE_ID}`;
      console.log(`🔗 ${this.username} connecting to table...`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log(`✅ ${this.username} connected successfully`);
        this.connected = true;
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
          
          if (message.type === 'connection_confirmed') {
            resolve();
          }
        } catch (error) {
          console.error(`❌ ${this.username} message parse error:`, error);
        }
      });
      
      this.ws.on('error', (error) => {
        console.error(`❌ ${this.username} WebSocket error:`, error);
        reject(error);
      });
    });
  }

  handleMessage(message) {
    console.log(`📥 ${this.username} received:`, message.type, message.data || message.payload || '');
    
    switch (message.type) {
      case 'join_table_success':
        this.seated = true;
        console.log(`🪑 ${this.username} successfully joined table at seat ${message.data?.seat}`);
        break;
        
      case 'hand_started':
        console.log(`🃏 ${this.username} sees new hand #${message.data?.handNumber} started`);
        break;
        
      case 'table_state_update':
        if (message.data) {
          console.log(`📊 ${this.username} sees table state - Phase: ${message.data.phase}, Pot: ${message.data.pot}`);
          if (message.data.currentPlayer === this.playerId) {
            console.log(`🎯 ${this.username} - IT'S YOUR TURN!`);
            this.makeAction();
          }
        }
        break;
        
      case 'hand_winner':
        console.log(`🏆 ${this.username} sees winner: ${message.data?.winnerName} wins ${message.data?.winAmount} chips!`);
        break;
        
      case 'error':
        console.error(`❌ ${this.username} received error:`, message.data?.error);
        break;
    }
  }

  joinTable() {
    if (this.ws && this.connected) {
      console.log(`🎮 ${this.username} attempting to join table...`);
      this.ws.send(JSON.stringify({
        type: 'join_table',
        payload: {
          playerId: this.playerId,
          username: this.username,
          tableId: TABLE_ID,
          seatIndex: Math.floor(Math.random() * 9),
          chipCount: this.chips
        },
        timestamp: new Date().toISOString()
      }));
    }
  }

  makeAction() {
    // Simple strategy: call/check if possible, otherwise fold
    setTimeout(() => {
      if (this.ws && this.connected) {
        const action = Math.random() > 0.3 ? 'call' : 'fold';
        console.log(`🎲 ${this.username} decides to ${action}`);
        
        this.ws.send(JSON.stringify({
          type: 'player_action',
          payload: {
            playerId: this.playerId,
            action: action,
            amount: action === 'call' ? 50 : 0 // Simple call amount
          },
          timestamp: new Date().toISOString()
        }));
      }
    }, 2000 + Math.random() * 3000); // Random delay 2-5 seconds
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

async function testCompletePokerHand() {
  console.log('🃏 Testing Complete Poker Hand Flow...\n');
  
  // Create multiple players
  const players = [
    new PokerPlayer('player-1', 'AlabamaMike'),
    new PokerPlayer('player-2', 'PokerPro'),
    new PokerPlayer('player-3', 'CardShark')
  ];
  
  try {
    // Connect all players
    console.log('📡 Connecting all players...');
    await Promise.all(players.map(player => player.connect()));
    
    // Wait a moment for connection stabilization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Players join the table
    console.log('\n🪑 Players joining table...');
    players.forEach(player => player.joinTable());
    
    // Wait for game to start and complete
    console.log('\n⏳ Waiting for poker hand to complete...');
    console.log('Players will automatically make actions when it\'s their turn...\n');
    
    // Let the game run for 60 seconds
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    console.log('\n🏁 Test completed! Check the logs above for the complete game flow.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    players.forEach(player => player.disconnect());
    process.exit(0);
  }
}

testCompletePokerHand();