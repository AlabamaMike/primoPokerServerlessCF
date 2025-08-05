import React, { useState } from 'react';
import { useLobbyStore } from '../../stores/lobby-store';

interface QuickSeatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSeatFound: (tableId: string) => void;
  apiUrl: string;
}

interface QuickSeatPreferences {
  gameType: string;
  maxStakes: number;
  tableSize: 'any' | '6max' | '9max';
  minPlayers: number;
  maxWaitTime: number;
}

const QuickSeatModal: React.FC<QuickSeatModalProps> = ({ 
  isOpen, 
  onClose, 
  onSeatFound,
  apiUrl 
}) => {
  const { tables, joinTable, joinWaitlist } = useLobbyStore();
  const [isSearching, setIsSearching] = useState(false);
  const [preferences, setPreferences] = useState<QuickSeatPreferences>({
    gameType: 'nlhe',
    maxStakes: 10,
    tableSize: 'any',
    minPlayers: 3,
    maxWaitTime: 5
  });

  if (!isOpen) return null;

  const findBestTable = async () => {
    setIsSearching(true);

    // Filter tables based on preferences
    const eligibleTables = tables.filter(table => {
      // Game type filter
      if (preferences.gameType !== 'any' && table.gameType !== preferences.gameType) {
        return false;
      }

      // Stakes filter
      if (table.stakes.big > preferences.maxStakes) {
        return false;
      }

      // Table size filter
      if (preferences.tableSize === '6max' && table.maxPlayers !== 6) {
        return false;
      }
      if (preferences.tableSize === '9max' && table.maxPlayers !== 9) {
        return false;
      }

      // Minimum players filter
      if (table.players < preferences.minPlayers) {
        return false;
      }

      return true;
    });

    // Sort by criteria: 
    // 1. Tables with open seats (not full)
    // 2. Tables with more players (more action)
    // 3. Tables with higher average pot
    const sortedTables = eligibleTables.sort((a, b) => {
      const aHasSeats = a.players < a.maxPlayers;
      const bHasSeats = b.players < b.maxPlayers;

      if (aHasSeats && !bHasSeats) return -1;
      if (!aHasSeats && bHasSeats) return 1;

      // Both have seats or both full, sort by player count
      if (a.players !== b.players) {
        return b.players - a.players;
      }

      // Same player count, sort by average pot
      return b.avgPot - a.avgPot;
    });

    if (sortedTables.length === 0) {
      alert('No tables match your preferences. Try adjusting your filters.');
      setIsSearching(false);
      return;
    }

    const bestTable = sortedTables[0];
    const hasOpenSeat = bestTable.players < bestTable.maxPlayers;

    try {
      if (hasOpenSeat) {
        // Join directly
        const buyIn = bestTable.stakes.big * 100; // 100BB default
        const success = await joinTable(apiUrl, bestTable.id, buyIn);
        if (success) {
          onSeatFound(bestTable.id);
          onClose();
        }
      } else if (bestTable.waitlist < preferences.maxWaitTime) {
        // Join waitlist if reasonable
        const position = await joinWaitlist(apiUrl, bestTable.id);
        if (position !== null) {
          alert(`Added to waitlist for ${bestTable.name} at position ${position}`);
          onClose();
        }
      } else {
        alert('All matching tables are full with long waitlists. Try different preferences.');
      }
    } catch (error) {
      alert('Failed to join table. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-purple-500/20 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
            Quick Seat
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* Game Type */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Game Type
            </label>
            <select
              value={preferences.gameType}
              onChange={(e) => setPreferences({ ...preferences, gameType: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="any">Any Game</option>
              <option value="nlhe">No Limit Hold'em</option>
              <option value="plo">Pot Limit Omaha</option>
              <option value="plo5">5 Card PLO</option>
            </select>
          </div>

          {/* Maximum Stakes */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Maximum Big Blind: €{preferences.maxStakes}
            </label>
            <input
              type="range"
              min="0.1"
              max="50"
              step="0.1"
              value={preferences.maxStakes}
              onChange={(e) => setPreferences({ ...preferences, maxStakes: parseFloat(e.target.value) })}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>€0.10</span>
              <span>€50</span>
            </div>
          </div>

          {/* Table Size */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Table Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setPreferences({ ...preferences, tableSize: 'any' })}
                className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                  preferences.tableSize === 'any'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Any
              </button>
              <button
                onClick={() => setPreferences({ ...preferences, tableSize: '6max' })}
                className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                  preferences.tableSize === '6max'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                6-Max
              </button>
              <button
                onClick={() => setPreferences({ ...preferences, tableSize: '9max' })}
                className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                  preferences.tableSize === '9max'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                9-Max
              </button>
            </div>
          </div>

          {/* Minimum Players */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Minimum Players: {preferences.minPlayers}
            </label>
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={preferences.minPlayers}
              onChange={(e) => setPreferences({ ...preferences, minPlayers: parseInt(e.target.value) })}
              className="w-full accent-purple-500"
            />
          </div>

          {/* Max Wait Time */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Max Waitlist Size: {preferences.maxWaitTime} players
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={preferences.maxWaitTime}
              onChange={(e) => setPreferences({ ...preferences, maxWaitTime: parseInt(e.target.value) })}
              className="w-full accent-purple-500"
            />
          </div>
        </div>

        {/* Lucky Feature */}
        <div className="mb-6 p-3 bg-gradient-to-r from-purple-900/20 to-amber-900/20 rounded-lg border border-purple-500/20">
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-400">🎲 Feeling Lucky?</span>
            <span className="text-xs text-slate-400">Algorithm will favor lucky tables</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={findBestTable}
            disabled={isSearching}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? 'Finding Table...' : 'Find Best Table'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickSeatModal;