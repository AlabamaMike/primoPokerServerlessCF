/**
 * WebSocket integration hook for real-time poker game state
 * Phase 3: Backend Integration
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/game-store'
import { useAuthStore } from '@/stores/auth-store'
import { gameWebSocket, tableWebSocket } from '@/lib/websocket-client'

interface WebSocketMessage {
  type: string
  payload: any
  timestamp?: string
}

interface GameMessage extends WebSocketMessage {
  type: 'player_joined' | 'player_left' | 'game_started' | 'hand_dealt' | 
        'player_action' | 'community_cards' | 'hand_complete' | 'game_ended'
}

interface TableMessage extends WebSocketMessage {
  type: 'table_update' | 'player_update' | 'bet_update' | 'pot_update' | 
        'phase_change' | 'timer_update' | 'showdown' | 'winner_declared'
}

export function useWebSocketConnection() {
  const { isAuthenticated, token } = useAuthStore()
  const gameStore = useGameStore()
  const connectionAttempted = useRef(false)
  const gameHandlersSet = useRef(false)
  const tableHandlersSet = useRef(false)

  // Set up game WebSocket handlers
  useEffect(() => {
    if (!gameHandlersSet.current) {
      // Player management
      gameWebSocket.on('player_joined', (message: GameMessage) => {
        const player = message.payload
        gameStore.addPlayer(player)
      })

      gameWebSocket.on('player_left', (message: GameMessage) => {
        const { playerId } = message.payload
        gameStore.removePlayer(playerId)
      })

      gameWebSocket.on('game_started', (message: GameMessage) => {
        const gameState = message.payload
        gameStore.startGame(gameState)
      })

      gameWebSocket.on('hand_dealt', (message: GameMessage) => {
        const { players, holeCards } = message.payload
        gameStore.dealHand(players, holeCards)
      })

      gameWebSocket.on('player_action', (message: GameMessage) => {
        const { playerId, action, amount } = message.payload
        gameStore.setPlayerAction(playerId, action, amount)
      })

      gameWebSocket.on('community_cards', (message: GameMessage) => {
        const { cards, phase } = message.payload
        gameStore.setCommunityCards(cards)
        gameStore.setGamePhase(phase)
      })

      gameWebSocket.on('hand_complete', (message: GameMessage) => {
        const { winners, pot, handResult } = message.payload
        gameStore.completeHand(winners, pot, handResult)
      })

      gameWebSocket.on('game_ended', (message: GameMessage) => {
        const { reason, finalStandings } = message.payload
        gameStore.endGame(reason, finalStandings)
      })

      gameHandlersSet.current = true
    }
  }, [gameStore])

  // Set up table WebSocket handlers
  useEffect(() => {
    if (!tableHandlersSet.current) {
      tableWebSocket.on('table_update', (message: TableMessage) => {
        const tableData = message.payload
        gameStore.updateTableInfo(tableData)
      })

      tableWebSocket.on('player_update', (message: TableMessage) => {
        const { playerId, updates } = message.payload
        gameStore.updatePlayer(playerId, updates)
      })

      tableWebSocket.on('bet_update', (message: TableMessage) => {
        const { playerId, betAmount, totalBet } = message.payload
        gameStore.setPlayerBet(playerId, betAmount, totalBet)
      })

      tableWebSocket.on('pot_update', (message: TableMessage) => {
        const { mainPot, sidePots } = message.payload
        gameStore.setPot(mainPot, sidePots)
      })

      tableWebSocket.on('phase_change', (message: TableMessage) => {
        const { phase, communityCards } = message.payload
        gameStore.setGamePhase(phase)
        if (communityCards) {
          gameStore.setCommunityCards(communityCards)
        }
      })

      tableWebSocket.on('timer_update', (message: TableMessage) => {
        const { playerId, timeRemaining } = message.payload
        gameStore.updatePlayerTimer(playerId, timeRemaining)
      })

      tableWebSocket.on('showdown', (message: TableMessage) => {
        const { players, communityCards, handResults } = message.payload
        gameStore.triggerShowdown(players, communityCards, handResults)
      })

      tableWebSocket.on('winner_declared', (message: TableMessage) => {
        const { winners, pot, handResults } = message.payload
        gameStore.declareWinners(winners, pot, handResults)
      })

      tableHandlersSet.current = true
    }
  }, [gameStore])

  // Connect WebSockets when authenticated
  useEffect(() => {
    if (isAuthenticated && token && !connectionAttempted.current) {
      connectionAttempted.current = true
      
      // Set authentication tokens
      gameWebSocket.setToken(token)
      tableWebSocket.setToken(token)

      // Connect to WebSockets
      gameWebSocket.connect().catch(console.error)
      tableWebSocket.connect().catch(console.error)
    }
  }, [isAuthenticated, token])

  // Disconnect when not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      gameWebSocket.disconnect()
      tableWebSocket.disconnect()
      connectionAttempted.current = false
    }
  }, [isAuthenticated])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      gameWebSocket.disconnect()
      tableWebSocket.disconnect()
    }
  }, [])

  return {
    gameConnected: gameWebSocket.connected,
    tableConnected: tableWebSocket.connected,
    
    // Game actions
    sendGameAction: (type: string, payload: any) => {
      gameWebSocket.send(type, payload)
    },
    
    // Table actions
    sendTableAction: (type: string, payload: any) => {
      tableWebSocket.send(type, payload)
    },
    
    // Convenience methods for common actions
    joinTable: (tableId: string, buyIn: number) => {
      gameWebSocket.send('join_table', { tableId, buyIn })
    },
    
    leaveTable: (tableId: string) => {
      gameWebSocket.send('leave_table', { tableId })
    },
    
    makeAction: (action: string, amount?: number) => {
      tableWebSocket.send('player_action', { action, amount })
    },
    
    sendChatMessage: (message: string) => {
      tableWebSocket.send('chat_message', { message })
    }
  }
}

// Hook for table-specific WebSocket connection
export function useTableWebSocket(tableId: string | null) {
  const webSocket = useWebSocketConnection()
  const gameStore = useGameStore()

  useEffect(() => {
    if (tableId && webSocket.gameConnected) {
      // Subscribe to table updates
      webSocket.sendGameAction('subscribe_to_table', { tableId })
      
      // Update current table in store
      gameStore.setTableId(tableId)
    }

    return () => {
      if (tableId && webSocket.gameConnected) {
        // Unsubscribe from table updates
        webSocket.sendGameAction('unsubscribe_from_table', { tableId })
      }
    }
  }, [tableId, webSocket.gameConnected, gameStore])

  return webSocket
}
