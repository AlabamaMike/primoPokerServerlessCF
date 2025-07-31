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
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map()
  private messageQueue: WebSocketMessage[] = []
  private isConnected = false

  constructor(url: string) {
    this.url = url
  }

  setToken(token: string) {
    this.token = token
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.token 
          ? `${this.url}?token=${this.token}`
          : this.url

        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnected = true
          this.reconnectAttempts = 0
          
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
          console.log('WebSocket disconnected:', event.code, event.reason)
          this.isConnected = false
          
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
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

  private scheduleReconnect() {
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts)
    this.reconnectAttempts++
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  private handleMessage(message: WebSocketMessage) {
    const handlers = this.eventHandlers.get(message.type) || []
    handlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error('Error in WebSocket event handler:', error)
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
      // Queue message for when connection is restored
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
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.isConnected = false
    this.messageQueue = []
  }

  get connected() {
    return this.isConnected
  }
}

// WebSocket URLs for different environments
const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://primo-poker-server.alabamamike.workers.dev'

export const gameWebSocket = new WebSocketClient(`${WS_BASE_URL}/ws/game`)
export const tableWebSocket = new WebSocketClient(`${WS_BASE_URL}/ws/table`)
