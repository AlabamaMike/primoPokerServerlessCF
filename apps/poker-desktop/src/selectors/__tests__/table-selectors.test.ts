import { describe, it, expect } from 'vitest';
import {
  getStakeLevel,
  selectTables,
  selectSelectedTable,
  selectFavoriteTableIds,
  createFilteredTablesSelector,
  selectTablesByStakeLevel,
  selectTablesWithOpenSeats,
  selectTablesStatistics,
  selectQuickSeatSuggestions
} from '../table-selectors';
import { TableState } from '../../stores/table-store';
import { FilterState } from '../../stores/filter-store';
import { Table } from '../../components/LobbyV2/types';

const mockTables: Table[] = [
  {
    id: '1',
    name: 'Micro Table',
    gameType: 'nlhe',
    stakes: { small: 0.05, big: 0.1, currency: '€' },
    players: 4,
    maxPlayers: 6,
    avgPot: 2,
    speed: 'normal',
    waitlist: 0,
    features: []
  },
  {
    id: '2',
    name: 'Low Stakes',
    gameType: 'plo',
    stakes: { small: 0.5, big: 1, currency: '€' },
    players: 6,
    maxPlayers: 6,
    avgPot: 20,
    speed: 'fast',
    waitlist: 2,
    features: ['speed']
  },
  {
    id: '3',
    name: 'Mid Stakes',
    gameType: 'nlhe',
    stakes: { small: 2.5, big: 5, currency: '€' },
    players: 7,
    maxPlayers: 9,
    avgPot: 100,
    speed: 'normal',
    waitlist: 0,
    features: ['rakeback']
  },
  {
    id: '4',
    name: 'High Stakes',
    gameType: 'nlhe',
    stakes: { small: 25, big: 50, currency: '€' },
    players: 2,
    maxPlayers: 6,
    avgPot: 1000,
    speed: 'normal',
    waitlist: 0,
    features: ['featured', 'deepstack']
  }
];

const createMockTableState = (overrides?: Partial<TableState>): TableState => ({
  tables: mockTables,
  isLoadingTables: false,
  tablesError: null,
  selectedTableId: null,
  favoriteTables: [],
  lastUpdateTimestamp: Date.now(),
  updateCount: 1,
  selectTable: () => {},
  toggleFavorite: () => {},
  fetchTables: async () => {},
  joinTable: async () => false,
  joinWaitlist: async () => null,
  updateTable: () => {},
  setTables: () => {},
  ...overrides
});

const createMockFilterState = (overrides?: Partial<FilterState>): FilterState => ({
  filters: {
    gameTypes: ['nlhe'],
    stakes: ['micro', 'low'],
    tableSizes: [6, 9],
    features: []
  },
  setFilters: () => {},
  updateGameTypes: () => {},
  updateStakes: () => {},
  updateTableSizes: () => {},
  updateFeatures: () => {},
  resetFilters: () => {},
  ...overrides
});

describe('Table Selectors', () => {
  describe('getStakeLevel', () => {
    it('should categorize stakes correctly', () => {
      expect(getStakeLevel(0.1)).toBe('micro');
      expect(getStakeLevel(0.25)).toBe('micro');
      expect(getStakeLevel(0.5)).toBe('low');
      expect(getStakeLevel(1)).toBe('low');
      expect(getStakeLevel(2)).toBe('low');
      expect(getStakeLevel(5)).toBe('mid');
      expect(getStakeLevel(10)).toBe('mid');
      expect(getStakeLevel(25)).toBe('high');
      expect(getStakeLevel(100)).toBe('high');
    });
  });

  describe('basic selectors', () => {
    it('selectTables should return all tables', () => {
      const state = createMockTableState();
      expect(selectTables(state)).toEqual(mockTables);
    });

    it('selectSelectedTable should return selected table', () => {
      const state = createMockTableState({ selectedTableId: '2' });
      const selected = selectSelectedTable(state);
      
      expect(selected).toEqual(mockTables[1]);
    });

    it('selectSelectedTable should return null when no selection', () => {
      const state = createMockTableState();
      expect(selectSelectedTable(state)).toBeNull();
    });

    it('selectFavoriteTableIds should return a Set', () => {
      const state = createMockTableState({ favoriteTables: ['1', '3'] });
      const favoriteIds = selectFavoriteTableIds(state);
      
      expect(favoriteIds).toBeInstanceOf(Set);
      expect(favoriteIds.has('1')).toBe(true);
      expect(favoriteIds.has('3')).toBe(true);
      expect(favoriteIds.has('2')).toBe(false);
    });
  });

  describe('createFilteredTablesSelector', () => {
    it('should filter by game type', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: ['plo'],
            stakes: [],
            tableSizes: [],
            features: []
          }
        })
      };
      
      const filtered = selector(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].gameType).toBe('plo');
    });

    it('should filter by stakes', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: [],
            stakes: ['micro'],
            tableSizes: [],
            features: []
          }
        })
      };
      
      const filtered = selector(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].stakes.big).toBe(0.1);
    });

    it('should filter by table size', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: [],
            stakes: [],
            tableSizes: [9],
            features: []
          }
        })
      };
      
      const filtered = selector(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].maxPlayers).toBe(9);
    });

    it('should filter by features', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: [],
            stakes: [],
            tableSizes: [],
            features: ['speed']
          }
        })
      };
      
      const filtered = selector(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].features).toContain('speed');
    });

    it('should apply multiple filters', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: ['nlhe'],
            stakes: ['high'],
            tableSizes: [6],
            features: ['featured']
          }
        })
      };
      
      const filtered = selector(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('4');
    });

    it('should memoize results', () => {
      const selector = createFilteredTablesSelector();
      const state = {
        ...createMockTableState(),
        ...createMockFilterState()
      };
      
      const result1 = selector(state);
      const result2 = selector(state);
      
      expect(result1).toBe(result2); // Same reference
    });
  });

  describe('selectTablesByStakeLevel', () => {
    it('should group tables by stake level', () => {
      const state = createMockTableState();
      const grouped = selectTablesByStakeLevel(state);
      
      expect(grouped.micro).toHaveLength(1);
      expect(grouped.low).toHaveLength(1);
      expect(grouped.mid).toHaveLength(1);
      expect(grouped.high).toHaveLength(1);
      
      expect(grouped.micro[0].id).toBe('1');
      expect(grouped.low[0].id).toBe('2');
      expect(grouped.mid[0].id).toBe('3');
      expect(grouped.high[0].id).toBe('4');
    });
  });

  describe('selectTablesWithOpenSeats', () => {
    it('should return only tables with open seats', () => {
      const state = createMockTableState();
      const openTables = selectTablesWithOpenSeats(state);
      
      expect(openTables).toHaveLength(3);
      expect(openTables.find(t => t.id === '2')).toBeUndefined(); // Full table
    });
  });

  describe('selectTablesStatistics', () => {
    it('should calculate correct statistics', () => {
      const state = createMockTableState();
      const stats = selectTablesStatistics(state);
      
      expect(stats).toEqual({
        totalTables: 4,
        totalPlayers: 19, // 4 + 6 + 7 + 2
        totalSeats: 27, // 6 + 6 + 9 + 6
        occupancyRate: expect.closeTo(70.37), // (19/27) * 100
        avgPlayersPerTable: 4.75, // 19/4
        tablesWithWaitlist: 1
      });
    });
  });

  describe('selectQuickSeatSuggestions', () => {
    it('should suggest tables based on filters and fill rate', () => {
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: ['nlhe'],
            stakes: ['micro', 'low', 'mid', 'high'],
            tableSizes: [6, 9],
            features: []
          }
        })
      };
      
      const suggestions = selectQuickSeatSuggestions(state);
      
      expect(suggestions).toHaveLength(3);
      // Should be sorted by fill rate (fuller tables first)
      expect(suggestions[0].id).toBe('3'); // 7/9 = 77.8%
      expect(suggestions[1].id).toBe('1'); // 4/6 = 66.7%
      expect(suggestions[2].id).toBe('4'); // 2/6 = 33.3%
    });

    it('should respect filter constraints', () => {
      const state = {
        ...createMockTableState(),
        ...createMockFilterState({
          filters: {
            gameTypes: ['plo'],
            stakes: ['low'],
            tableSizes: [6],
            features: []
          }
        })
      };
      
      const suggestions = selectQuickSeatSuggestions(state);
      
      expect(suggestions).toHaveLength(0); // PLO table is full
    });
  });
});