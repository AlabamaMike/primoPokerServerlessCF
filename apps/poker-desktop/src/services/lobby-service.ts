import { testSafeInvoke } from '../utils/test-utils';
import { Filters } from '../components/LobbyV2/types';

export interface LobbyTable {
  id: string;
  name: string;
  gameType: string;
  stakes: {
    smallBlind: number;
    bigBlind: number;
  };
  maxPlayers: number;
  currentPlayers: number;
  pot: number;
  status: string;
  createdAt: string;
  config?: {
    ante?: number;
    timeBank?: number;
  };
}

export interface LobbyStats {
  playersOnline: number;
  activeTables: number;
  totalPot: number;
}

export interface TableFilters {
  gameTypes?: string[];
  minStakes?: number;
  maxStakes?: number;
  tableSizes?: number[];
  hideEmpty?: boolean;
  hideFull?: boolean;
}

class LobbyService {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async getTables(filters?: TableFilters): Promise<LobbyTable[]> {
    try {
      const response = await testSafeInvoke<LobbyTable[]>('get_tables', { 
        apiUrl: this.apiUrl,
        filters 
      });
      return response || [];
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      throw error;
    }
  }

  async getTableDetails(tableId: string): Promise<LobbyTable | null> {
    try {
      const response = await testSafeInvoke<LobbyTable>('get_table_details', { 
        apiUrl: this.apiUrl,
        tableId 
      });
      return response;
    } catch (error) {
      console.error('Failed to fetch table details:', error);
      return null;
    }
  }

  async getLobbyStats(): Promise<LobbyStats> {
    try {
      const response = await testSafeInvoke<LobbyStats>('get_lobby_stats', { 
        apiUrl: this.apiUrl 
      });
      return response || {
        playersOnline: 0,
        activeTables: 0,
        totalPot: 0
      };
    } catch (error) {
      console.error('Failed to fetch lobby stats:', error);
      return {
        playersOnline: 0,
        activeTables: 0,
        totalPot: 0
      };
    }
  }

  async joinTable(tableId: string, buyIn: number): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await testSafeInvoke<{ success: boolean; message?: string }>('join_table', { 
        apiUrl: this.apiUrl,
        tableId,
        buyIn
      });
      return response || { success: false, message: 'Failed to join table' };
    } catch (error) {
      console.error('Failed to join table:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async joinWaitlist(tableId: string): Promise<{ success: boolean; position?: number }> {
    try {
      const response = await testSafeInvoke<{ success: boolean; position?: number }>('join_waitlist', { 
        apiUrl: this.apiUrl,
        tableId
      });
      return response || { success: false };
    } catch (error) {
      console.error('Failed to join waitlist:', error);
      return { success: false };
    }
  }

  async quickSeat(filters: Filters): Promise<{ success: boolean; tableId?: string; message?: string }> {
    try {
      // Find tables that match the current filters
      const tables = await this.getTables({
        gameTypes: filters.gameTypes,
        tableSizes: filters.tableSizes,
        hideEmpty: true,
        hideFull: true
      });

      // Filter by stakes
      const stakeRanges: Record<string, [number, number]> = {
        'micro': [0.01, 0.25],
        'low': [0.50, 2.00],
        'mid': [5.00, 10.00],
        'high': [25.00, Infinity]
      };

      const filteredTables = tables.filter(table => {
        const bigBlind = table.stakes.bigBlind;
        return filters.stakes.some(stake => {
          const [min, max] = stakeRanges[stake] || [0, Infinity];
          return bigBlind >= min && bigBlind <= max;
        });
      });

      // Find a table with available seats
      const availableTable = filteredTables.find(table => 
        table.currentPlayers < table.maxPlayers
      );

      if (availableTable) {
        // Attempt to join the table
        const buyIn = availableTable.stakes.bigBlind * 100; // Default 100BB buy-in
        const joinResult = await this.joinTable(availableTable.id, buyIn);
        
        if (joinResult.success) {
          return { success: true, tableId: availableTable.id };
        }
      }

      return { success: false, message: 'No available seats found matching your filters' };
    } catch (error) {
      console.error('Failed to find quick seat:', error);
      return { success: false, message: 'Failed to find seat' };
    }
  }
}

export default LobbyService;