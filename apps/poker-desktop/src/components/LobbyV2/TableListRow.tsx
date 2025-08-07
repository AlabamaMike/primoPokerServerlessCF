import React, { useState } from 'react';
import { Table } from './types';
import { useLobbyStore } from '../../stores/lobby-store';

interface TableListRowProps {
  table: Table;
  isSelected: boolean;
  onSelect: () => void;
  apiUrl?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const TableListRow: React.FC<TableListRowProps> = ({ 
  table, 
  isSelected, 
  onSelect,
  apiUrl = '',
  isFavorite = false,
  onToggleFavorite
}) => {
  const { joinTable, joinWaitlist } = useLobbyStore();
  const [isJoining, setIsJoining] = useState(false);
  const isFull = table.players >= table.maxPlayers;
  const hasWaitlist = table.waitlist > 0;
  
  const getGameTypeDisplay = (gameType: string): string => {
    const gameTypes: Record<string, string> = {
      'nlhe': 'NL Hold\'em',
      'plo': 'PLO',
      'plo5': 'PLO5',
      'shortdeck': 'Short Deck',
      'mixed': 'Mixed'
    };
    return gameTypes[gameType] || gameType;
  };

  const getTableIcon = () => {
    if (table.features.includes('featured')) return '🏆';
    if (table.features.includes('lucky8')) return '🎰';
    if (table.features.includes('speed')) return '⚡';
    if (table.features.includes('beginner')) return '🌱';
    return '♠';
  };

  const getSpeedDisplay = (speed: string) => {
    return speed.charAt(0).toUpperCase() + speed.slice(1);
  };

  const rowClassName = `
    grid grid-cols-12 gap-2 px-4 py-3 text-sm border-b border-slate-700/50 
    cursor-pointer transition-all
    ${isSelected ? 'bg-slate-800/50 border-purple-500/30' : 'hover:bg-slate-800/30'}
    ${table.features.includes('featured') ? 'bg-gradient-to-r from-purple-900/10 to-amber-900/10' : ''}
  `;

  return (
    <div className={rowClassName} onClick={onSelect} data-testid={`table-row-${table.id}`}>
      {/* Table Name */}
      <div className="col-span-3 font-medium flex items-center space-x-2">
        <span className={table.features.includes('featured') ? 'text-amber-400' : 'text-purple-400'}>
          {getTableIcon()}
        </span>
        <span>{table.name}</span>
        {table.features.includes('featured') && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
            Featured
          </span>
        )}
        {table.rakebackPercent && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
            {table.rakebackPercent}% RB
          </span>
        )}
      </div>

      {/* Game Type */}
      <div className="col-span-2 text-slate-300">
        {getGameTypeDisplay(table.gameType)}
      </div>

      {/* Stakes */}
      <div className="col-span-1 text-slate-300">
        {table.stakes.currency}{table.stakes.small}/{table.stakes.currency}{table.stakes.big}
      </div>

      {/* Players */}
      <div className="col-span-1">
        <div className="flex items-center space-x-1">
          <div className="flex space-x-0.5">
            {[...Array(table.maxPlayers)].map((_, i) => (
              <div 
                key={i} 
                className={`w-1.5 h-3 rounded-sm transition-colors ${
                  i < table.players ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-400">
            {table.players}/{table.maxPlayers}
          </span>
        </div>
      </div>

      {/* Average Pot */}
      <div className="col-span-1 text-right text-slate-300">
        {table.stakes.currency}{table.avgPot}
      </div>

      {/* Speed */}
      <div className="col-span-1 text-right text-slate-300">
        {getSpeedDisplay(table.speed)}
      </div>

      {/* Waitlist */}
      <div className={`col-span-1 text-center ${hasWaitlist ? 'text-amber-400' : 'text-slate-300'}`}>
        {table.waitlist}
      </div>

      {/* Actions */}
      <div className="col-span-2 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
        {isFull && !hasWaitlist ? (
          <button 
            className="px-3 py-1.5 bg-slate-600 text-slate-400 text-xs rounded-lg font-medium cursor-not-allowed"
            disabled
          >
            FULL
          </button>
        ) : isFull && hasWaitlist ? (
          <button 
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg font-medium transition-all transform hover:scale-105"
            onClick={async () => {
              setIsJoining(true);
              const position = await joinWaitlist(apiUrl, table.id);
              setIsJoining(false);
              if (position !== null) {
                // Show waitlist position feedback
                console.log(`Added to waitlist at position ${position}`);
              }
            }}
            disabled={isJoining}
          >
            {isJoining ? 'JOINING...' : 'WAITLIST'}
          </button>
        ) : (
          <button 
            className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-xs rounded-lg font-medium transition-all transform hover:scale-105 shadow-lg shadow-purple-500/20"
            onClick={async () => {
              setIsJoining(true);
              const buyIn = table.stakes.big * 100; // Default 100BB buy-in
              const success = await joinTable(apiUrl, table.id, buyIn);
              setIsJoining(false);
              if (success) {
                // Table join will be handled by parent component
                console.log('Successfully joined table');
              }
            }}
            disabled={isJoining}
          >
            {isJoining ? 'JOINING...' : 'JOIN'}
          </button>
        )}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite?.();
          }}
          className={`p-1.5 transition-colors ${
            isFavorite ? 'text-amber-400' : 'text-slate-400 hover:text-amber-400'
          }`}
          data-testid={`favorite-button-${table.id}`}
        >
          {isFavorite ? <span data-testid="favorite-star">⭐</span> : '☆'}
        </button>
      </div>
    </div>
  );
};

export default TableListRow;