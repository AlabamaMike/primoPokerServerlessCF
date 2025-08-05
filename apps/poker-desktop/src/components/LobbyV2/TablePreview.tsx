import React, { useState } from 'react';
import { Table } from './types';
import { useLobbyStore } from '../../stores/lobby-store';

interface TablePreviewProps {
  table: Table | null;
  onJoinTable?: (tableId: string) => void;
}

const TablePreview: React.FC<TablePreviewProps> = ({ table, onJoinTable }) => {
  const { favoriteTables, toggleFavorite } = useLobbyStore();
  const isFavorite = table ? favoriteTables.includes(table.id) : false;

  if (!table) {
    return (
      <div className="w-80 bg-slate-800/50 backdrop-blur border-l border-slate-700/50 p-4 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="text-6xl mb-4">🃏</div>
          <div className="text-lg font-medium mb-2">Select a Table</div>
          <div className="text-sm">Click on any table to preview details</div>
        </div>
      </div>
    );
  }

  const isFull = table.players >= table.maxPlayers;
  const hasWaitlist = table.waitlist > 0;

  const handleJoin = () => {
    if (onJoinTable) {
      onJoinTable(table.id);
    }
  };

  return (
    <div className="w-80 bg-slate-800/50 backdrop-blur border-l border-slate-700/50 p-4">
      <h3 className="text-lg font-semibold mb-4 bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
        {table.name}
      </h3>
      
      {/* Mini Table Visualization */}
      <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
        <div className="relative w-full h-48">
          {/* Table Felt */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-900/40 to-green-800/40 rounded-full"></div>
          <div className="absolute inset-2 border-2 border-amber-500/30 rounded-full"></div>
          
          {/* Pot Display */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Current Pot</div>
            <div className="text-2xl font-bold text-amber-400">
              {table.stakes.currency}{table.avgPot}
            </div>
            {table.rakebackPercent && (
              <div className="text-xs text-emerald-400 mt-1">
                +{table.rakebackPercent}% rake back
              </div>
            )}
          </div>
          
          {/* Sample Seats - simplified visualization */}
          <div className="absolute inset-0">
            {/* Top seats */}
            <div className="absolute top-2 left-1/2 transform -translate-x-1/2">
              <SeatDisplay occupied={table.players > 0} />
            </div>
            
            {/* Side seats */}
            <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
              <SeatDisplay occupied={table.players > 1} />
            </div>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <SeatDisplay occupied={table.players > 2} />
            </div>
            
            {/* Bottom seats */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
              <SeatDisplay occupied={false} isHero />
            </div>
          </div>
        </div>
      </div>

      {/* Table Info */}
      <div className="space-y-3 mb-4">
        <InfoRow label="Game" value={getGameTypeDisplay(table.gameType)} />
        <InfoRow label="Stakes" value={`${table.stakes.currency}${table.stakes.small}/${table.stakes.currency}${table.stakes.big}`} />
        <InfoRow label="Buy-in" value={`${table.stakes.currency}${table.stakes.big * 50} - ${table.stakes.currency}${table.stakes.big * 200}`} />
        <InfoRow label="Players" value={`${table.players}/${table.maxPlayers}`} />
        <InfoRow label="Avg Pot" value={`${table.stakes.currency}${table.avgPot}`} />
        <InfoRow label="Speed" value={`${table.handsPerHour || '~60'} hands/hr`} />
        {table.playersPerFlop && (
          <InfoRow label="Players/Flop" value={`${table.playersPerFlop}%`} />
        )}
        {table.rakebackPercent && (
          <InfoRow 
            label="Bonus" 
            value={`${table.rakebackPercent}% Rake Back`} 
            highlight 
          />
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {isFull && !hasWaitlist ? (
          <button 
            className="w-full py-3 bg-slate-600 text-slate-400 rounded-lg font-semibold cursor-not-allowed"
            disabled
          >
            Table Full
          </button>
        ) : isFull && hasWaitlist ? (
          <button 
            onClick={handleJoin}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold transition-all transform hover:scale-105"
          >
            Join Waitlist ({table.waitlist} waiting)
          </button>
        ) : (
          <button 
            onClick={handleJoin}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/30"
          >
            Join Table
          </button>
        )}
        
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => toggleFavorite(table.id)}
            className={`py-2 rounded-lg text-sm transition-colors ${
              isFavorite 
                ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                : 'bg-slate-700 hover:bg-slate-600 text-white'
            }`}
          >
            {isFavorite ? '⭐ Favorited' : '☆ Add to Favorites'}
          </button>
          <button className="py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
            Table Stats
          </button>
        </div>
      </div>
      
      {/* Lucky Number Display */}
      <div className="mt-4 p-3 bg-gradient-to-r from-purple-900/20 to-amber-900/20 rounded-lg border border-purple-500/20">
        <div className="text-xs text-slate-400 mb-1">Today's Lucky Numbers</div>
        <div className="flex space-x-2">
          <span className="text-lg font-bold text-amber-400">8</span>
          <span className="text-lg font-bold text-purple-400">8</span>
          <span className="text-lg font-bold text-emerald-400">8</span>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const SeatDisplay: React.FC<{ occupied: boolean; isHero?: boolean }> = ({ occupied, isHero }) => {
  if (isHero) {
    return (
      <div className="bg-gradient-to-r from-purple-800 to-purple-700 px-3 py-2 rounded-lg border border-purple-600">
        <div className="text-xs font-medium">You</div>
        <div className="text-amber-400 text-sm">-</div>
      </div>
    );
  }

  if (!occupied) {
    return (
      <div className="bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700 border-dashed">
        <div className="text-xs text-slate-400">Empty</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
      <div className="text-xs font-medium">Player</div>
      <div className="text-amber-400 text-sm">€***</div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ 
  label, 
  value, 
  highlight 
}) => (
  <div className={`flex items-center justify-between p-2 rounded-lg ${
    highlight 
      ? 'bg-amber-500/10 border border-amber-500/20' 
      : 'bg-slate-900/50'
  }`}>
    <span className={`text-sm ${highlight ? 'text-amber-400' : 'text-slate-400'}`}>
      {label}
    </span>
    <span className={`text-sm font-medium ${highlight ? 'text-amber-400' : ''}`}>
      {value}
    </span>
  </div>
);

const getGameTypeDisplay = (gameType: string): string => {
  const gameTypes: Record<string, string> = {
    'nlhe': 'No Limit Hold\'em',
    'plo': 'Pot Limit Omaha',
    'plo5': '5 Card PLO',
    'shortdeck': 'Short Deck Hold\'em',
    'mixed': 'Mixed Games'
  };
  return gameTypes[gameType] || gameType;
};

export default TablePreview;