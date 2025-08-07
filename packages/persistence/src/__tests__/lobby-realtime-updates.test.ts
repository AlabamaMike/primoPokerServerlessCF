/**
 * Lobby Real-time Updates Tests - TDD Approach
 * Tests for table state change detection, delta updates, and WebSocket broadcasting
 */

import { LobbyCoordinatorDurableObject } from '../lobby-coordinator-do'
import { TableListing, LobbyTableConfig } from '@primo-poker/shared'
import { TableStateChangeDetector } from '../table-state-detector'
import { DeltaUpdateGenerator } from '../delta-update-generator'

// Mock Durable Object environment
class MockDurableObjectState {
  storage: Map<string, unknown> = new Map()
  websockets: Set<WebSocket> = new Set()
  id = { toString: () => 'test-id' }

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

describe('Lobby Real-time Updates', () => {
  describe('TableStateChangeDetector', () => {
    let detector: TableStateChangeDetector
    
    beforeEach(() => {
      detector = new TableStateChangeDetector()
    })

    it('should detect when a new table is created', () => {
      const oldState = new Map<string, TableListing>()
      const newState = new Map<string, TableListing>([
        ['table-1', {
          tableId: 'table-1',
          name: 'New Table',
          gameType: 'texas_holdem',
          stakes: { smallBlind: 10, bigBlind: 20 },
          currentPlayers: 0,
          maxPlayers: 9,
          isPrivate: false,
          requiresPassword: false,
          avgPot: 0,
          handsPerHour: 0,
          waitingList: 0,
          playerList: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
          status: 'waiting'
        }]
      ])

      const changes = detector.detectChanges(oldState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('TABLE_CREATED')
      expect(changes[0].tableId).toBe('table-1')
      expect(changes[0].data).toEqual(newState.get('table-1'))
    })

    it('should detect when table player count changes', () => {
      const table: TableListing = {
        tableId: 'table-1',
        name: 'Test Table',
        gameType: 'texas_holdem',
        stakes: { smallBlind: 10, bigBlind: 20 },
        currentPlayers: 2,
        maxPlayers: 9,
        isPrivate: false,
        requiresPassword: false,
        avgPot: 0,
        handsPerHour: 0,
        waitingList: 0,
        playerList: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'waiting'
      }

      const oldState = new Map([['table-1', { ...table }]])
      const newState = new Map([['table-1', { ...table, currentPlayers: 3 }]])

      const changes = detector.detectChanges(oldState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('TABLE_UPDATED')
      expect(changes[0].tableId).toBe('table-1')
      expect(changes[0].fields).toContain('currentPlayers')
    })

    it('should detect when table is removed', () => {
      const table: TableListing = {
        tableId: 'table-1',
        name: 'Test Table',
        gameType: 'texas_holdem',
        stakes: { smallBlind: 10, bigBlind: 20 },
        currentPlayers: 0,
        maxPlayers: 9,
        isPrivate: false,
        requiresPassword: false,
        avgPot: 0,
        handsPerHour: 0,
        waitingList: 0,
        playerList: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'waiting'
      }

      const oldState = new Map([['table-1', table]])
      const newState = new Map<string, TableListing>()

      const changes = detector.detectChanges(oldState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('TABLE_REMOVED')
      expect(changes[0].tableId).toBe('table-1')
    })

    it('should detect multiple field changes', () => {
      const table: TableListing = {
        tableId: 'table-1',
        name: 'Test Table',
        gameType: 'texas_holdem',
        stakes: { smallBlind: 10, bigBlind: 20 },
        currentPlayers: 2,
        maxPlayers: 9,
        isPrivate: false,
        requiresPassword: false,
        avgPot: 100,
        handsPerHour: 30,
        waitingList: 0,
        playerList: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'active'
      }

      const oldState = new Map([['table-1', { ...table }]])
      const newState = new Map([['table-1', { 
        ...table, 
        currentPlayers: 3,
        avgPot: 150,
        handsPerHour: 35,
        status: 'active'
      }]])

      const changes = detector.detectChanges(oldState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('TABLE_UPDATED')
      expect(changes[0].fields).toEqual(
        expect.arrayContaining(['currentPlayers', 'avgPot', 'handsPerHour'])
      )
    })

    it('should detect stats updates', () => {
      const table: TableListing = {
        tableId: 'table-1',
        name: 'Test Table',
        gameType: 'texas_holdem',
        stakes: { smallBlind: 10, bigBlind: 20 },
        currentPlayers: 5,
        maxPlayers: 9,
        isPrivate: false,
        requiresPassword: false,
        avgPot: 100,
        handsPerHour: 30,
        waitingList: 0,
        playerList: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'active'
      }

      const oldState = new Map([['table-1', { ...table }]])
      const newState = new Map([['table-1', { 
        ...table, 
        avgPot: 200,
        handsPerHour: 40
      }]])

      const changes = detector.detectChanges(oldState, newState)
      
      expect(changes).toHaveLength(1)
      expect(changes[0].type).toBe('STATS_UPDATED')
      expect(changes[0].tableId).toBe('table-1')
      expect(changes[0].stats).toEqual({
        avgPot: 200,
        handsPerHour: 40
      })
    })
  })

  describe('DeltaUpdateGenerator', () => {
    let generator: DeltaUpdateGenerator

    beforeEach(() => {
      generator = new DeltaUpdateGenerator()
    })

    it('should generate JSON Patch for table creation', () => {
      const change = {
        type: 'TABLE_CREATED' as const,
        tableId: 'table-1',
        data: {
          tableId: 'table-1',
          name: 'New Table',
          gameType: 'texas_holdem',
          stakes: { smallBlind: 10, bigBlind: 20 },
          currentPlayers: 0,
          maxPlayers: 9,
          isPrivate: false,
          requiresPassword: false,
          avgPot: 0,
          handsPerHour: 0,
          waitingList: 0,
          playerList: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
          status: 'waiting'
        } as TableListing
      }

      const patch = generator.generatePatch([change])
      
      expect(patch).toHaveLength(1)
      expect(patch[0].op).toBe('add')
      expect(patch[0].path).toBe('/tables/table-1')
      expect(patch[0].value).toEqual(change.data)
    })

    it('should generate JSON Patch for table updates', () => {
      const change = {
        type: 'TABLE_UPDATED' as const,
        tableId: 'table-1',
        fields: ['currentPlayers', 'avgPot'],
        updates: {
          currentPlayers: 3,
          avgPot: 150
        }
      }

      const patch = generator.generatePatch([change])
      
      expect(patch).toHaveLength(2)
      expect(patch).toEqual(
        expect.arrayContaining([
          { op: 'replace', path: '/tables/table-1/currentPlayers', value: 3 },
          { op: 'replace', path: '/tables/table-1/avgPot', value: 150 }
        ])
      )
    })

    it('should generate JSON Patch for table removal', () => {
      const change = {
        type: 'TABLE_REMOVED' as const,
        tableId: 'table-1'
      }

      const patch = generator.generatePatch([change])
      
      expect(patch).toHaveLength(1)
      expect(patch[0]).toEqual({
        op: 'remove',
        path: '/tables/table-1'
      })
    })

    it('should batch multiple changes', () => {
      const changes = [
        {
          type: 'TABLE_CREATED' as const,
          tableId: 'table-1',
          data: { tableId: 'table-1' } as TableListing
        },
        {
          type: 'TABLE_UPDATED' as const,
          tableId: 'table-2',
          fields: ['currentPlayers'],
          updates: { currentPlayers: 5 }
        },
        {
          type: 'TABLE_REMOVED' as const,
          tableId: 'table-3'
        }
      ]

      const patch = generator.generatePatch(changes)
      
      expect(patch).toHaveLength(3)
      expect(patch[0].op).toBe('add')
      expect(patch[1].op).toBe('replace')
      expect(patch[2].op).toBe('remove')
    })
  })

  describe('LobbyCoordinator Real-time Updates Integration', () => {
    let coordinator: LobbyCoordinatorDurableObject
    let mockState: MockDurableObjectState
    let mockEnv: unknown
    let mockWebSocket1: MockWebSocket
    let mockWebSocket2: MockWebSocket
    
    beforeEach(() => {
      mockState = new MockDurableObjectState()
      mockEnv = {}
      coordinator = new LobbyCoordinatorDurableObject(mockState as any, mockEnv)
      
      // Create mock WebSocket connections
      mockWebSocket1 = new MockWebSocket()
      mockWebSocket2 = new MockWebSocket()
    })

    it('should detect changes and broadcast updates when table is created', async () => {
      // Create a table
      const createRequest = new Request('http://localhost/tables/create', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
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
      })

      const response = await coordinator.fetch(createRequest)
      expect(response.status).toBe(200)

      // Check if TABLE_CREATED broadcast was sent
      // This test will fail initially until we implement the feature
      const broadcasts = (coordinator as unknown as { getLastBroadcast?: () => unknown }).getLastBroadcast?.()
      expect(broadcasts).toBeDefined()
      expect(broadcasts?.type).toBe('table_created')
      expect(broadcasts?.payload.table.tableId).toBe('table-1')
    })

    it('should broadcast delta updates when table is updated', async () => {
      // First create a table
      await coordinator.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
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

      // Update the table
      const updateRequest = new Request('http://localhost/tables/update', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
        body: JSON.stringify({
          tableId: 'table-1',
          players: [
            { playerId: 'player-1', username: 'Player1', isActive: true },
            { playerId: 'player-2', username: 'Player2', isActive: true }
          ]
        })
      })

      const response = await coordinator.fetch(updateRequest)
      expect(response.status).toBe(200)

      // Check if delta update was broadcast
      const broadcast = (coordinator as unknown as { getLastBroadcast?: () => unknown }).getLastBroadcast?.()
      expect(broadcast).toBeDefined()
      expect(broadcast?.type).toBe('table_delta_update')
      expect(broadcast?.payload.changes).toHaveLength(1)
      expect(broadcast?.payload.changes[0].type).toBe('TABLE_UPDATED')
    })

    it('should batch multiple updates within time window', async () => {
      // Create table
      await coordinator.fetch(new Request('http://localhost/tables/create', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
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

      // Make multiple updates rapidly
      const updates = []
      for (let i = 1; i <= 3; i++) {
        updates.push(
          coordinator.fetch(new Request('http://localhost/tables/update', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer test-token' },
            body: JSON.stringify({
              tableId: 'table-1',
              pot: i * 100,
              phase: 'FLOP'
            })
          }))
        )
      }

      await Promise.all(updates)

      // Wait for batching window
      await new Promise(resolve => setTimeout(resolve, 150))

      // Check that updates were batched
      const batches = (coordinator as unknown as { getBroadcastBatches?: () => unknown }).getBroadcastBatches?.()
      expect(batches).toBeDefined()
      expect(batches?.length).toBe(1) // All updates should be in one batch
      expect(batches?.[0].updates).toHaveLength(3)
    })

    it('should include sequence numbers in broadcasts', async () => {
      // Create multiple tables
      for (let i = 1; i <= 3; i++) {
        await coordinator.fetch(new Request('http://localhost/tables/create', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer test-token' },
          body: JSON.stringify({
            tableId: `table-${i}`,
            config: {
              name: `Table ${i}`,
              gameType: 'texas_holdem',
              stakes: { smallBlind: 10, bigBlind: 20 },
              maxPlayers: 9,
              isPrivate: false
            },
            creatorId: 'player-123'
          })
        }))
      }

      // Get all broadcasts
      const broadcasts = (coordinator as unknown as { getAllBroadcasts?: () => unknown }).getAllBroadcasts?.()
      expect(broadcasts).toBeDefined()
      
      // Check sequence numbers
      broadcasts?.forEach((broadcast: unknown, index: number) => {
        expect(broadcast.sequenceId).toBe(index + 1)
      })
    })
  })
})