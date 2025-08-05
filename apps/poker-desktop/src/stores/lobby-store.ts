import { create } from 'zustand';
import { Table, Filters, StakeLevel } from '../components/LobbyV2/types';
import LobbyService, { LobbyTable, LobbyStats } from '../services/lobby-service';

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

export const useLobbyStore = create<LobbyState>((set, get) => ({
  // Initial state
  tables: [],
  isLoadingTables: false,
  tablesError: null,
  selectedTableId: null,
  selectedTable: null,
  filters: {
    gameTypes: ['nlhe'],
    stakes: ['micro', 'low'],
    tableSizes: [6, 9],
    features: []
  },
  stats: {
    playersOnline: 0,
    activeTables: 0,
    totalPot: 0
  },
  favoriteTables: JSON.parse(localStorage.getItem('favoriteTables') || '[]'),

  // Actions
  setFilters: (filters) => {
    set({ filters });
    // Trigger table refresh when filters change
    const state = get();
    if (state.tables.length > 0) {
      // Re-filter existing tables locally for immediate feedback
      // Real filtering will happen on next API call
    }
  },

  selectTable: (tableId) => {
    const table = tableId ? get().tables.find(t => t.id === tableId) : null;
    set({ 
      selectedTableId: tableId,
      selectedTable: table || null
    });
  },

  toggleFavorite: (tableId) => {
    const favorites = get().favoriteTables;
    const newFavorites = favorites.includes(tableId)
      ? favorites.filter(id => id !== tableId)
      : [...favorites, tableId];
    
    set({ favoriteTables: newFavorites });
    localStorage.setItem('favoriteTables', JSON.stringify(newFavorites));
  },

  fetchTables: async (apiUrl) => {
    set({ isLoadingTables: true, tablesError: null });
    
    try {
      const service = new LobbyService(apiUrl);
      const apiTables = await service.getTables();
      
      // Map API tables to UI format
      const tables = apiTables.map(mapApiTableToUiTable);
      
      // Apply client-side filtering based on current filters
      const { filters } = get();
      const filteredTables = tables.filter(table => {
        // Game type filter
        if (filters.gameTypes.length > 0 && !filters.gameTypes.includes(table.gameType)) {
          return false;
        }
        
        // Stakes filter
        const stakeLevel = getStakeLevel(table.stakes.big);
        if (filters.stakes.length > 0 && !filters.stakes.includes(stakeLevel)) {
          return false;
        }
        
        // Table size filter
        if (filters.tableSizes.length > 0 && !filters.tableSizes.includes(table.maxPlayers)) {
          return false;
        }
        
        // Feature filter
        if (filters.features.length > 0) {
          const hasRequiredFeature = filters.features.some(feature => 
            table.features.includes(feature)
          );
          if (!hasRequiredFeature) return false;
        }
        
        return true;
      });
      
      set({ 
        tables: filteredTables,
        isLoadingTables: false 
      });
      
      // Update selected table if it exists in new data
      const { selectedTableId } = get();
      if (selectedTableId) {
        const updatedTable = filteredTables.find(t => t.id === selectedTableId);
        if (updatedTable) {
          set({ selectedTable: updatedTable });
        }
      }
    } catch (error) {
      set({ 
        tablesError: error instanceof Error ? error.message : 'Failed to load tables',
        isLoadingTables: false 
      });
    }
  },

  fetchStats: async (apiUrl) => {
    try {
      const service = new LobbyService(apiUrl);
      const stats = await service.getLobbyStats();
      set({ stats });
    } catch (error) {
      console.error('Failed to fetch lobby stats:', error);
    }
  },

  joinTable: async (apiUrl, tableId, buyIn) => {
    try {
      const service = new LobbyService(apiUrl);
      const result = await service.joinTable(tableId, buyIn);
      
      if (!result.success && result.message) {
        set({ tablesError: result.message });
      }
      
      return result.success;
    } catch (error) {
      set({ tablesError: 'Failed to join table' });
      return false;
    }
  },

  joinWaitlist: async (apiUrl, tableId) => {
    try {
      const service = new LobbyService(apiUrl);
      const result = await service.joinWaitlist(tableId);
      
      if (result.success && result.position !== undefined) {
        // Update table waitlist count locally
        set(state => ({
          tables: state.tables.map(table => 
            table.id === tableId 
              ? { ...table, waitlist: table.waitlist + 1 }
              : table
          )
        }));
        return result.position;
      }
      
      return null;
    } catch (error) {
      set({ tablesError: 'Failed to join waitlist' });
      return null;
    }
  }
}));