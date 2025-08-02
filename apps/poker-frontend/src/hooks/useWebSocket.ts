/**
 * WebSocket integration hook for real-time poker game state
 * Phase 4: Real-time Multiplayer - Full Implementation
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { WebSocketClient, gameWebSocket } from '@/lib/websocket-client'
import { getWebSocketUrl } from '@/lib/config'

// WebSocket connection hook
export function useWebSocketConnection() {
  const { user, token } = useAuthStore()
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async (tableId: string) => {
    console.log('WebSocket connect called with:', { tableId, hasToken: !!token, hasUser: !!user, inBrowser: typeof window !== 'undefined' })
    
    if (typeof window === 'undefined') {
      const errorMsg = 'Not in browser environment'
      console.error('WebSocket connection failed:', errorMsg)
      setError(errorMsg)
      return null
    }

    // For demo purposes, create a fallback user if not authenticated
    let demoToken = token
    let demoUser = user
    
    if (!token || !user) {
      console.log('No authentication found, creating demo user for WebSocket connection')
      demoToken = 'demo-token-' + Date.now()
      demoUser = {
        id: 'demo-user-' + Date.now(),
        username: 'Demo Player',
        email: 'demo@example.com',
        chipCount: 10000
      }
    }

    try {
      // Use the singleton gameWebSocket instance that the auth store already configured
      if (!gameWebSocket) {
        throw new Error('GameWebSocket singleton not available')
      }

      console.log('Using singleton gameWebSocket instance')
      
      // Ensure token and table ID are set (use demo token if needed)
      gameWebSocket.setToken(demoToken)
      gameWebSocket.setTableId(tableId)

      await gameWebSocket.connect()
      setIsConnected(true)
      setError(null)
      
      console.log('WebSocket connected successfully using singleton')
      return gameWebSocket
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed'
      console.error('WebSocket connection error:', errorMsg)
      setError(errorMsg)
      setIsConnected(false)
      return null
    }
  }, [token, user])  // We need to keep these dependencies to detect auth changes

  const disconnect = useCallback(() => {
    if (gameWebSocket) {
      gameWebSocket.disconnect()
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connect,
    disconnect,
    isConnected,
    error,
    client: gameWebSocket
  }
}

// Game-specific WebSocket hook
export function useGameWebSocket(tableId?: string) {
  const webSocket = useWebSocketConnection()
  const gameStore = useGameStore()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!tableId || !webSocket.connect) {
      console.log('WebSocket connect conditions not met:', { tableId, hasConnect: !!webSocket.connect })
      return
    }

    const connectToTable = async () => {
      console.log(`Attempting to connect WebSocket to table: ${tableId}`)
      const client = await webSocket.connect(tableId)
      if (!client) {
        console.error('Failed to establish WebSocket client connection')
        return
      }

      console.log('WebSocket client connected successfully')
      setIsConnected(true)

      // Set up message handlers
      client.on('game_update', (message) => {
        if (message.payload?.gameState) {
          // Update game state with received data
          const { gameState } = message.payload
          gameStore.setGamePhase(gameState.gamePhase)
          gameStore.setPot(gameState.pot)
          gameStore.setCommunityCards(gameState.communityCards || [])
          gameStore.setPlayers(gameState.players || [])
          gameStore.setActivePlayer(gameState.activePlayerId)
        }
      })

      client.on('player_action', (message) => {
        if (message.payload) {
          const { playerId, action, amount } = message.payload
          gameStore.playerAction(playerId, action, amount)
        }
      })

      client.on('pot_update', (message) => {
        if (message.payload?.pot !== undefined) {
          gameStore.setPot(message.payload.pot)
        }
      })

      client.on('connection_confirmed', (message) => {
        console.log('WebSocket connection confirmed:', message.payload)
      })

      client.on('table_state', (message) => {
        console.log('Table state received:', message.payload)
        if (message.payload) {
          // Update game store with complete table state
          const state = message.payload
          gameStore.setGamePhase(state.phase)
          gameStore.setPot(state.pot)
          gameStore.setCommunityCards(state.communityCards || [])
          gameStore.setPlayers(state.players || [])
          gameStore.setActivePlayer(state.currentPlayer)
        }
      })

      client.on('join_table_success', (message) => {
        console.log('Successfully joined table:', message.data)
        // Player successfully joined - the table state will be updated via table_state message
      })

      client.on('error', (message) => {
        console.error('WebSocket error:', message.payload || message.data)
      })

      // Don't auto-join the table here - let the UI control when to join
      // client.send('join_table', { tableId })
    }

    connectToTable()

    return () => {
      webSocket.disconnect()
      setIsConnected(false)
    }
  }, [tableId, webSocket, gameStore])

  const sendPlayerAction = useCallback((action: string, amount?: number) => {
    if (webSocket.client && tableId) {
      webSocket.client.send('player_action', {
        tableId,
        action,
        amount
      })
    }
  }, [webSocket.client, tableId])

  const sendChatMessage = useCallback((message: string) => {
    if (webSocket.client && tableId) {
      webSocket.client.send('chat', {
        tableId,
        message
      })
    }
  }, [webSocket.client, tableId])

  const joinTable = useCallback((seatNumber: number, buyInAmount: number) => {
    if (webSocket.client && webSocket.isConnected) {
      // Get player info from auth store
      const { user, token } = useAuthStore.getState()
      
      // Use authenticated user info or demo fallback
      const playerId = user?.id || 'demo-user-' + Date.now()
      const username = user?.username || 'Demo Player'
      
      webSocket.client.send('join_table', { 
        playerId,
        username,
        tableId,
        seatIndex: seatNumber,
        chipCount: buyInAmount,
        timestamp: Date.now()
      })
    }
  }, [webSocket.client, tableId])

  return {
    isConnected: isConnected && webSocket.isConnected,
    error: webSocket.error,
    sendPlayerAction,
    sendChatMessage,
    joinTable
  }
}

// Table lobby WebSocket hook
export function useTableWebSocket(tableId?: string) {
  const webSocket = useWebSocketConnection()
  const [tables, setTables] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])

  useEffect(() => {
    if (!webSocket.connect) return

    const connectToLobby = async () => {
      const client = await webSocket.connect('lobby')
      if (!client) return

      // Set up lobby message handlers
      client.on('tables_update', (message) => {
        if (message.payload?.tables) {
          setTables(message.payload.tables)
        }
      })

      client.on('players_update', (message) => {
        if (message.payload?.players) {
          setPlayers(message.payload.players)
        }
      })

      // Request initial data
      client.send('get_tables', {})
      client.send('get_players', {})
    }

    connectToLobby()

    return () => {
      webSocket.disconnect()
    }
  }, [webSocket])

  const createTable = useCallback((config: any) => {
    if (webSocket.client) {
      webSocket.client.send('create_table', { config })
    }
  }, [webSocket.client])

  const joinTable = useCallback((tableId: string) => {
    if (webSocket.client) {
      webSocket.client.send('join_table', { tableId })
    }
  }, [webSocket.client])

  return {
    isConnected: webSocket.isConnected,
    error: webSocket.error,
    tables,
    players,
    createTable,
    joinTable
  }
}
