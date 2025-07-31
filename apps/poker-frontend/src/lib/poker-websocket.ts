import { WebSocketClient } from './websocket-client'
import { Player } from '@/stores/game-store'
import { Card } from '@primo-poker/shared'

// Poker-specific WebSocket message types
export type PokerMessage = 
  | { type: 'PLAYER_JOINED'; payload: { player: Player; tableId: string } }
  | { type: 'PLAYER_LEFT'; payload: { playerId: string; tableId: string } }
  | { type: 'GAME_STARTED'; payload: { tableId: string; players: Player[]; dealerId: string } }
  | { type: 'CARDS_DEALT'; payload: { playerId: string; cards: Card[] } }
  | { type: 'COMMUNITY_CARDS'; payload: { cards: Card[]; phase: 'flop' | 'turn' | 'river' } }
  | { type: 'PLAYER_ACTION'; payload: { playerId: string; action: string; amount?: number; newChipCount: number } }
  | { type: 'BETTING_ROUND_COMPLETE'; payload: { pot: number; nextPhase: string } }
  | { type: 'HAND_COMPLETE'; payload: { winners: string[]; winnings: Record<string, number> } }
  | { type: 'PLAYER_TURN'; payload: { playerId: string; timeRemaining: number } }
  | { type: 'TABLE_STATE'; payload: { players: Player[]; pot: number; communityCards: Card[]; gamePhase: string } }
  | { type: 'ERROR'; payload: { message: string; code?: string } }

export type PokerEventHandler = (message: PokerMessage) => void

class PokerGameClientClass {
  private wsClient: WebSocketClient
  private tableId: string | null = null
  private eventHandlers: Map<string, PokerEventHandler[]> = new Map()
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(baseUrl: string = 'ws://localhost:8787') {
    this.wsClient = new WebSocketClient(`${baseUrl}/ws/game`)
    this.setupBaseEventHandlers()
  }

  private setupBaseEventHandlers() {
    // Handle raw WebSocket messages and convert to poker-specific events
    this.wsClient.on('message', (message) => {
      try {
        const data = typeof message.payload === 'string' 
          ? JSON.parse(message.payload) 
          : message.payload
        const pokerMessage = { type: message.type, payload: data } as PokerMessage
        this.handlePokerMessage(pokerMessage)
      } catch (error) {
        console.error('Failed to parse poker message:', error)
      }
    })

    this.wsClient.on('connect', () => {
      console.log('Poker game client connected')
      this.startHeartbeat()
      
      // Rejoin table if we were in one
      if (this.tableId) {
        this.joinTable(this.tableId)
      }
    })

    this.wsClient.on('disconnect', () => {
      console.log('Poker game client disconnected')
      this.stopHeartbeat()
      this.scheduleReconnect()
    })

    this.wsClient.on('error', (error) => {
      console.error('Poker game client error:', error)
      this.emit('ERROR', { message: 'WebSocket error occurred' })
    })
  }

  private handlePokerMessage(message: PokerMessage) {
    // Emit the message to specific event handlers
    this.emit(message.type, message.payload)
    
    // Handle internal state updates
    switch (message.type) {
      case 'PLAYER_TURN':
        // Start countdown timer for active player
        this.handlePlayerTurn(message.payload)
        break
      case 'TABLE_STATE':
        // Update local table state cache
        this.handleTableState(message.payload)
        break
    }
  }

  private handlePlayerTurn(payload: { playerId: string; timeRemaining: number }) {
    // Could implement turn timer logic here
    console.log(`Player ${payload.playerId} has ${payload.timeRemaining}s to act`)
  }

  private handleTableState(payload: any) {
    // Cache the latest table state for reconnection scenarios
    console.log('Table state updated:', payload)
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send('HEARTBEAT', { timestamp: Date.now() })
    }, 30000) // 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect poker game client...')
      this.connect()
    }, 3000)
  }

  // Public API methods
  setToken(token: string) {
    this.wsClient.setToken(token)
  }

  async connect(): Promise<void> {
    return this.wsClient.connect()
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.wsClient.disconnect()
  }

  // Table management
  async joinTable(tableId: string): Promise<void> {
    this.tableId = tableId
    this.send('JOIN_TABLE', { tableId })
  }

  async leaveTable(): Promise<void> {
    if (this.tableId) {
      this.send('LEAVE_TABLE', { tableId: this.tableId })
      this.tableId = null
    }
  }

  async createTable(maxPlayers: number = 9, blinds: { small: number; big: number }): Promise<void> {
    this.send('CREATE_TABLE', { maxPlayers, blinds })
  }

  // Game actions
  async playerAction(action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in', amount?: number): Promise<void> {
    if (!this.tableId) {
      throw new Error('Not seated at a table')
    }
    
    // Map 'all-in' to 'raise' for the WebSocket
    const wsAction = action === 'all-in' ? 'raise' : action
    
    this.send('PLAYER_ACTION', {
      tableId: this.tableId,
      action: wsAction,
      amount
    })
  }

  async sitDown(position: number): Promise<void> {
    if (!this.tableId) {
      throw new Error('Must join table before sitting down')
    }
    
    this.send('SIT_DOWN', {
      tableId: this.tableId,
      position
    })
  }

  async standUp(): Promise<void> {
    if (!this.tableId) {
      throw new Error('Not seated at a table')
    }
    
    this.send('STAND_UP', {
      tableId: this.tableId
    })
  }

  async requestTableState(): Promise<void> {
    if (!this.tableId) {
      throw new Error('Not seated at a table')
    }
    
    this.send('GET_TABLE_STATE', {
      tableId: this.tableId
    })
  }

  // Event handling
  on(eventType: PokerMessage['type'], handler: PokerEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  off(eventType: PokerMessage['type'], handler: PokerEventHandler): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  private emit(eventType: string, payload: any): void {
    const handlers = this.eventHandlers.get(eventType as PokerMessage['type'])
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler({ type: eventType, payload } as PokerMessage)
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, error)
        }
      })
    }
  }

  private send(type: string, payload: any): void {
    this.wsClient.send(type, payload)
  }

  // Utility methods
  isConnected(): boolean {
    // Access the private property through a public method we'll need to add to WebSocketClient
    return (this.wsClient as any).isConnected || false
  }

  getCurrentTableId(): string | null {
    return this.tableId
  }
}

// Export singleton instance
export const pokerGameClient = new PokerGameClientClass()

// Export the class for dependency injection or testing
export type PokerGameClient = PokerGameClientClass
