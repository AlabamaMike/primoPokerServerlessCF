/**
 * WebSocket integration hook for real-time poker game state
 * Phase 4: Real-time Multiplayer - Full Implementation
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { useBankrollStore } from '@/stores/bankroll-store'
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

    // Get token from auth store or localStorage
    let authToken = token
    const authUser = user
    
    if (!authToken) {
      // Try to get token from localStorage as fallback
      const storedToken = localStorage.getItem('auth_token')
      if (storedToken) {
        console.log('Using token from localStorage for WebSocket')
        authToken = storedToken
      }
    }
    
    if (!authToken || !authUser) {
      console.warn('No authentication found for WebSocket connection')
      // For now, we'll try to connect anyway and let the backend handle it
      // In production, you might want to redirect to login
      setError('Authentication required for multiplayer')
      return null
    }

    try {
      // Use the singleton gameWebSocket instance that the auth store already configured
      if (!gameWebSocket) {
        throw new Error('GameWebSocket singleton not available')
      }

      console.log('Using singleton gameWebSocket instance')
      
      // Ensure token and table ID are set
      gameWebSocket.setToken(authToken)
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
        console.log('Successfully joined table:', message.payload)
        if (message.payload) {
          const { chipCount } = message.payload
          // Remove chips from bankroll when joining
          const bankrollStore = useBankrollStore.getState()
          bankrollStore.removeChips(chipCount)
          console.log(`Removed ${chipCount} chips from bankroll. New balance: ${bankrollStore.balance - chipCount}`)
        }
        // Player successfully joined - the table state will be updated via table_state message
      })

      client.on('spectator_joined', (message) => {
        console.log('Joined as spectator:', message.payload)
        if (message.payload?.tableState) {
          const state = message.payload.tableState
          gameStore.setGamePhase(state.gameState?.phase || 'waiting')
          gameStore.setPot(state.gameState?.pot || 0)
          gameStore.setCommunityCards(state.gameState?.communityCards || [])
          gameStore.setPlayers(state.players || [])
          gameStore.setActivePlayer(state.gameState?.currentPlayer)
        }
      })

      client.on('spectator_count_update', (message) => {
        console.log('Spectator count updated:', message.payload?.count)
        gameStore.setSpectatorCount(message.payload?.count || 0)
      })

      client.on('hand_started', (message) => {
        console.log('New hand started:', message.payload)
        if (message.payload) {
          const { handNumber, smallBlind, bigBlind, players } = message.payload
          gameStore.setGamePhase('pre-flop')
          gameStore.startNewHand(handNumber, smallBlind, bigBlind)
          if (players) {
            gameStore.setPlayers(players)
          }
        }
      })

      client.on('hand_winner', (message) => {
        console.log('Hand winner:', message.payload)
        if (message.payload) {
          const { winnerId, winnerName, winAmount, winType } = message.payload
          gameStore.announceWinner(winnerId, winnerName, winAmount, winType)
        }
      })

      client.on('table_state_update', (message) => {
        console.log('Table state update:', message.payload)
        if (message.payload) {
          const state = message.payload
          gameStore.setGamePhase(state.phase)
          gameStore.setPot(state.pot)
          gameStore.setCommunityCards(state.communityCards || [])
          gameStore.setPlayers(state.players || [])
          gameStore.setActivePlayer(state.currentPlayer)
        }
      })

      client.on('stand_up_success', (message) => {
        console.log('Stand up successful:', message.payload)
        if (message.payload) {
          const { chipCount } = message.payload
          // Update bankroll with returned chips
          const bankrollStore = useBankrollStore.getState()
          bankrollStore.addChips(chipCount)
          gameStore.setSpectatorMode(true)
          console.log(`Returned ${chipCount} chips to bankroll. New balance: ${bankrollStore.balance + chipCount}`)
        }
      })

      client.on('player_stood_up', (message) => {
        console.log('Player stood up:', message.payload)
        if (message.payload) {
          const { playerId, seatIndex } = message.payload
          // Table state will be updated via table_state_update
        }
      })

      client.on('error', (message) => {
        console.error('WebSocket error:', message.payload)
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

  const joinAsSpectator = useCallback(() => {
    if (webSocket.client && webSocket.isConnected) {
      const { user } = useAuthStore.getState()
      
      webSocket.client.send('spectate_table', {
        playerId: user?.id || `guest-${Date.now()}`,
        username: user?.username || 'Guest'
      })
    }
  }, [webSocket.client])

  const leaveSpectator = useCallback(() => {
    if (webSocket.client && webSocket.isConnected) {
      const { user } = useAuthStore.getState()
      
      webSocket.client.send('leave_spectator', {
        playerId: user?.id
      })
    }
  }, [webSocket.client])

  const standUp = useCallback(() => {
    if (webSocket.client && webSocket.isConnected) {
      const { user } = useAuthStore.getState()
      
      webSocket.client.send('stand_up', {
        playerId: user?.id
      })
    }
  }, [webSocket.client])

  return {
    isConnected: isConnected && webSocket.isConnected,
    error: webSocket.error,
    sendPlayerAction,
    sendChatMessage,
    joinTable,
    joinAsSpectator,
    leaveSpectator,
    standUp
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
