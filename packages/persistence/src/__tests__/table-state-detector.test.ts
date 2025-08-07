/**
 * Table State Detector Unit Tests
 * Focused tests for change detection without LobbyCoordinator dependencies
 */

import { TableStateChangeDetector } from '../table-state-detector'
import { TableListing } from '@primo-poker/shared'

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