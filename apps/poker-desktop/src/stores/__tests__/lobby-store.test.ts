import { act, renderHook } from '@testing-library/react';
import { useLobbyStore } from '../lobby-store';
import { testSafeInvoke } from '../../utils/test-utils';

// Mock the test-utils
jest.mock('../../utils/test-utils', () => ({
  testSafeInvoke: jest.fn()
}));

const mockTestSafeInvoke = testSafeInvoke as jest.MockedFunction<typeof testSafeInvoke>;

describe('LobbyStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useLobbyStore.setState({
      tables: [],
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      filters: {
        gameType: 'all',
        stakes: 'all',
        speed: 'all',
        tableSize: 'all',
        features: []
      },
      stats: {
        playersOnline: 0,
        activeTables: 0,
        totalPot: 0
      },
      favoriteTables: []
    });
    
    // Clear mocks
    jest.clearAllMocks();
    
    // Clear localStorage
    localStorage.clear();
  });

  describe('Table Management', () => {
    it('should fetch tables successfully', async () => {
      const mockTables = [
        {
          id: 'table-1',
          name: 'Test Table',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 1, big: 2 },
          players: 5,
          maxPlayers: 6,
          avgPot: 100,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 60,
          playersPerFlop: 40,
          rakebackPercent: 10,
          features: []
        }
      ];
      
      mockTestSafeInvoke.mockResolvedValueOnce(mockTables);

      const { result } = renderHook(() => useLobbyStore());

      await act(async () => {
        await result.current.fetchTables('test-api');
      });

      expect(result.current.tables).toEqual(mockTables);
      expect(result.current.isLoadingTables).toBe(false);
      expect(result.current.tablesError).toBeNull();
    });

    it('should handle fetch tables error', async () => {
      mockTestSafeInvoke.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useLobbyStore());

      await act(async () => {
        await result.current.fetchTables('test-api');
      });

      expect(result.current.tables).toEqual([]);
      expect(result.current.isLoadingTables).toBe(false);
      expect(result.current.tablesError).toBe('Failed to fetch tables');
    });

    it('should select and deselect tables', () => {
      const { result } = renderHook(() => useLobbyStore());
      
      // Add a table first
      act(() => {
        useLobbyStore.setState({
          tables: [{
            id: 'table-1',
            name: 'Test Table',
            gameType: 'nlhe',
            stakes: { currency: '€', small: 1, big: 2 },
            players: 5,
            maxPlayers: 6,
            avgPot: 100,
            waitlist: 0,
            speed: 'normal',
            handsPerHour: 60,
            playersPerFlop: 40,
            rakebackPercent: 10,
            features: []
          }]
        });
      });

      act(() => {
        result.current.selectTable('table-1');
      });

      expect(result.current.selectedTableId).toBe('table-1');
      expect(result.current.selectedTable).toBeDefined();
      expect(result.current.selectedTable?.id).toBe('table-1');

      act(() => {
        result.current.selectTable(null);
      });

      expect(result.current.selectedTableId).toBeNull();
      expect(result.current.selectedTable).toBeNull();
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      // Set up test tables
      act(() => {
        useLobbyStore.setState({
          tables: [
            {
              id: 'table-1',
              name: 'NLHE Table',
              gameType: 'nlhe',
              stakes: { currency: '€', small: 1, big: 2 },
              players: 5,
              maxPlayers: 6,
              avgPot: 100,
              waitlist: 0,
              speed: 'normal',
              handsPerHour: 60,
              playersPerFlop: 40,
              rakebackPercent: 10,
              features: []
            },
            {
              id: 'table-2',
              name: 'PLO Table',
              gameType: 'plo',
              stakes: { currency: '€', small: 2, big: 4 },
              players: 6,
              maxPlayers: 6,
              avgPot: 200,
              waitlist: 2,
              speed: 'turbo',
              handsPerHour: 90,
              playersPerFlop: 60,
              rakebackPercent: 0,
              features: ['turbo']
            },
            {
              id: 'table-3',
              name: 'Micro NLHE',
              gameType: 'nlhe',
              stakes: { currency: '€', small: 0.05, big: 0.10 },
              players: 8,
              maxPlayers: 9,
              avgPot: 5,
              waitlist: 0,
              speed: 'normal',
              handsPerHour: 55,
              playersPerFlop: 50,
              rakebackPercent: 15,
              features: ['beginner']
            }
          ]
        });
      });
    });

    it('should filter by game type', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.setFilters({ ...result.current.filters, gameType: 'nlhe' });
      });

      expect(result.current.filteredTables).toHaveLength(2);
      expect(result.current.filteredTables.every(t => t.gameType === 'nlhe')).toBe(true);
    });

    it('should filter by stakes', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.setFilters({ ...result.current.filters, stakes: 'micro' });
      });

      expect(result.current.filteredTables).toHaveLength(1);
      expect(result.current.filteredTables[0].stakes.big).toBe(0.10);
    });

    it('should filter by speed', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.setFilters({ ...result.current.filters, speed: 'turbo' });
      });

      expect(result.current.filteredTables).toHaveLength(1);
      expect(result.current.filteredTables[0].speed).toBe('turbo');
    });

    it('should filter by table size', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.setFilters({ ...result.current.filters, tableSize: '6max' });
      });

      expect(result.current.filteredTables).toHaveLength(2);
      expect(result.current.filteredTables.every(t => t.maxPlayers === 6)).toBe(true);
    });

    it('should apply multiple filters', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.setFilters({
          gameType: 'nlhe',
          stakes: 'low',
          speed: 'all',
          tableSize: 'all',
          features: []
        });
      });

      expect(result.current.filteredTables).toHaveLength(1);
      expect(result.current.filteredTables[0].id).toBe('table-1');
    });
  });

  describe('Favorites', () => {
    it('should toggle favorites and persist to localStorage', () => {
      const { result } = renderHook(() => useLobbyStore());

      act(() => {
        result.current.toggleFavorite('table-1');
      });

      expect(result.current.favoriteTables).toContain('table-1');
      expect(localStorage.getItem('primo-poker-favorites')).toBe('["table-1"]');

      act(() => {
        result.current.toggleFavorite('table-1');
      });

      expect(result.current.favoriteTables).not.toContain('table-1');
      expect(localStorage.getItem('primo-poker-favorites')).toBe('[]');
    });

    it('should load favorites from localStorage on init', () => {
      localStorage.setItem('primo-poker-favorites', '["table-1","table-2"]');
      
      const { result } = renderHook(() => useLobbyStore());

      expect(result.current.favoriteTables).toEqual(['table-1', 'table-2']);
    });
  });

  describe('Stats', () => {
    it('should fetch stats successfully', async () => {
      const mockStats = {
        playersOnline: 1000,
        activeTables: 50,
        totalPot: 50000
      };
      
      mockTestSafeInvoke.mockResolvedValueOnce(mockStats);

      const { result } = renderHook(() => useLobbyStore());

      await act(async () => {
        await result.current.fetchStats('test-api');
      });

      expect(result.current.stats).toEqual(mockStats);
    });
  });

  describe('Table Actions', () => {
    it('should join table successfully', async () => {
      mockTestSafeInvoke.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useLobbyStore());

      await act(async () => {
        const success = await result.current.joinTable('test-api', 'table-1', 100);
        expect(success).toBe(true);
      });

      expect(mockTestSafeInvoke).toHaveBeenCalledWith('join_table', {
        apiUrl: 'test-api',
        tableId: 'table-1',
        buyIn: 100
      });
    });

    it('should join waitlist successfully', async () => {
      mockTestSafeInvoke.mockResolvedValueOnce({ success: true, position: 3 });

      const { result } = renderHook(() => useLobbyStore());

      await act(async () => {
        const position = await result.current.joinWaitlist('test-api', 'table-1');
        expect(position).toBe(3);
      });

      expect(mockTestSafeInvoke).toHaveBeenCalledWith('join_waitlist', {
        apiUrl: 'test-api',
        tableId: 'table-1'
      });
    });
  });
});