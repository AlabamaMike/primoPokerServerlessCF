/**
 * Delta Update Generator Unit Tests
 * Focused tests for JSON Patch generation
 */

import { DeltaUpdateGenerator } from '../delta-update-generator'
import { TableListing } from '@primo-poker/shared'

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