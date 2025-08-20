import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { Table } from '../components/LobbyV2/types';
import LobbyService, { LobbyTable } from '../services/lobby-service';
import { logger } from './middleware/logger';

export interface TableState {
  // Tables data
  tables: Table[];
  isLoadingTables: boolean;
  tablesError: string | null;
  
  // Selected table
  selectedTableId: string | null;
  
  // Favorites
  favoriteTables: string[];
  
  // Performance tracking
  lastUpdateTimestamp: number;
  updateCount: number;
  
  // Actions
  selectTable: (tableId: string | null) => void;
  toggleFavorite: (tableId: string) => void;
  fetchTables: (apiUrl: string) => Promise<void>;
  joinTable: (apiUrl: string, tableId: string, buyIn: number) => Promise<boolean>;
  joinWaitlist: (apiUrl: string, tableId: string) => Promise<number | null>;
  updateTable: (tableId: string, updates: Partial<Table>) => void;
  setTables: (tables: Table[]) => void;
}

// Helper function to map API table to UI table
export const mapApiTableToUiTable = (apiTable: LobbyTable): Table => {
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

export const useTableStore = create<TableState>()(
  logger(
    devtools(
      subscribeWithSelector((set, get) => ({
    // Initial state
    tables: [],
    isLoadingTables: false,
    tablesError: null,
    selectedTableId: null,
    favoriteTables: JSON.parse(localStorage.getItem('favoriteTables') || '[]'),
    lastUpdateTimestamp: 0,
    updateCount: 0,

    // Actions
    selectTable: (tableId) => {
      set({ selectedTableId: tableId });
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
        
        set({ 
          tables,
          isLoadingTables: false,
          lastUpdateTimestamp: Date.now(),
          updateCount: get().updateCount + 1
        });
      } catch (error) {
        set({ 
          tablesError: error instanceof Error ? error.message : 'Failed to load tables',
          isLoadingTables: false 
        });
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
    },

    updateTable: (tableId, updates) => {
      set(state => ({
        tables: state.tables.map(table =>
          table.id === tableId ? { ...table, ...updates } : table
        )
      }));
    },

    setTables: (tables) => {
      set({ tables });
    }
  })),
      { name: 'table-store' }
    ),
    'TableStore'
  )
);