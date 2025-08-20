import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTableStore, mapApiTableToUiTable } from '../table-store';
import { LobbyTable } from '../../services/lobby-service';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
global.localStorage = localStorageMock;

// Mock LobbyService
vi.mock('../../services/lobby-service', () => ({
  default: class LobbyService {
    async getTables() {
      return mockApiTables;
    }
    async joinTable(tableId: string, buyIn: number) {
      return { success: true };
    }
    async joinWaitlist(tableId: string) {
      return { success: true, position: 3 };
    }
  }
}));

const mockApiTables: LobbyTable[] = [
  {
    id: 'table-1',
    name: 'Beginner Table 1',
    gameType: 'nlhe',
    stakes: { smallBlind: 0.5, bigBlind: 1 },
    currentPlayers: 4,
    maxPlayers: 6,
    pot: 20,
    config: { ante: false }
  },
  {
    id: 'table-2',
    name: 'Speed Table 2',
    gameType: 'plo',
    stakes: { smallBlind: 2, bigBlind: 5 },
    currentPlayers: 8,
    maxPlayers: 9,
    pot: 100,
    config: { ante: true }
  }
];

describe('TableStore', () => {
  beforeEach(() => {
    // Reset store state
    useTableStore.setState({
      tables: [],
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      favoriteTables: [],
      lastUpdateTimestamp: 0,
      updateCount: 0
    });
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue('[]');
    localStorageMock.setItem.mockClear();
  });

  describe('mapApiTableToUiTable', () => {
    it('should correctly map API table to UI format', () => {
      const apiTable = mockApiTables[0];
      const uiTable = mapApiTableToUiTable(apiTable);

      expect(uiTable).toMatchObject({
        id: 'table-1',
        name: 'Beginner Table 1',
        gameType: 'nlhe',
        stakes: {
          small: 0.5,
          big: 1,
          currency: '€'
        },
        players: 4,
        maxPlayers: 6,
        avgPot: 20,
        speed: 'slow',
        waitlist: 0,
        features: ['beginner']
      });
    });

    it('should detect speed tables', () => {
      const apiTable = mockApiTables[1];
      const uiTable = mapApiTableToUiTable(apiTable);

      expect(uiTable.speed).toBe('fast');
      expect(uiTable.features).toContain('speed');
      expect(uiTable.features).toContain('ante');
    });
  });

  describe('selectTable', () => {
    it('should select a table by ID', () => {
      const { selectTable } = useTableStore.getState();
      
      selectTable('table-1');
      
      expect(useTableStore.getState().selectedTableId).toBe('table-1');
    });

    it('should clear selection when null is passed', () => {
      const { selectTable } = useTableStore.getState();
      
      useTableStore.setState({ selectedTableId: 'table-1' });
      selectTable(null);
      
      expect(useTableStore.getState().selectedTableId).toBeNull();
    });
  });

  describe('toggleFavorite', () => {
    it('should add table to favorites', () => {
      const { toggleFavorite } = useTableStore.getState();
      
      toggleFavorite('table-1');
      
      expect(useTableStore.getState().favoriteTables).toContain('table-1');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'favoriteTables',
        JSON.stringify(['table-1'])
      );
    });

    it('should remove table from favorites if already favorited', () => {
      const { toggleFavorite } = useTableStore.getState();
      
      useTableStore.setState({ favoriteTables: ['table-1', 'table-2'] });
      toggleFavorite('table-1');
      
      expect(useTableStore.getState().favoriteTables).toEqual(['table-2']);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'favoriteTables',
        JSON.stringify(['table-2'])
      );
    });
  });

  describe('fetchTables', () => {
    it('should fetch and set tables', async () => {
      const { fetchTables } = useTableStore.getState();
      
      await fetchTables('http://test.api');
      
      const state = useTableStore.getState();
      expect(state.tables).toHaveLength(2);
      expect(state.isLoadingTables).toBe(false);
      expect(state.tablesError).toBeNull();
      expect(state.lastUpdateTimestamp).toBeGreaterThan(0);
      expect(state.updateCount).toBe(1);
    });

    it('should handle fetch errors', async () => {
      // Mock error
      vi.mocked(LobbyService.prototype.getTables).mockRejectedValueOnce(
        new Error('Network error')
      );
      
      const { fetchTables } = useTableStore.getState();
      
      await fetchTables('http://test.api');
      
      const state = useTableStore.getState();
      expect(state.tables).toHaveLength(0);
      expect(state.isLoadingTables).toBe(false);
      expect(state.tablesError).toBe('Network error');
    });
  });

  describe('joinTable', () => {
    it('should successfully join a table', async () => {
      const { joinTable } = useTableStore.getState();
      
      const result = await joinTable('http://test.api', 'table-1', 100);
      
      expect(result).toBe(true);
      expect(useTableStore.getState().tablesError).toBeNull();
    });

    it('should handle join table errors', async () => {
      vi.mocked(LobbyService.prototype.joinTable).mockResolvedValueOnce({
        success: false,
        message: 'Insufficient funds'
      });
      
      const { joinTable } = useTableStore.getState();
      
      const result = await joinTable('http://test.api', 'table-1', 100);
      
      expect(result).toBe(false);
      expect(useTableStore.getState().tablesError).toBe('Insufficient funds');
    });
  });

  describe('joinWaitlist', () => {
    it('should join waitlist and update table', async () => {
      const { joinWaitlist, setTables } = useTableStore.getState();
      
      // Set initial tables
      const tables = mockApiTables.map(mapApiTableToUiTable);
      setTables(tables);
      
      const position = await joinWaitlist('http://test.api', 'table-1');
      
      expect(position).toBe(3);
      
      const updatedTable = useTableStore.getState().tables.find(t => t.id === 'table-1');
      expect(updatedTable?.waitlist).toBe(1);
    });
  });

  describe('updateTable', () => {
    it('should update specific table properties', () => {
      const { setTables, updateTable } = useTableStore.getState();
      
      // Set initial tables
      const tables = mockApiTables.map(mapApiTableToUiTable);
      setTables(tables);
      
      updateTable('table-1', { players: 5, avgPot: 30 });
      
      const updatedTable = useTableStore.getState().tables.find(t => t.id === 'table-1');
      expect(updatedTable?.players).toBe(5);
      expect(updatedTable?.avgPot).toBe(30);
      expect(updatedTable?.name).toBe('Beginner Table 1'); // Unchanged
    });
  });

  describe('subscriptions', () => {
    it('should notify subscribers on state changes', () => {
      const listener = vi.fn();
      
      const unsubscribe = useTableStore.subscribe(listener);
      
      useTableStore.getState().selectTable('table-1');
      
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });
  });
});