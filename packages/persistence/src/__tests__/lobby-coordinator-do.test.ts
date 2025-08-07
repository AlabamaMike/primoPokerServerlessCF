/**
 * LobbyCoordinator Durable Object Unit Tests
 */

import { LobbyCoordinatorDurableObject } from '../lobby-coordinator-do'
import type { TableListing, LobbyTableConfig } from '@primo-poker/shared'

// Mock Durable Object environment
class MockDurableObjectState {
  storage: Map<string, any> = new Map()
  websockets: Set<WebSocket> = new Set()

  async blockConcurrencyWhile(fn: () => Promise<void>): Promise<void> {
    await fn()
  }

  acceptWebSocket(ws: WebSocket): void {
    this.websockets.add(ws)
  }
}

class MockWebSocket {
  readyState: number = WebSocket.OPEN
  messages: string[] = []
  
  send(data: string): void {
    this.messages.push(data)
  }
  
  close(): void {
    this.readyState = WebSocket.CLOSED
  }
}

describe('LobbyCoordinatorDurableObject', () => {
  let durableObject: LobbyCoordinatorDurableObject
  let mockState: MockDurableObjectState
  let mockEnv: any

  beforeEach(() => {
    mockState = new MockDurableObjectState()
    mockEnv = {}
    durableObject = new LobbyCoordinatorDurableObject(mockState as any, mockEnv)
  })

  describe('Table Management', () => {
    it('should create a new table listing', async () => {
      const config: LobbyTableConfig = {
        name: 'Test Table',
        gameType: 'texas_holdem',
        stakes: { smallBlind: 10, bigBlind: 20 },
        maxPlayers: 9,
        isPrivate: false
      }

      const request = new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-123',
          config,
          creatorId: 'player-123'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.tableId).toBe('table-123')
    })

    it('should get filtered tables', async () => {
      // First create some tables
      const tables = [
        {
          tableId: 'table-1',
          config: {
            name: 'High Stakes',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 50, bigBlind: 100 },
            maxPlayers: 9,
            isPrivate: false
          }
        },
        {
          tableId: 'table-2',
          config: {
            name: 'Low Stakes',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 5, bigBlind: 10 },
            maxPlayers: 6,
            isPrivate: false
          }
        },
        {
          tableId: 'table-3',
          config: {
            name: 'Private Game',
            gameType: 'omaha',
            stakes: { smallBlind: 10, bigBlind: 20 },
            maxPlayers: 9,
            isPrivate: true
          }
        }
      ]

      // Create tables
      for (const table of tables) {
        await durableObject.fetch(new Request('http://localhost/tables/create', {
          method: 'POST',
          body: JSON.stringify({
            ...table,
            creatorId: 'creator-123'
          })
        }))
      }

      // Test filtering by stakes
      const highStakesRequest = new Request('http://localhost/tables?minStakes=50')
      const highStakesResponse = await durableObject.fetch(highStakesRequest)
      const highStakesResult = await highStakesResponse.json() as any

      expect(highStakesResult.data.tables).toHaveLength(1)
      expect(highStakesResult.data.tables[0].name).toBe('High Stakes')

      // Test filtering by game type
      const omahaRequest = new Request('http://localhost/tables?gameType=omaha')
      const omahaResponse = await durableObject.fetch(omahaRequest)
      const omahaResult = await omahaResponse.json() as any

      expect(omahaResult.data.tables).toHaveLength(1)
      expect(omahaResult.data.tables[0].name).toBe('Private Game')

      // Test filtering by privacy
      const publicRequest = new Request('http://localhost/tables?isPrivate=false')
      const publicResponse = await durableObject.fetch(publicRequest)
      const publicResult = await publicResponse.json() as any

      expect(publicResult.data.tables).toHaveLength(2)
    })

    it('should update table information', async () => {
      // Create a table first
      await durableObject.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-123',
          config: {
            name: 'Test Table',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 10, bigBlind: 20 },
            maxPlayers: 9,
            isPrivate: false
          },
          creatorId: 'player-123'
        })
      }))

      // Update table with player info
      const updateRequest = new Request('http://localhost/tables/update', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-123',
          players: [
            { playerId: 'player-1', username: 'Player1', chipCount: 1000, isActive: true },
            { playerId: 'player-2', username: 'Player2', chipCount: 2000, isActive: true }
          ],
          pot: 100,
          phase: 'FLOP'
        })
      })

      const updateResponse = await durableObject.fetch(updateRequest)
      const updateResult = await updateResponse.json() as any

      expect(updateResponse.status).toBe(200)
      expect(updateResult.success).toBe(true)

      // Verify table was updated
      const getRequest = new Request('http://localhost/tables')
      const getResponse = await durableObject.fetch(getRequest)
      const getResult = await getResponse.json() as any

      const table = getResult.data.tables.find((t: any) => t.tableId === 'table-123')
      expect(table.currentPlayers).toBe(2)
      expect(table.status).toBe('active')
    })

    it('should remove a table', async () => {
      // Create a table
      await durableObject.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-to-remove',
          config: {
            name: 'Remove Me',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 10, bigBlind: 20 },
            maxPlayers: 9,
            isPrivate: false
          },
          creatorId: 'player-123'
        })
      }))

      // Remove the table
      const removeRequest = new Request('http://localhost/tables/remove', {
        method: 'POST',
        body: JSON.stringify({ tableId: 'table-to-remove' })
      })

      const removeResponse = await durableObject.fetch(removeRequest)
      expect(removeResponse.status).toBe(200)

      // Verify table is gone
      const getRequest = new Request('http://localhost/tables')
      const getResponse = await durableObject.fetch(getRequest)
      const getResult = await getResponse.json() as any

      const table = getResult.data.tables.find((t: any) => t.tableId === 'table-to-remove')
      expect(table).toBeUndefined()
    })
  })

  describe('Player Location Tracking', () => {
    it('should track player table location', async () => {
      // Create table and update with players
      await durableObject.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-123',
          config: {
            name: 'Test Table',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 10, bigBlind: 20 },
            maxPlayers: 9,
            isPrivate: false
          },
          creatorId: 'player-123'
        })
      }))

      await durableObject.fetch(new Request('http://localhost/tables/update', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-123',
          players: [
            { playerId: 'player-456', username: 'TestPlayer', chipCount: 1000, isActive: true }
          ]
        })
      }))

      // Get player location
      const locationRequest = new Request('http://localhost/player/location?playerId=player-456')
      const locationResponse = await durableObject.fetch(locationRequest)
      const locationResult = await locationResponse.json() as any

      expect(locationResponse.status).toBe(200)
      expect(locationResult.data.tableId).toBe('table-123')
      expect(locationResult.data.table.name).toBe('Test Table')
    })

    it('should return null for player not at any table', async () => {
      const request = new Request('http://localhost/player/location?playerId=unknown-player')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.tableId).toBeNull()
      expect(result.data.table).toBeNull()
    })
  })

  describe('WebSocket Support', () => {
    it('should handle WebSocket upgrade', async () => {
      const mockWebSocketPair = {
        0: new MockWebSocket(),
        1: new MockWebSocket()
      }

      global.WebSocketPair = jest.fn().mockReturnValue(mockWebSocketPair)

      const request = new Request('http://localhost/ws', {
        headers: {
          'Upgrade': 'websocket',
          'X-Client-ID': 'client-123'
        }
      })

      const response = await durableObject.fetch(request)

      expect(response.status).toBe(101)
      expect(response.webSocket).toBeDefined()
    })

    it('should send initial state on WebSocket connection', async () => {
      // Create some tables first
      await durableObject.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          config: {
            name: 'Test Table',
            gameType: 'texas_holdem',
            stakes: { smallBlind: 10, bigBlind: 20 },
            maxPlayers: 9,
            isPrivate: false
          },
          creatorId: 'player-123'
        })
      }))

      const mockWebSocket = new MockWebSocket()
      const mockWebSocketPair = {
        0: new MockWebSocket(),
        1: mockWebSocket
      }

      global.WebSocketPair = jest.fn().mockReturnValue(mockWebSocketPair)

      await durableObject.fetch(new Request('http://localhost/ws', {
        headers: {
          'Upgrade': 'websocket',
          'X-Client-ID': 'client-123'
        }
      }))

      // Check that initial state was sent
      expect(mockWebSocket.messages.length).toBeGreaterThan(0)
      const message = JSON.parse(mockWebSocket.messages[0])
      expect(message.type).toBe('lobby_state')
      expect(message.payload.tables).toHaveLength(1)
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const request = new Request('http://localhost/health')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.healthy).toBe(true)
      expect(result.instanceId).toBeDefined()
      expect(result.uptime).toBeGreaterThanOrEqual(0)
      expect(result.tableCount).toBe(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid table creation', async () => {
      const request = new Request('http://localhost/tables/create', {
        method: 'POST',
        body: JSON.stringify({
          // Missing required fields
          config: {}
        })
      })

      const response = await durableObject.fetch(request)
      
      expect(response.status).toBe(500)
    })

    it('should handle updating non-existent table', async () => {
      const request = new Request('http://localhost/tables/update', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'non-existent',
          players: []
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Table not found')
    })

    it('should handle invalid HTTP methods', async () => {
      const request = new Request('http://localhost/tables/create', {
        method: 'GET' // Should be POST
      })

      const response = await durableObject.fetch(request)
      
      expect(response.status).toBe(405)
    })
  })
})