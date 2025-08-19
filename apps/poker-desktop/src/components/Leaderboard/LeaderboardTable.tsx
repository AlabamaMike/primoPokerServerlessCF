import React, { useState, useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { PlayerStatsView, StatsPeriod } from '@primo-poker/shared';
import { clsx } from 'clsx';

interface LeaderboardTableProps {
  players: PlayerStatsView[];
  isLoading?: boolean;
  error?: string | null;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onPlayerSelect?: (playerId: string) => void;
  selectedPlayerId?: string | null;
}

export type SortColumn = 'rank' | 'username' | 'handsPlayed' | 'winnings' | 'winRate';
export type SortDirection = 'asc' | 'desc';

const ITEM_HEIGHT = 64;
const LIST_HEIGHT = 600;

const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  players,
  isLoading,
  error,
  sortColumn,
  sortDirection,
  onSort,
  onPlayerSelect,
  selectedPlayerId
}) => {
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);

  const formatCurrency = (amount: number): string => {
    const sign = amount >= 0 ? '' : '-';
    const absAmount = Math.abs(amount);
    
    if (absAmount >= 1000000) {
      return `${sign}$${(absAmount / 1000000).toFixed(2)}M`;
    } else if (absAmount >= 1000) {
      return `${sign}$${(absAmount / 1000).toFixed(1)}K`;
    }
    return `${sign}$${absAmount.toFixed(2)}`;
  };

  const formatWinRate = (winRate: number): string => {
    return `${winRate >= 0 ? '+' : ''}${winRate.toFixed(2)} BB/100`;
  };

  const formatHandsPlayed = (hands: number): string => {
    if (hands >= 1000000) {
      return `${(hands / 1000000).toFixed(1)}M`;
    } else if (hands >= 1000) {
      return `${(hands / 1000).toFixed(1)}K`;
    }
    return hands.toString();
  };

  const getRankBadge = (rank: number | undefined): React.ReactNode => {
    if (!rank) return null;
    
    if (rank === 1) {
      return <span className="text-2xl">🥇</span>;
    } else if (rank === 2) {
      return <span className="text-2xl">🥈</span>;
    } else if (rank === 3) {
      return <span className="text-2xl">🥉</span>;
    }
    
    return <span className="text-slate-400 font-semibold">#{rank}</span>;
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent, playerId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPlayerSelect?.(playerId);
    }
  }, [onPlayerSelect]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const player = players[index];
    const isSelected = selectedPlayerId === player.playerId;
    const isHovered = hoveredPlayerId === player.playerId;
    
    return (
      <div 
        style={style}
        className={clsx(
          'flex items-center px-6 py-3 border-b border-slate-700/50 cursor-pointer transition-all',
          isSelected && 'bg-purple-900/20 border-purple-500/30',
          !isSelected && isHovered && 'bg-slate-800/30'
        )}
        onClick={() => onPlayerSelect?.(player.playerId)}
        onMouseEnter={() => setHoveredPlayerId(player.playerId)}
        onMouseLeave={() => setHoveredPlayerId(null)}
        onKeyDown={(e) => handleKeyDown(e, player.playerId)}
        tabIndex={0}
        role="row"
        aria-selected={isSelected}
      >
        {/* Rank */}
        <div className="w-20 flex-shrink-0 text-center">
          {getRankBadge(player.overallRank)}
        </div>

        {/* Username */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white truncate">{player.username}</div>
          {player.achievementsCount > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">
              {player.achievementsCount} achievements
            </div>
          )}
        </div>

        {/* Hands Played */}
        <div className="w-32 text-right text-slate-300">
          {formatHandsPlayed(player.lifetimeHandsPlayed)}
        </div>

        {/* Winnings */}
        <div className={clsx(
          'w-32 text-right font-semibold',
          player.lifetimeWinnings >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {formatCurrency(player.lifetimeWinnings)}
        </div>

        {/* Win Rate */}
        <div className={clsx(
          'w-40 text-right',
          player.lifetimeWinRate >= 0 ? 'text-emerald-300' : 'text-red-300'
        )}>
          {formatWinRate(player.lifetimeWinRate)}
        </div>
      </div>
    );
  }, [players, selectedPlayerId, hoveredPlayerId, onPlayerSelect, handleKeyDown]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading leaderboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">No players found</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-6 py-4 border-b border-slate-700 bg-slate-800/50 text-sm font-medium text-slate-300">
        <div 
          className="w-20 flex-shrink-0 text-center cursor-pointer hover:text-white transition-colors"
          onClick={() => onSort('rank')}
        >
          Rank
          {sortColumn === 'rank' && (
            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
        <div 
          className="flex-1 min-w-0 cursor-pointer hover:text-white transition-colors"
          onClick={() => onSort('username')}
        >
          Player
          {sortColumn === 'username' && (
            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
        <div 
          className="w-32 text-right cursor-pointer hover:text-white transition-colors"
          onClick={() => onSort('handsPlayed')}
        >
          Hands
          {sortColumn === 'handsPlayed' && (
            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
        <div 
          className="w-32 text-right cursor-pointer hover:text-white transition-colors"
          onClick={() => onSort('winnings')}
        >
          Winnings
          {sortColumn === 'winnings' && (
            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
        <div 
          className="w-40 text-right cursor-pointer hover:text-white transition-colors"
          onClick={() => onSort('winRate')}
        >
          Win Rate
          {sortColumn === 'winRate' && (
            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
          )}
        </div>
      </div>

      {/* Body with virtualization */}
      <List
        height={LIST_HEIGHT}
        itemCount={players.length}
        itemSize={ITEM_HEIGHT}
        width="100%"
        className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
      >
        {Row}
      </List>
    </div>
  );
};

export default LeaderboardTable;