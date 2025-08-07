/**
 * Lobby Broadcast Manager Tests
 * Tests for batching, sequencing, and broadcasting
 */

import { LobbyBroadcastManager } from '../lobby-broadcast-manager'
import { TableListing, WebSocketMessage } from '@primo-poker/shared'
import { extractBroadcastTestData, resetBroadcastManager } from '../test-helpers/broadcast-test-helpers'

describe('LobbyBroadcastManager', () => {
  let manager: LobbyBroadcastManager
  let mockBroadcastFn: jest.Mock<Promise<void>, [WebSocketMessage]>
  
  beforeEach(() => {
    manager = new LobbyBroadcastManager({
      batchingWindowMs: 50, // Shorter for testing
      maxBatchSize: 10
    })
    mockBroadcastFn = jest.fn().mockResolvedValue(undefined)
  })
  
  afterEach(() => {
    resetBroadcastManager(manager)
  })

  const createTable = (id: string, players: number = 0): TableListing => ({
    tableId: id,
    name: `Table ${id}`,
    gameType: 'texas_holdem',
    stakes: { smallBlind: 10, bigBlind: 20 },
    currentPlayers: players,
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
  })

  it('should detect and broadcast table creation', async () => {
    const oldState = new Map<string, TableListing>()
    const newState = new Map([['table-1', createTable('table-1')]])
    
    await manager.updateState(newState, mockBroadcastFn)
    
    // Wait for batching window
    await new Promise(resolve => setTimeout(resolve, 100))
    
    expect(mockBroadcastFn).toHaveBeenCalledTimes(1)
    const broadcast = mockBroadcastFn.mock.calls[0][0]
    expect(broadcast.type).toBe('table_delta_update')
    expect(broadcast.payload.changes).toHaveLength(1)
    expect(broadcast.payload.changes[0].type).toBe('TABLE_CREATED')
    expect(broadcast.payload.sequenceId).toBe(1)
  })

  it('should batch multiple updates within time window', async () => {
    const state1 = new Map([['table-1', createTable('table-1')]])
    const state2 = new Map([
      ['table-1', createTable('table-1')],
      ['table-2', createTable('table-2')]
    ])
    const state3 = new Map([
      ['table-1', createTable('table-1', 2)], // Updated
      ['table-2', createTable('table-2')],
      ['table-3', createTable('table-3')]
    ])
    
    // Make rapid updates
    await manager.updateState(state1, mockBroadcastFn)
    await manager.updateState(state2, mockBroadcastFn)
    await manager.updateState(state3, mockBroadcastFn)
    
    // Should not broadcast yet
    expect(mockBroadcastFn).not.toHaveBeenCalled()
    
    // Wait for batching window
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Should broadcast once with all changes
    expect(mockBroadcastFn).toHaveBeenCalledTimes(1)
    const broadcast = mockBroadcastFn.mock.calls[0][0]
    expect(broadcast.payload.changes).toHaveLength(3) // table-1 created, table-2 created, table-1 updated, table-3 created
    
    const testData = extractBroadcastTestData(manager)
    expect(testData.broadcastBatches).toHaveLength(1)
  })

  it('should immediately broadcast when batch size limit is reached', async () => {
    const states: Map<string, TableListing>[] = []
    let currentState = new Map<string, TableListing>()
    
    // Create 11 tables (exceeds batch size of 10)
    for (let i = 1; i <= 11; i++) {
      currentState = new Map(currentState)
      currentState.set(`table-${i}`, createTable(`table-${i}`))
      states.push(currentState)
    }
    
    // Update state incrementally
    for (let i = 0; i < states.length; i++) {
      await manager.updateState(states[i], mockBroadcastFn)
    }
    
    // Should have broadcast immediately when reaching 10 changes
    expect(mockBroadcastFn.mock.calls.length).toBeGreaterThanOrEqual(1)
    
    // First broadcast should have 10 changes
    const firstBroadcast = mockBroadcastFn.mock.calls[0][0]
    expect(firstBroadcast.payload.changes).toHaveLength(10)
  })

  it('should increment sequence numbers correctly', async () => {
    const state1 = new Map([['table-1', createTable('table-1')]])
    const state2 = new Map([
      ['table-1', createTable('table-1')],
      ['table-2', createTable('table-2')]
    ])
    
    await manager.updateState(state1, mockBroadcastFn)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    await manager.updateState(state2, mockBroadcastFn)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const broadcasts = manager.getAllBroadcasts()
    expect(broadcasts).toHaveLength(2)
    expect(broadcasts[0].payload.sequenceId).toBe(1)
    expect(broadcasts[1].payload.sequenceId).toBe(2)
  })

  it('should generate correct JSON Patch operations', async () => {
    const oldState = new Map([['table-1', createTable('table-1', 2)]])
    const newState = new Map([['table-1', createTable('table-1', 3)]])
    
    await manager.updateState(newState, mockBroadcastFn)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const broadcast = mockBroadcastFn.mock.calls[0][0]
    expect(broadcast.payload.patch).toHaveLength(1)
    expect(broadcast.payload.patch[0]).toEqual({
      op: 'replace',
      path: '/tables/table-1/currentPlayers',
      value: 3
    })
  })

  it('should handle immediate broadcast methods', async () => {
    const table = createTable('table-1')
    
    await manager.broadcastTableChange('table_created', table, mockBroadcastFn)
    
    expect(mockBroadcastFn).toHaveBeenCalledTimes(1)
    const broadcast = mockBroadcastFn.mock.calls[0][0]
    expect(broadcast.type).toBe('table_created')
    expect(broadcast.payload.table).toEqual(table)
  })
})