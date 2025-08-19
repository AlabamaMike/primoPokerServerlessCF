import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { PlayerStatsView, StatsPeriod, StatsQuery } from '@primo-poker/shared';
import LeaderboardTable, { SortColumn, SortDirection } from './LeaderboardTable';
import PlayerStatsCard from './PlayerStatsCard';
import TimePeriodFilter from './TimePeriodFilter';
import LeaderboardPagination from './LeaderboardPagination';
import { LeaderboardLoading, LeaderboardError, LeaderboardEmpty } from './LeaderboardStates';

interface LeaderboardProps {
  apiUrl: string;
  defaultPageSize?: number;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ 
  apiUrl,
  defaultPageSize = 20 
}) => {
  // State
  const [players, setPlayers] = useState<PlayerStatsView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>(StatsPeriod.ALL_TIME);
  const [sortColumn, setSortColumn] = useState<SortColumn>('winnings');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Calculate pagination
  const totalPages = Math.ceil(totalItems / defaultPageSize);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const query: StatsQuery = {
        period: selectedPeriod,
        limit: defaultPageSize,
        offset: (currentPage - 1) * defaultPageSize,
        sortBy: sortColumn === 'handsPlayed' ? 'handsPlayed' : 
                sortColumn === 'winRate' ? 'winRate' : 'winnings',
        sortOrder: sortDirection
      };

      const response = await fetch(`${apiUrl}/api/stats/leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }

      const data = await response.json();
      setPlayers(data.players || []);
      setTotalItems(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, selectedPeriod, currentPage, defaultPageSize, sortColumn, sortDirection]);

  // Sort and filter players locally for better UX
  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortColumn) {
        case 'rank':
          compareValue = (a.overallRank || Infinity) - (b.overallRank || Infinity);
          break;
        case 'username':
          compareValue = a.username.localeCompare(b.username);
          break;
        case 'handsPlayed':
          compareValue = a.lifetimeHandsPlayed - b.lifetimeHandsPlayed;
          break;
        case 'winnings':
          compareValue = a.lifetimeWinnings - b.lifetimeWinnings;
          break;
        case 'winRate':
          compareValue = a.lifetimeWinRate - b.lifetimeWinRate;
          break;
      }
      
      return sortDirection === 'asc' ? compareValue : -compareValue;
    });

    return sorted;
  }, [players, sortColumn, sortDirection]);

  // Handlers
  const handleSort = useCallback((column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Reset to first page on sort
  }, [sortColumn]);

  const handlePeriodChange = useCallback((period: StatsPeriod) => {
    setSelectedPeriod(period);
    setCurrentPage(1); // Reset to first page on filter change
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePlayerSelect = useCallback((playerId: string) => {
    setSelectedPlayerId(playerId);
  }, []);

  const handleClosePlayerCard = useCallback(() => {
    setSelectedPlayerId(null);
  }, []);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Find selected player data
  const selectedPlayer = useMemo(() => {
    return players.find(p => p.playerId === selectedPlayerId);
  }, [players, selectedPlayerId]);

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">🏆</span>
            Leaderboard
          </h1>
          <button
            onClick={fetchLeaderboard}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Refresh leaderboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Time Period Filter */}
        <TimePeriodFilter
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          disabled={isLoading}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <LeaderboardLoading />
          </div>
        ) : error ? (
          <div className="p-6">
            <LeaderboardError error={error} onRetry={fetchLeaderboard} />
          </div>
        ) : sortedPlayers.length === 0 ? (
          <div className="p-6">
            <LeaderboardEmpty />
          </div>
        ) : (
          <>
            <LeaderboardTable
              players={sortedPlayers}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onPlayerSelect={handlePlayerSelect}
              selectedPlayerId={selectedPlayerId}
            />
          </>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !error && sortedPlayers.length > 0 && totalPages > 1 && (
        <div className="border-t border-slate-700">
          <LeaderboardPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={defaultPageSize}
            onPageChange={handlePageChange}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Player Stats Card Modal */}
      {selectedPlayer && (
        <PlayerStatsCard
          player={selectedPlayer}
          onClose={handleClosePlayerCard}
        />
      )}
    </div>
  );
};

export default Leaderboard;