import React from 'react';
import { PlayerStatistics, PlayerStatsView } from '@primo-poker/shared';
import { clsx } from 'clsx';

interface PlayerStatsCardProps {
  player: PlayerStatsView;
  detailedStats?: PlayerStatistics;
  isLoading?: boolean;
  onClose?: () => void;
}

const PlayerStatsCard: React.FC<PlayerStatsCardProps> = ({
  player,
  detailedStats,
  isLoading,
  onClose
}) => {
  const formatCurrency = (amount: number): string => {
    const sign = amount >= 0 ? '' : '-';
    const absAmount = Math.abs(amount);
    return `${sign}$${absAmount.toFixed(2)}`;
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(1)}%`;
  };

  const formatWinRate = (winRate: number): string => {
    return `${winRate >= 0 ? '+' : ''}${winRate.toFixed(2)} BB/100`;
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getRankDisplay = (rank: number | undefined): React.ReactNode => {
    if (!rank) return <span className="text-slate-400">Unranked</span>;
    
    if (rank === 1) return <span className="text-3xl">🥇</span>;
    if (rank === 2) return <span className="text-3xl">🥈</span>;
    if (rank === 3) return <span className="text-3xl">🥉</span>;
    
    return <span className="text-2xl font-bold text-purple-400">#{rank}</span>;
  };

  const StatItem: React.FC<{
    label: string;
    value: string | number;
    positive?: boolean;
    negative?: boolean;
    className?: string;
  }> = ({ label, value, positive, negative, className }) => (
    <div className={clsx('p-4 rounded-lg bg-slate-800/50', className)}>
      <div className="text-sm text-slate-400 mb-1">{label}</div>
      <div className={clsx(
        'text-lg font-semibold',
        positive && 'text-emerald-400',
        negative && 'text-red-400',
        !positive && !negative && 'text-white'
      )}>
        {value}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-slate-900 rounded-xl p-8 max-w-2xl w-full mx-4 animate-pulse">
          <div className="h-8 bg-slate-700 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-2 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-900 rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div>{getRankDisplay(player.overallRank)}</div>
            <div>
              <h2 className="text-2xl font-bold text-white">{player.username}</h2>
              <div className="text-sm text-slate-400 mt-1">
                Last active: {formatDate(player.lastActiveAt)}
              </div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-slate-800/50 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Overall Rank</div>
            <div className="text-xl font-bold text-purple-400">
              {player.overallRank ? `#${player.overallRank}` : 'N/A'}
            </div>
          </div>
          <div className="text-center p-4 bg-slate-800/50 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Profit Rank</div>
            <div className="text-xl font-bold text-emerald-400">
              {player.profitRank ? `#${player.profitRank}` : 'N/A'}
            </div>
          </div>
          <div className="text-center p-4 bg-slate-800/50 rounded-lg">
            <div className="text-sm text-slate-400 mb-1">Volume Rank</div>
            <div className="text-xl font-bold text-blue-400">
              {player.volumeRank ? `#${player.volumeRank}` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Lifetime Stats */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Lifetime Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatItem
              label="Total Hands"
              value={player.lifetimeHandsPlayed.toLocaleString()}
            />
            <StatItem
              label="Total Winnings"
              value={formatCurrency(player.lifetimeWinnings)}
              positive={player.lifetimeWinnings > 0}
              negative={player.lifetimeWinnings < 0}
            />
            <StatItem
              label="Win Rate"
              value={formatWinRate(player.lifetimeWinRate)}
              positive={player.lifetimeWinRate > 0}
              negative={player.lifetimeWinRate < 0}
            />
          </div>
        </div>

        {/* Recent Stats */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Last 30 Days</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatItem
              label="Recent Hands"
              value={player.recentHandsPlayed.toLocaleString()}
            />
            <StatItem
              label="Recent Winnings"
              value={formatCurrency(player.recentWinnings)}
              positive={player.recentWinnings > 0}
              negative={player.recentWinnings < 0}
            />
            <StatItem
              label="Recent Win Rate"
              value={formatWinRate(player.recentWinRate)}
              positive={player.recentWinRate > 0}
              negative={player.recentWinRate < 0}
            />
          </div>
        </div>

        {/* Detailed Stats if available */}
        {detailedStats && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Playing Style</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatItem
                label="VPIP"
                value={formatPercentage(detailedStats.vpip)}
                className="bg-blue-900/20"
              />
              <StatItem
                label="PFR"
                value={formatPercentage(detailedStats.pfr)}
                className="bg-blue-900/20"
              />
              <StatItem
                label="3-Bet"
                value={formatPercentage(detailedStats.threeBet)}
                className="bg-blue-900/20"
              />
              <StatItem
                label="AF"
                value={detailedStats.aggressionFactor.toFixed(2)}
                className="bg-blue-900/20"
              />
              <StatItem
                label="WTSD"
                value={formatPercentage(detailedStats.wtsd)}
                className="bg-purple-900/20"
              />
              <StatItem
                label="WSD"
                value={formatPercentage(detailedStats.wsd)}
                className="bg-purple-900/20"
              />
              <StatItem
                label="C-Bet"
                value={formatPercentage(detailedStats.cBet)}
                className="bg-purple-900/20"
              />
              <StatItem
                label="Fold to C-Bet"
                value={formatPercentage(detailedStats.foldToCBet)}
                className="bg-purple-900/20"
              />
            </div>
          </div>
        )}

        {/* Achievements */}
        {player.achievementsCount > 0 && (
          <div className="mt-6 p-4 bg-amber-900/20 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              <div>
                <div className="text-amber-400 font-semibold">
                  {player.achievementsCount} Achievements Unlocked
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  View achievements in your profile
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerStatsCard;