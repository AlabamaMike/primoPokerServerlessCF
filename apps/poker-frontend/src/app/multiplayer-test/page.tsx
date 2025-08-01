'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { WebSocketClient } from '@/lib/websocket-client'

interface PlayerState {
  id: string
  username: string
  chips: number
  position: number
  status: string
}

interface GameTableState {
  tableId: string
  players: PlayerState[]
  phase: string
  pot: number
  currentBet: number
  isActive: boolean
}

export default function MultiplayerTest() {
  const { user, token, isAuthenticated } = useAuthStore()
  const [connectionStatus, setConnectionStatus] = useState('Not connected')
  const [tableState, setTableState] = useState<GameTableState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null)
  const [testTableId, setTestTableId] = useState('test-table-1')

  const addLog = (message: string) => {
    setLogs(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const connectToTable = async (tableId: string) => {
    if (!isAuthenticated || !token) {
      setError('Not authenticated')
      addLog('❌ User not authenticated')
      return
    }

    try {
      setConnectionStatus('Connecting...')
      addLog(`🔌 Connecting to GameTable: ${tableId}`)
      
      const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 'ws://localhost:8787'
      addLog(`WebSocket URL: ${wsUrl}`)
      
      const client = new WebSocketClient(wsUrl)
      client.setToken(token)
      client.setTableId(tableId)
      
      // Set up message handlers for GameTable events
      client.on('table_state', (message) => {
        addLog(`📨 Received table_state: ${JSON.stringify(message.payload)}`)
        setTableState(message.payload)
        addLog(`🎮 Table state updated: ${message.payload.players?.length || 0} players`)
      })
      
      client.on('player_joined', (message) => {
        addLog(`👤 Player joined: ${message.payload.username}`)
      })
      
      client.on('player_left', (message) => {
        addLog(`👋 Player left: ${message.payload.username}`)
      })
      
      client.on('game_action', (message) => {
        addLog(`🎯 Game action: ${message.payload.action} by ${message.payload.playerId}`)
      })
      
      client.on('chat_message', (message) => {
        addLog(`💬 Chat: ${message.payload.username}: ${message.payload.message}`)
      })
      
      await client.connect()
      setWsClient(client)
      
      setConnectionStatus('Connected!')
      setError(null)
      addLog('✅ Connected to GameTable successfully!')
      
      // Send join table message
      client.send('join_table', {
        tableId: tableId,
        playerId: user?.id,
        username: user?.username
      })
      addLog(`🚀 Sent join_table request`)
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      addLog(`❌ Connection failed: ${errorMsg}`)
      setConnectionStatus('Connection failed')
    }
  }

  const sendGameAction = (action: string, amount?: number) => {
    if (!wsClient) {
      addLog('❌ No WebSocket connection')
      return
    }

    const actionPayload = {
      action: action,
      playerId: user?.id,
      amount: amount
    }

    wsClient.send('game_action', actionPayload)
    addLog(`🎯 Sent action: ${action}${amount ? ` (${amount})` : ''}`)
  }

  const sendChatMessage = (message: string) => {
    if (!wsClient) {
      addLog('❌ No WebSocket connection')
      return
    }

    wsClient.send('chat_message', {
      playerId: user?.id,
      username: user?.username,
      message: message
    })
    addLog(`💬 Sent chat: ${message}`)
  }

  const disconnect = () => {
    if (wsClient) {
      wsClient.disconnect()
      setWsClient(null)
      setConnectionStatus('Disconnected')
      setTableState(null)
      addLog('🔌 Disconnected from GameTable')
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Multiplayer GameTable Test</h1>
      
      {!isAuthenticated ? (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <p>Please <a href="/auth/login" className="underline">login</a> to test multiplayer features.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Connection Panel */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Connection Control</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Table ID:</label>
                <input
                  type="text"
                  value={testTableId}
                  onChange={(e) => setTestTableId(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder="test-table-1"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => connectToTable(testTableId)}
                  disabled={connectionStatus === 'Connected!'}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
                >
                  Connect to Table
                </button>
                <button
                  onClick={disconnect}
                  disabled={connectionStatus !== 'Connected!'}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:bg-gray-400"
                >
                  Disconnect
                </button>
              </div>
              
              <div className={`p-3 rounded ${
                connectionStatus === 'Connected!' ? 'bg-green-100 text-green-800' :
                connectionStatus === 'Connection failed' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                Status: {connectionStatus}
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  Error: {error}
                </div>
              )}
            </div>
          </div>

          {/* Game Actions Panel */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Game Actions</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => sendGameAction('fold')}
                  disabled={connectionStatus !== 'Connected!'}
                  className="bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600 disabled:bg-gray-400"
                >
                  Fold
                </button>
                <button
                  onClick={() => sendGameAction('check')}
                  disabled={connectionStatus !== 'Connected!'}
                  className="bg-yellow-500 text-white px-3 py-2 rounded hover:bg-yellow-600 disabled:bg-gray-400"
                >
                  Check
                </button>
                <button
                  onClick={() => sendGameAction('call')}
                  disabled={connectionStatus !== 'Connected!'}
                  className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
                >
                  Call
                </button>
                <button
                  onClick={() => sendGameAction('bet', 50)}
                  disabled={connectionStatus !== 'Connected!'}
                  className="bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 disabled:bg-gray-400"
                >
                  Bet 50
                </button>
              </div>
              
              <div>
                <input
                  type="text"
                  placeholder="Type chat message..."
                  className="w-full p-2 border rounded"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      sendChatMessage(e.currentTarget.value.trim())
                      e.currentTarget.value = ''
                    }
                  }}
                />
                <p className="text-sm text-gray-600 mt-1">Press Enter to send chat message</p>
              </div>
            </div>
          </div>

          {/* Table State Display */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Table State</h2>
            
            {tableState ? (
              <div className="space-y-3">
                <div><strong>Table ID:</strong> {tableState.tableId}</div>
                <div><strong>Phase:</strong> {tableState.phase}</div>
                <div><strong>Players:</strong> {tableState.players.length}</div>
                <div><strong>Pot:</strong> ${tableState.pot}</div>
                <div><strong>Current Bet:</strong> ${tableState.currentBet}</div>
                <div><strong>Active:</strong> {tableState.isActive ? 'Yes' : 'No'}</div>
                
                {tableState.players.length > 0 && (
                  <div>
                    <strong>Players:</strong>
                    <ul className="mt-2 space-y-1">
                      {tableState.players.map((player, index) => (
                        <li key={player.id} className="flex justify-between text-sm">
                          <span>{player.username} (Seat {player.position})</span>
                          <span>${player.chips} - {player.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600">No table state received yet. Connect to a table to see live data.</p>
            )}
          </div>

          {/* Connection Logs */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Connection Logs</h2>
            <div className="bg-gray-100 p-4 rounded h-64 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-gray-600">No logs yet...</p>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="text-sm font-mono mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
