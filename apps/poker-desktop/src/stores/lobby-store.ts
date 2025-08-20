import { create } from 'zustand';
import { Table, Filters, StakeLevel } from '../components/LobbyV2/types';
import LobbyService, { LobbyTable, LobbyStats } from '../services/lobby-service';
import { useTableStore } from './table-store';
import { useFilterStore } from './filter-store';
import { useUIStore } from './ui-store';
import { createFilteredTablesSelector, selectSelectedTable } from '../selectors/table-selectors';

interface LobbyState {
  // Tables
  tables: Table[];
  isLoadingTables: boolean;
  tablesError: string | null;
  
  // Selected table
  selectedTableId: string | null;
  selectedTable: Table | null;
  
  // Filters
  filters: Filters;
  
  // Stats
  stats: LobbyStats;
  
  // Favorites
  favoriteTables: string[];
  favoriteTableIds: Set<string>;
  
  // Performance tracking
  lastUpdateTimestamp: number;
  updateCount: number;
  
  // Actions
  setFilters: (filters: Filters) => void;
  selectTable: (tableId: string | null) => void;
  toggleFavorite: (tableId: string) => void;
  fetchTables: (apiUrl: string) => Promise<void>;
  fetchStats: (apiUrl: string) => Promise<void>;
  joinTable: (apiUrl: string, tableId: string, buyIn: number) => Promise<boolean>;
  joinWaitlist: (apiUrl: string, tableId: string) => Promise<number | null>;
}

// Helper function to map API table to UI table
const mapApiTableToUiTable = (apiTable: LobbyTable): Table => {
  const bigBlind = apiTable.stakes.bigBlind;
  const avgPot = apiTable.pot || bigBlind * 20; // Estimate if not provided
  
  // Determine features based on table properties
  const features: any[] = [];
  if (apiTable.name.toLowerCase().includes('beginner')) features.push('beginner');
  if (apiTable.name.toLowerCase().includes('speed') || apiTable.name.toLowerCase().includes('fast')) features.push('speed');
  if (apiTable.config?.ante) features.push('ante');
  
  // Estimate speed based on name or default
  let speed: 'slow' | 'normal' | 'fast' = 'normal';
  if (apiTable.name.toLowerCase().includes('speed') || apiTable.name.toLowerCase().includes('fast')) {
    speed = 'fast';
  } else if (apiTable.name.toLowerCase().includes('beginner')) {
    speed = 'slow';
  }

  return {
    id: apiTable.id,
    name: apiTable.name,
    gameType: apiTable.gameType as any || 'nlhe',
    stakes: {
      small: apiTable.stakes.smallBlind,
      big: apiTable.stakes.bigBlind,
      currency: '€'
    },
    players: apiTable.currentPlayers || 0,
    maxPlayers: apiTable.maxPlayers,
    avgPot,
    speed,
    waitlist: 0, // Will be updated from WebSocket
    features,
    playersPerFlop: Math.floor(Math.random() * 40 + 30), // Mock for now
    handsPerHour: speed === 'fast' ? 90 : speed === 'slow' ? 45 : 60
  };
};

// Helper to determine stake level
const getStakeLevel = (bigBlind: number): StakeLevel => {
  if (bigBlind <= 0.25) return 'micro';
  if (bigBlind <= 2) return 'low';
  if (bigBlind <= 10) return 'mid';
  return 'high';
};

// Create a filtered tables selector instance
const filteredTablesSelector = createFilteredTablesSelector();

// Helper function to get combined state from all stores
const getCombinedState = (): LobbyState => {
  const tableState = useTableStore.getState();
  const filterState = useFilterStore.getState();
  const uiState = useUIStore.getState();
  
  // Use selector to get filtered tables
  const filteredTables = filteredTablesSelector({ ...tableState, ...filterState });
  const selectedTable = selectSelectedTable(tableState);
  
  return {
    // Tables from table store with filtering applied
    tables: filteredTables,
    isLoadingTables: tableState.isLoadingTables,
    tablesError: tableState.tablesError,
    selectedTableId: tableState.selectedTableId,
    selectedTable,
    
    // Filters from filter store
    filters: filterState.filters,
    
    // Stats from UI store
    stats: uiState.stats,
    
    // Favorites from table store
    favoriteTables: tableState.favoriteTables,
    favoriteTableIds: new Set(tableState.favoriteTables),
    
    // Performance tracking from table store
    lastUpdateTimestamp: tableState.lastUpdateTimestamp,
    updateCount: tableState.updateCount,
    
    // Actions will be delegated to respective stores
    setFilters: () => {},
    selectTable: () => {},
    toggleFavorite: () => {},
    fetchTables: async () => {},
    fetchStats: async () => {},
    joinTable: async () => false,
    joinWaitlist: async () => null
  };
};

export const useLobbyStore = create<LobbyState>((set, get) => {
  // Subscribe to changes in the underlying stores
  useTableStore.subscribe(() => {
    set(getCombinedState());
  });
  
  useFilterStore.subscribe(() => {
    set(getCombinedState());
  });
  
  useUIStore.subscribe(
    (state) => state.stats,
    () => {
      set(getCombinedState());
    }
  );
  
  return {
    ...getCombinedState(),

  // Actions - delegate to respective stores
  setFilters: (filters) => {
    useFilterStore.getState().setFilters(filters);
    // Update local state to reflect changes
    set(getCombinedState());
  },

  selectTable: (tableId) => {
    useTableStore.getState().selectTable(tableId);
    // Update local state to reflect changes
    set(getCombinedState());
  },

  toggleFavorite: (tableId) => {
    useTableStore.getState().toggleFavorite(tableId);
    // Update local state to reflect changes
    set(getCombinedState());
  },

  fetchTables: async (apiUrl) => {
    await useTableStore.getState().fetchTables(apiUrl);
    // Update local state to reflect changes
    set(getCombinedState());
  },

  fetchStats: async (apiUrl) => {
    try {
      const service = new LobbyService(apiUrl);
      const stats = await service.getLobbyStats();
      useUIStore.getState().updateStats(stats);
      // Update local state to reflect changes
      set(getCombinedState());
    } catch (error) {
      console.error('Failed to fetch lobby stats:', error);
    }
  },

  joinTable: async (apiUrl, tableId, buyIn) => {
    const result = await useTableStore.getState().joinTable(apiUrl, tableId, buyIn);
    // Update local state to reflect changes
    set(getCombinedState());
    return result;
  },

  joinWaitlist: async (apiUrl, tableId) => {
    const result = await useTableStore.getState().joinWaitlist(apiUrl, tableId);
    // Update local state to reflect changes
    set(getCombinedState());
    return result;
  }
  };
});