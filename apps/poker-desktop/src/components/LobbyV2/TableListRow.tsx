import React, { useRef, useEffect } from 'react';
import { Table } from './types';
import { useLobbyStore } from '../../stores/lobby-store';
import { useAsync, useIntersectionObserver } from '../../hooks/common';
import { AsyncButton } from '../shared';

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
  const [rowRef, isVisible] = useIntersectionObserver({ 
    freezeOnceVisible: true,
    rootMargin: '50px',
    threshold: 0.01
  });
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
    <div ref={rowRef as React.RefObject<HTMLDivElement>} className={rowClassName} onClick={onSelect} data-testid={`table-row-${table.id}`}>
      {/* Table Name */}
      {isVisible ? (
        <>
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
          <AsyncButton
            size="sm"
            variant="secondary"
            className="bg-amber-600 hover:bg-amber-500"
            onClick={async () => {
              const position = await joinWaitlist(apiUrl, table.id);
              if (position !== null) {
                // Show waitlist position feedback
                console.log(`Added to waitlist at position ${position}`);
              }
            }}
            loadingText="JOINING..."
          >
            WAITLIST
          </AsyncButton>
        ) : (
          <AsyncButton
            size="sm"
            onClick={async () => {
              const buyIn = table.stakes.big * 100; // Default 100BB buy-in
              const success = await joinTable(apiUrl, table.id, buyIn);
              if (success) {
                // Table join will be handled by parent component
                console.log('Successfully joined table');
              }
            }}
            loadingText="JOINING..."
            className="shadow-lg shadow-purple-500/20"
          >
            JOIN
          </AsyncButton>
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
        </>
      ) : (
        // Placeholder for lazy loading
        <div className="col-span-12 h-full bg-slate-800/20 animate-pulse rounded" />
      )}
    </div>
  );
};

export default React.memo(TableListRow, (prevProps, nextProps) => {
  return (
    prevProps.table.id === nextProps.table.id &&
    prevProps.table.players === nextProps.table.players &&
    prevProps.table.waitlist === nextProps.table.waitlist &&
    prevProps.table.avgPot === nextProps.table.avgPot &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFavorite === nextProps.isFavorite
  );
});