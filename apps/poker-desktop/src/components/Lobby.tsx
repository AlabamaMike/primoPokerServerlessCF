import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useAuthStore } from '../stores/auth-store';

interface Table {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  gamePhase: string;
  pot: number;
  blinds: {
    small: number;
    big: number;
  };
  config?: {
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
  };
}

interface LobbyProps {
  apiUrl: string;
  onJoinTable?: (tableId: string) => void;
}

export default function Lobby({ apiUrl, onJoinTable }: LobbyProps) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTableConfig, setNewTableConfig] = useState({
    name: '',
    smallBlind: 25,
    bigBlind: 50,
    maxPlayers: 9,
  });
  
  const { user } = useAuthStore();

  useEffect(() => {
    fetchTables();
    const interval = setInterval(fetchTables, 5000);
    return () => clearInterval(interval);
  }, [apiUrl]);

  async function fetchTables() {
    try {
      const result = await invoke<Table[]>('get_tables', { apiUrl });
      setTables(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tables:', err);
      setError('Failed to load tables');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTable(e: React.FormEvent) {
    e.preventDefault();
    
    if (!newTableConfig.name.trim()) {
      setError('Please enter a table name');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const config = {
        name: newTableConfig.name,
        gameType: 'texas_holdem',
        bettingStructure: 'no_limit',
        gameFormat: 'cash',
        maxPlayers: newTableConfig.maxPlayers,
        minBuyIn: newTableConfig.bigBlind * 50,
        maxBuyIn: newTableConfig.bigBlind * 200,
        smallBlind: newTableConfig.smallBlind,
        bigBlind: newTableConfig.bigBlind,
        ante: 0,
        timeBank: 30,
        isPrivate: false,
      };

      const newTable = await invoke<Table>('create_table', { apiUrl, config });
      
      // Refresh tables list
      await fetchTables();
      
      // Reset form and close
      setNewTableConfig({
        name: '',
        smallBlind: 25,
        bigBlind: 50,
        maxPlayers: 9,
      });
      setShowCreateForm(false);
      
      // Auto-join the created table
      if (onJoinTable) {
        onJoinTable(newTable.id);
      }
    } catch (err) {
      console.error('Failed to create table:', err);
      setError(err instanceof Error ? err.message : 'Failed to create table');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleJoinTable(tableId: string) {
    setSelectedTable(tableId);
    setError(null);

    try {
      const table = tables.find(t => t.id === tableId);
      if (!table) return;

      const buyIn = (table.blinds.big || table.config?.bigBlind || 50) * 100;
      await invoke('join_table', { apiUrl, tableId, buyIn });
      
      if (onJoinTable) {
        onJoinTable(tableId);
      }
    } catch (err) {
      console.error('Failed to join table:', err);
      setError(err instanceof Error ? err.message : 'Failed to join table');
      setSelectedTable(null);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        <p className="text-gray-400 mt-2">Loading tables...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="lobby">
      {/* Header */}
      <div className="bg-black/50 border border-gray-600 rounded p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Multiplayer Lobby</h2>
            <p className="text-gray-400">Join a table or create your own</p>
          </div>
          
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold transition-colors"
            data-testid="create-table-button"
          >
            Create Table
          </button>
        </div>

        {/* Create Table Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateTable} className="mt-4 space-y-4 border-t border-gray-600 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-300 mb-1 text-sm">Table Name</label>
                <input
                  type="text"
                  value={newTableConfig.name}
                  onChange={(e) => setNewTableConfig({...newTableConfig, name: e.target.value})}
                  placeholder={`${user?.name || 'Your'}'s Table`}
                  className="w-full px-3 py-2 bg-black/50 border border-gray-600 rounded text-white focus:outline-none focus:border-green-500"
                  data-testid="table-name-input"
                  required
                />
              </div>
              
              <div>
                <label className="block text-gray-300 mb-1 text-sm">Blinds</label>
                <select
                  value={`${newTableConfig.smallBlind}/${newTableConfig.bigBlind}`}
                  onChange={(e) => {
                    const [small, big] = e.target.value.split('/').map(Number);
                    setNewTableConfig({...newTableConfig, smallBlind: small, bigBlind: big});
                  }}
                  className="w-full px-3 py-2 bg-black/50 border border-gray-600 rounded text-white focus:outline-none focus:border-green-500"
                  data-testid="blinds-select"
                >
                  <option value="5/10">$5/$10</option>
                  <option value="25/50">$25/$50</option>
                  <option value="100/200">$100/$200</option>
                  <option value="500/1000">$500/$1000</option>
                </select>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded font-semibold transition-colors"
                data-testid="confirm-create-button"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-400 p-3 rounded">
          {error}
        </div>
      )}

      {/* Tables List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Available Tables</h3>
        
        {tables.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>No tables available. Create one to start playing!</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="tables-list">
            {tables.map((table) => {
              const playerCount = table.playerCount || 0;
              const maxPlayers = table.config?.maxPlayers || table.maxPlayers || 9;
              const smallBlind = table.config?.smallBlind || table.blinds?.small || 5;
              const bigBlind = table.config?.bigBlind || table.blinds?.big || 10;
              const isFull = playerCount >= maxPlayers;
              
              return (
                <div
                  key={table.id}
                  className="bg-black/50 border border-gray-600 rounded p-4 hover:border-gray-500 transition-colors"
                  data-testid={`table-${table.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-1">
                        <h4 className="text-white font-semibold">{table.name}</h4>
                        <span className="text-gray-400 text-sm">
                          {playerCount}/{maxPlayers} players
                        </span>
                        <span className="text-gray-400 text-sm">
                          ${smallBlind}/${bigBlind}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          table.gamePhase === 'waiting' ? 'bg-gray-600' :
                          table.gamePhase === 'finished' ? 'bg-red-600' :
                          'bg-blue-600'
                        }`}>
                          {table.gamePhase}
                        </span>
                      </div>
                      
                      {table.pot > 0 && (
                        <div className="text-sm text-gray-400">
                          Pot: ${table.pot.toLocaleString()}
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={() => handleJoinTable(table.id)}
                      disabled={selectedTable === table.id || isFull}
                      className={`px-4 py-2 rounded font-semibold transition-colors ${
                        selectedTable === table.id ? 'bg-gray-600 text-gray-400' :
                        isFull ? 'bg-gray-700 text-gray-500' :
                        'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      data-testid={`join-table-${table.id}`}
                    >
                      {selectedTable === table.id ? 'Joining...' : 
                       isFull ? 'Full' : 'Join'}
                    </button>
                  </div>
                  
                  {/* Player indicators */}
                  <div className="flex items-center gap-1 mt-2">
                    {Array(maxPlayers).fill(0).map((_, index) => (
                      <div
                        key={index}
                        className={`w-2 h-2 rounded-full ${
                          index < playerCount ? 'bg-green-400' : 'bg-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}