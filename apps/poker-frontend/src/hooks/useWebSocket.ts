/**
 * WebSocket integration hook for real-time poker game state
 * Phase 4: Real-time Multiplayer - Full Implementation
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'
import { WebSocketClient } from '@/lib/websocket-client'

// WebSocket connection hook
export function useWebSocketConnection() {
  const { user, token } = useAuthStore()
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<WebSocketClient | null>(null)

  const connect = useCallback(async (tableId: string) => {
    if (!token || !user || typeof window === 'undefined') {
      setError('Authentication required or not in browser')
      return null
    }

    try {
      const wsUrl = process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 'ws://localhost:8787'
      
      if (!clientRef.current) {
        clientRef.current = new WebSocketClient(wsUrl)
        clientRef.current.setToken(token)
        clientRef.current.setTableId(tableId)
      }

      await clientRef.current.connect()
      setIsConnected(true)
      setError(null)
      
      return clientRef.current
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setIsConnected(false)
      return null
    }
  }, [token, user])

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
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
    client: clientRef.current
  }
}

// Game-specific WebSocket hook
export function useGameWebSocket(tableId?: string) {
  const webSocket = useWebSocketConnection()
  const gameStore = useGameStore()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!tableId || !webSocket.connect) return

    const connectToTable = async () => {
      const client = await webSocket.connect(tableId)
      if (!client) return

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

      // Join the table
      client.send('join_table', { tableId })
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

  return {
    isConnected: isConnected && webSocket.isConnected,
    error: webSocket.error,
    sendPlayerAction,
    sendChatMessage
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
