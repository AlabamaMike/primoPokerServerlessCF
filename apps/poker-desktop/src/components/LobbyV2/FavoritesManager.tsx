import React from 'react';
import { useLobbyStore } from '../../stores/lobby-store';
import { Table } from './types';

interface FavoritesManagerProps {
  apiUrl: string;
  onJoinTable: (tableId: string) => void;
}

const FavoritesManager: React.FC<FavoritesManagerProps> = ({ apiUrl, onJoinTable }) => {
  const { tables, favoriteTables, toggleFavorite } = useLobbyStore();
  
  // Get favorite tables in order
  const favoritedTables = favoriteTables
    .map(id => tables.find(t => t.id === id))
    .filter((table): table is Table => table !== undefined);

  const handleRemoveFavorite = (tableId: string) => {
    toggleFavorite(tableId);
  };

  const getGameTypeDisplay = (gameType: string): string => {
    const gameTypes: Record<string, string> = {
      'nlhe': "NL Hold'em",
      'plo': 'PLO',
      'plo5': 'PLO5',
      'shortdeck': 'Short Deck',
      'mixed': 'Mixed'
    };
    return gameTypes[gameType] || gameType;
  };

  if (favoritedTables.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6" role="region" aria-label="Favorite tables">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">Favorite Tables</h3>
        <div className="text-center py-8">
          <div className="text-6xl mb-4">⭐</div>
          <div className="text-slate-400">No favorite tables yet</div>
          <div className="text-sm text-slate-500 mt-2">Star tables to see them here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-6" role="region" aria-label="Favorite tables">
      <h3 className="text-lg font-semibold text-purple-400 mb-4 flex items-center space-x-2">
        <span>⭐</span>
        <span>Favorite Tables</span>
        <span className="text-sm text-slate-400">({favoritedTables.length})</span>
      </h3>
      
      <div className="space-y-3">
        {favoritedTables.map(table => {
          const isFull = table.players >= table.maxPlayers;
          const hasWaitlist = table.waitlist > 0;
          
          return (
            <div 
              key={table.id}
              className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 hover:border-purple-500/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 
                      className="font-medium text-purple-300"
                      data-testid="favorite-table-name"
                    >
                      {table.name}
                    </h4>
                    <span className="text-xs bg-slate-700/50 px-2 py-1 rounded">
                      {getGameTypeDisplay(table.gameType)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-slate-400 mt-1">
                    <span>{table.stakes.currency}{table.stakes.small}/{table.stakes.currency}{table.stakes.big}</span>
                    <span className={table.players >= table.maxPlayers ? 'text-red-400' : 'text-emerald-400'}>
                      {table.players}/{table.maxPlayers}
                    </span>
                    <span>Avg: {table.stakes.currency}{table.avgPot}</span>
                  </div>
                </div>
                
                <button
                  onClick={() => handleRemoveFavorite(table.id)}
                  className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                  aria-label="Remove from favorites"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                {isFull && !hasWaitlist ? (
                  <button 
                    className="px-4 py-1.5 bg-slate-600 text-slate-400 text-sm rounded-lg font-medium cursor-not-allowed"
                    disabled
                  >
                    Full
                  </button>
                ) : isFull && hasWaitlist ? (
                  <button 
                    onClick={() => onJoinTable(table.id)}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg font-medium transition-all"
                  >
                    Waitlist ({table.waitlist})
                  </button>
                ) : (
                  <button 
                    onClick={() => onJoinTable(table.id)}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-all"
                  >
                    Join
                  </button>
                )}
                
                {/* Quick stats */}
                <div className="flex items-center space-x-3 text-xs text-slate-500">
                  <span>{table.handsPerHour || 60} hands/hr</span>
                  {table.waitlist > 0 && (
                    <span className="text-amber-400">{table.waitlist} waiting</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Quick tip */}
      <div className="mt-4 text-xs text-slate-500 text-center">
        Tip: Your favorite tables are saved locally and persist between sessions
      </div>
    </div>
  );
};

export default FavoritesManager;