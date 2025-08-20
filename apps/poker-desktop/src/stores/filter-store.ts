import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { Filters, GameType, StakeLevel, TableFeature } from '../components/LobbyV2/types';
import { logger } from './middleware/logger';

export interface FilterState {
  filters: Filters;
  
  // Actions
  setFilters: (filters: Filters) => void;
  updateGameTypes: (gameTypes: GameType[]) => void;
  updateStakes: (stakes: StakeLevel[]) => void;
  updateTableSizes: (tableSizes: number[]) => void;
  updateFeatures: (features: TableFeature[]) => void;
  resetFilters: () => void;
}

const defaultFilters: Filters = {
  gameTypes: ['nlhe'],
  stakes: ['micro', 'low'],
  tableSizes: [6, 9],
  features: []
};

export const useFilterStore = create<FilterState>()(
  logger(
    devtools(
      persist(
        (set) => ({
      filters: defaultFilters,

      setFilters: (filters) => {
        set({ filters });
      },

      updateGameTypes: (gameTypes) => {
        set((state) => ({
          filters: {
            ...state.filters,
            gameTypes
          }
        }));
      },

      updateStakes: (stakes) => {
        set((state) => ({
          filters: {
            ...state.filters,
            stakes
          }
        }));
      },

      updateTableSizes: (tableSizes) => {
        set((state) => ({
          filters: {
            ...state.filters,
            tableSizes
          }
        }));
      },

      updateFeatures: (features) => {
        set((state) => ({
          filters: {
            ...state.filters,
            features
          }
        }));
      },

      resetFilters: () => {
        set({ filters: defaultFilters });
      }
    }),
    {
      name: 'lobby-filters', // unique name for localStorage key
      partialize: (state) => ({ filters: state.filters }) // only persist filters
    }
      ),
      { name: 'filter-store' }
    ),
    'FilterStore'
  )
);