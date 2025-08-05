import React, { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';

type GameType = 'cash' | 'tournament' | 'sitgo' | 'speed';

interface LobbyHeaderProps {
  onQuickSeat?: () => void;
}

const LobbyHeader: React.FC<LobbyHeaderProps> = ({ onQuickSeat }) => {
  const [selectedGameType, setSelectedGameType] = useState<GameType>('cash');
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuthStore();
  
  // Mock balance for now - will be fetched from API
  const balance = 1888.88;

  return (
    <div className="bg-gradient-to-b from-slate-800 to-slate-900 border-b border-purple-500/30 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          {/* Logo Area */}
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="text-xl font-semibold bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
              Primo Poker
            </span>
          </div>
          
          {/* Game Type Tabs */}
          <div className="flex space-x-1">
            <button
              onClick={() => setSelectedGameType('cash')}
              className={`px-4 py-2 rounded-t font-semibold transition-all ${
                selectedGameType === 'cash'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              Cash Games
            </button>
            <button
              onClick={() => setSelectedGameType('sitgo')}
              className={`px-4 py-2 rounded-t font-semibold transition-all ${
                selectedGameType === 'sitgo'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              Sit & Go
            </button>
            <button
              onClick={() => setSelectedGameType('tournament')}
              className={`px-4 py-2 rounded-t font-semibold transition-all ${
                selectedGameType === 'tournament'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              Tournaments
            </button>
            <button
              onClick={() => setSelectedGameType('speed')}
              className={`px-4 py-2 rounded-t font-semibold transition-all ${
                selectedGameType === 'speed'
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="flex items-center space-x-1">
                <span>Speed Poker</span>
                <span className="text-amber-400">⚡</span>
              </span>
            </button>
          </div>
          
          {/* Quick Filters */}
          <div className="flex items-center space-x-3 text-sm">
            <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-purple-500 transition-colors focus:outline-none">
              <option>All Stakes</option>
              <option>Micro (€0.01-€0.25)</option>
              <option>Low (€0.50-€2)</option>
              <option>Mid (€5-€10)</option>
              <option>High (€25+)</option>
            </select>
            <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 focus:border-purple-500 transition-colors focus:outline-none">
              <option>All Tables</option>
              <option>2 Players</option>
              <option>6 Players</option>
              <option>9 Players</option>
            </select>
          </div>
        </div>
        
        {/* Account Info */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onQuickSeat}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-amber-500/20 flex items-center space-x-1"
          >
            <span>⚡</span>
            <span>Quick Seat</span>
          </button>
          <input 
            type="text" 
            placeholder="Search tables..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm w-48 focus:border-purple-500 focus:outline-none transition-colors placeholder-slate-500"
          />
          <div className="text-sm">
            <div className="text-slate-400">Balance</div>
            <div className="font-semibold text-amber-400">€{balance.toFixed(2)}</div>
          </div>
          <div className="text-sm">
            <div className="text-slate-400">Player</div>
            <div className="font-semibold flex items-center space-x-1">
              <span>{user?.username || user?.email || 'Guest'}</span>
              <span className="text-amber-400">⭐</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyHeader;