import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFilterStore } from '../filter-store';
import { Filters } from '../../components/LobbyV2/types';

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

const defaultFilters: Filters = {
  gameTypes: ['nlhe'],
  stakes: ['micro', 'low'],
  tableSizes: [6, 9],
  features: []
};

describe('FilterStore', () => {
  beforeEach(() => {
    // Reset store state
    useFilterStore.setState({
      filters: defaultFilters
    });
    
    // Reset localStorage mock
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
  });

  describe('setFilters', () => {
    it('should set all filters at once', () => {
      const newFilters: Filters = {
        gameTypes: ['plo', 'nlhe'],
        stakes: ['high'],
        tableSizes: [2],
        features: ['speed', 'rakeback']
      };
      
      useFilterStore.getState().setFilters(newFilters);
      
      expect(useFilterStore.getState().filters).toEqual(newFilters);
    });
  });

  describe('updateGameTypes', () => {
    it('should update game types', () => {
      useFilterStore.getState().updateGameTypes(['plo', 'plo5']);
      
      expect(useFilterStore.getState().filters.gameTypes).toEqual(['plo', 'plo5']);
    });

    it('should handle empty game types', () => {
      useFilterStore.getState().updateGameTypes([]);
      
      expect(useFilterStore.getState().filters.gameTypes).toEqual([]);
    });
  });

  describe('updateStakes', () => {
    it('should update stakes', () => {
      useFilterStore.getState().updateStakes(['mid', 'high']);
      
      expect(useFilterStore.getState().filters.stakes).toEqual(['mid', 'high']);
    });
  });

  describe('updateTableSizes', () => {
    it('should update table sizes', () => {
      useFilterStore.getState().updateTableSizes([2, 6]);
      
      expect(useFilterStore.getState().filters.tableSizes).toEqual([2, 6]);
    });
  });

  describe('updateFeatures', () => {
    it('should update features', () => {
      useFilterStore.getState().updateFeatures(['speed', 'beginner']);
      
      expect(useFilterStore.getState().filters.features).toEqual(['speed', 'beginner']);
    });

    it('should handle empty features', () => {
      useFilterStore.setState({
        filters: { ...defaultFilters, features: ['speed'] }
      });
      
      useFilterStore.getState().updateFeatures([]);
      
      expect(useFilterStore.getState().filters.features).toEqual([]);
    });
  });

  describe('resetFilters', () => {
    it('should reset to default filters', () => {
      // Set custom filters first
      useFilterStore.getState().setFilters({
        gameTypes: ['plo'],
        stakes: ['high'],
        tableSizes: [2],
        features: ['speed']
      });
      
      // Reset
      useFilterStore.getState().resetFilters();
      
      expect(useFilterStore.getState().filters).toEqual(defaultFilters);
    });
  });

  describe('persistence', () => {
    it('should persist filters to localStorage', () => {
      const newFilters: Filters = {
        gameTypes: ['plo'],
        stakes: ['high'],
        tableSizes: [2],
        features: ['speed']
      };
      
      useFilterStore.getState().setFilters(newFilters);
      
      // Persistence middleware should save to localStorage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'lobby-filters',
        expect.stringContaining('"gameTypes":["plo"]')
      );
    });

    it('should load filters from localStorage on initialization', () => {
      const savedFilters = {
        filters: {
          gameTypes: ['plo', 'nlhe'],
          stakes: ['mid'],
          tableSizes: [6],
          features: ['rakeback']
        }
      };
      
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedFilters));
      
      // Reinitialize store
      useFilterStore.persist.rehydrate();
      
      expect(useFilterStore.getState().filters).toEqual(savedFilters.filters);
    });
  });

  describe('subscriptions', () => {
    it('should notify subscribers on filter changes', () => {
      const listener = vi.fn();
      
      const unsubscribe = useFilterStore.subscribe(listener);
      
      useFilterStore.getState().updateGameTypes(['plo']);
      
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });
  });
});