#!/usr/bin/env node

/**
 * WebSocket Connection Debug Tool
 * Tests the complete WebSocket connection flow to identify issues
 */

import WebSocket from 'ws';

const BACKEND_URL = 'wss://primo-poker-server.alabamamike.workers.dev';
const DEMO_TOKEN = 'header.eyJzdWIiOiJkZW1vLXVzZXItdGVzdCIsInVzZXJuYW1lIjoiRGVtbyBUZXN0IFVzZXIiLCJleHAiOjE3NTQxMDAwMDJ9.signature';
const TABLE_ID = 'demo-table-1';

async function testWebSocketConnection() {
  console.log('🔍 Testing WebSocket Connection to Primo Poker Backend...\n');
  
  try {
    // Build WebSocket URL with authentication parameters
    const wsUrl = `${BACKEND_URL}?token=${DEMO_TOKEN}&tableId=${TABLE_ID}`;
    console.log(`📡 Connecting to: ${wsUrl}\n`);
    
    const ws = new WebSocket(wsUrl);
    
    // Connection handlers
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully!');
      console.log('📨 Sending connection_established message...');
      
      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection_established',
        payload: {
          playerId: 'demo-user-test',
          username: 'Demo Test User',
          tableId: TABLE_ID
        },
        timestamp: new Date().toISOString()
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📥 Received message:', JSON.stringify(message, null, 2));
        
        // If we get connection confirmed, try joining the table
        if (message.type === 'connection_confirmed') {
          console.log('🎯 Connection confirmed! Attempting to join table...');
          
          setTimeout(() => {
            console.log('📨 Sending join_table message...');
            ws.send(JSON.stringify({
              type: 'join_table',
              payload: {
                playerId: 'demo-user-test',
                username: 'Demo Test User',
                chipCount: 2000,
                seatIndex: 0
              },
              timestamp: new Date().toISOString()
            }));
          }, 1000);
        }
        
        // Check for join_table_success
        if (message.type === 'join_table_success') {
          console.log('🎉 Successfully joined table!');
        }
        
        // Check for error messages
        if (message.type === 'error') {
          console.error('❌ Server error:', message.data || message.payload);
        }
        
        // Test complete after table state received
        if (message.type === 'table_state' || message.type === 'join_table_success') {
          console.log('🎉 WebSocket flow test SUCCESSFUL!');
          ws.close();
        }
        
      } catch (error) {
        console.error('❌ Failed to parse message:', error);
        console.log('Raw message:', data.toString());
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed - Code: ${code}, Reason: ${reason || 'No reason'}`);
      process.exit(0);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      console.error('Full error:', error);
      process.exit(1);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      console.error('⏰ WebSocket test timed out after 10 seconds');
      ws.close();
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ WebSocket test failed:', error);
    process.exit(1);
  }
}

testWebSocketConnection();