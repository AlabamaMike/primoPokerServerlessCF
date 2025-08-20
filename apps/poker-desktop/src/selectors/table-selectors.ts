import { TableState } from '../stores/table-store';
import { FilterState } from '../stores/filter-store';
import { Table, StakeLevel } from '../components/LobbyV2/types';

// Helper to determine stake level
export const getStakeLevel = (bigBlind: number): StakeLevel => {
  if (bigBlind <= 0.25) return 'micro';
  if (bigBlind <= 2) return 'low';
  if (bigBlind <= 10) return 'mid';
  return 'high';
};

// Basic selectors
export const selectTables = (state: TableState) => state.tables;
export const selectSelectedTableId = (state: TableState) => state.selectedTableId;
export const selectFavoriteTables = (state: TableState) => state.favoriteTables;
export const selectIsLoadingTables = (state: TableState) => state.isLoadingTables;
export const selectTablesError = (state: TableState) => state.tablesError;

// Memoized selector for selected table
export const selectSelectedTable = (state: TableState) => {
  const tables = selectTables(state);
  const selectedTableId = selectSelectedTableId(state);
  if (!selectedTableId) return null;
  return tables.find(t => t.id === selectedTableId) || null;
};

// Memoized selector for favorite table IDs set
export const selectFavoriteTableIds = (state: TableState) => {
  const favoriteTables = selectFavoriteTables(state);
  return new Set(favoriteTables);
};

// Memoized selector for filtered tables
export const createFilteredTablesSelector = () => {
  // Cache for memoization
  let lastTables: Table[] = [];
  let lastFilters: any = null;
  let lastResult: Table[] = [];
  
  return (state: TableState & FilterState) => {
    const tables = selectTables(state);
    const filters = state.filters;
    
    // Check if inputs have changed
    if (tables === lastTables && JSON.stringify(filters) === JSON.stringify(lastFilters)) {
      return lastResult;
    }
    
    // Update cache
    lastTables = tables;
    lastFilters = filters;
    
    // Compute new result
    lastResult = tables.filter(table => {
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
    
    return lastResult;
  };
};

// Memoized selector for tables by stake level
export const selectTablesByStakeLevel = (() => {
  let lastTables: Table[] = [];
  let lastResult: Record<StakeLevel, Table[]> | null = null;
  
  return (state: TableState) => {
    const tables = selectTables(state);
    
    if (tables === lastTables && lastResult) {
      return lastResult;
    }
    
    lastTables = tables;
    lastResult = {
      micro: [],
      low: [],
      mid: [],
      high: []
    };

    tables.forEach(table => {
      const stakeLevel = getStakeLevel(table.stakes.big);
      lastResult![stakeLevel].push(table);
    });

    return lastResult;
  };
})();

// Memoized selector for tables with open seats
export const selectTablesWithOpenSeats = (() => {
  let lastTables: Table[] = [];
  let lastResult: Table[] = [];
  
  return (state: TableState) => {
    const tables = selectTables(state);
    
    if (tables === lastTables) {
      return lastResult;
    }
    
    lastTables = tables;
    lastResult = tables.filter(table => table.players < table.maxPlayers);
    return lastResult;
  };
})();

// Memoized selector for tables statistics
export const selectTablesStatistics = (() => {
  let lastTables: Table[] = [];
  let lastResult: any = null;
  
  return (state: TableState) => {
    const tables = selectTables(state);
    
    if (tables === lastTables && lastResult) {
      return lastResult;
    }
    
    lastTables = tables;
    
    const totalPlayers = tables.reduce((sum, table) => sum + table.players, 0);
    const totalSeats = tables.reduce((sum, table) => sum + table.maxPlayers, 0);
    const occupancyRate = totalSeats > 0 ? (totalPlayers / totalSeats) * 100 : 0;
    const avgPlayersPerTable = tables.length > 0 ? totalPlayers / tables.length : 0;
    const tablesWithWaitlist = tables.filter(t => t.waitlist > 0).length;

    lastResult = {
      totalTables: tables.length,
      totalPlayers,
      totalSeats,
      occupancyRate,
      avgPlayersPerTable,
      tablesWithWaitlist
    };
    
    return lastResult;
  };
})();

// Memoized selector for quick seat suggestions
export const selectQuickSeatSuggestions = (() => {
  let lastTablesWithSeats: Table[] = [];
  let lastFilters: any = null;
  let lastResult: Table[] = [];
  
  return (state: TableState & FilterState) => {
    const tablesWithSeats = selectTablesWithOpenSeats(state);
    const filters = state.filters;
    
    if (tablesWithSeats === lastTablesWithSeats && JSON.stringify(filters) === JSON.stringify(lastFilters)) {
      return lastResult;
    }
    
    lastTablesWithSeats = tablesWithSeats;
    lastFilters = filters;
    
    // Filter tables based on current filters
    const filteredTables = tablesWithSeats.filter(table => {
      const stakeLevel = getStakeLevel(table.stakes.big);
      return (
        filters.gameTypes.includes(table.gameType) &&
        filters.stakes.includes(stakeLevel) &&
        filters.tableSizes.includes(table.maxPlayers)
      );
    });

    // Sort by player count (fuller tables first) and take top 3
    lastResult = filteredTables
      .sort((a, b) => {
        const fillRateA = a.players / a.maxPlayers;
        const fillRateB = b.players / b.maxPlayers;
        return fillRateB - fillRateA;
      })
      .slice(0, 3);
      
    return lastResult;
  };
})();