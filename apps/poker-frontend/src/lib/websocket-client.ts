type WebSocketMessage = {
  type: string
  payload: any
  timestamp?: string
}

type WebSocketEventHandler = (message: WebSocketMessage) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private token: string | null = null
  private tableId: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map()
  private messageQueue: WebSocketMessage[] = []
  private isConnected = false
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(url: string) {
    this.url = url
  }

  setToken(token: string) {
    this.token = token
  }

  setTableId(tableId: string) {
    this.tableId = tableId
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.token && this.tableId
          ? `${this.url}?token=${this.token}&tableId=${this.tableId}`
          : this.url

        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnected = true
          this.reconnectAttempts = 0
          
          // Start heartbeat
          this.startHeartbeat()
          
          // Send queued messages
          this.messageQueue.forEach(message => {
            this.send(message.type, message.payload)
          })
          this.messageQueue = []
          
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason)
          this.isConnected = false
          this.stopHeartbeat()
          
          // Attempt reconnection if not a normal closure
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }

      } catch (error) {
        reject(error)
      }
    })
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send('ping', {})
      }
    }, 30000) // Ping every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error)
      })
    }, delay)
  }

  private handleMessage(message: WebSocketMessage) {
    // Handle special messages
    if (message.type === 'pong') {
      // Heartbeat response, no action needed
      return
    }

    // Notify handlers
    const handlers = this.eventHandlers.get(message.type) || []
    handlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error(`Error in ${message.type} handler:`, error)
      }
    })
  }

  send(type: string, payload: any) {
    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: new Date().toISOString()
    }

    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message))
    } else {
      // Queue message for later sending
      this.messageQueue.push(message)
    }
  }

  on(eventType: string, handler: WebSocketEventHandler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: WebSocketEventHandler) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  disconnect() {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close(1000, 'Normal closure')
      this.ws = null
    }
    this.isConnected = false
    this.eventHandlers.clear()
    this.messageQueue = []
  }

  get connected() {
    return this.isConnected
  }
}

// Create singleton instances - only on client side to avoid SSR issues
let gameWebSocketInstance: WebSocketClient | null = null
let tableWebSocketInstance: WebSocketClient | null = null

export const gameWebSocket = (() => {
  if (typeof window === 'undefined') return null
  if (!gameWebSocketInstance) {
    // Use the proper WebSocket URL from config
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                  process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 
                  'wss://primo-poker-server.alabamamike.workers.dev'
    
    gameWebSocketInstance = new WebSocketClient(wsUrl)
  }
  return gameWebSocketInstance
})()

export const tableWebSocket = (() => {
  if (typeof window === 'undefined') return null
  if (!tableWebSocketInstance) {
    // Use the proper WebSocket URL from config
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 
                  process.env.NEXT_PUBLIC_API_URL?.replace('https://', 'wss://').replace('http://', 'ws://') || 
                  'wss://primo-poker-server.alabamamike.workers.dev'
    
    tableWebSocketInstance = new WebSocketClient(wsUrl)
  }
  return tableWebSocketInstance
})()
