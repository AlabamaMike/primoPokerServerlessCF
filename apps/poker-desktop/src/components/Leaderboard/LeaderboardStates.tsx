import React from 'react';

interface LeaderboardLoadingProps {
  rows?: number;
}

export const LeaderboardLoading: React.FC<LeaderboardLoadingProps> = ({ rows = 10 }) => {
  return (
    <div className="bg-slate-900/50 rounded-lg overflow-hidden">
      {/* Header skeleton */}
      <div className="flex items-center px-6 py-4 border-b border-slate-700 bg-slate-800/50">
        <div className="w-20 h-4 bg-slate-700 rounded animate-pulse"></div>
        <div className="flex-1 ml-4 h-4 bg-slate-700 rounded animate-pulse"></div>
        <div className="w-32 ml-4 h-4 bg-slate-700 rounded animate-pulse"></div>
        <div className="w-32 ml-4 h-4 bg-slate-700 rounded animate-pulse"></div>
        <div className="w-40 ml-4 h-4 bg-slate-700 rounded animate-pulse"></div>
      </div>

      {/* Body skeleton */}
      <div className="divide-y divide-slate-700/50">
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="flex items-center px-6 py-4">
            <div className="w-20 flex justify-center">
              <div className="w-8 h-8 bg-slate-700 rounded animate-pulse"></div>
            </div>
            <div className="flex-1 ml-4">
              <div className="w-32 h-5 bg-slate-700 rounded animate-pulse mb-1"></div>
              <div className="w-24 h-3 bg-slate-700 rounded animate-pulse"></div>
            </div>
            <div className="w-32 flex justify-end">
              <div className="w-20 h-5 bg-slate-700 rounded animate-pulse"></div>
            </div>
            <div className="w-32 flex justify-end ml-4">
              <div className="w-24 h-5 bg-slate-700 rounded animate-pulse"></div>
            </div>
            <div className="w-40 flex justify-end ml-4">
              <div className="w-28 h-5 bg-slate-700 rounded animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface LeaderboardErrorProps {
  error: string;
  onRetry?: () => void;
}

export const LeaderboardError: React.FC<LeaderboardErrorProps> = ({ error, onRetry }) => {
  return (
    <div className="bg-slate-900/50 rounded-lg p-12">
      <div className="flex flex-col items-center text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <h3 className="text-xl font-semibold text-white mb-2">Unable to Load Leaderboard</h3>
        <p className="text-slate-400 mb-6 max-w-md">
          {error || 'An unexpected error occurred while loading the leaderboard. Please try again.'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export const LeaderboardEmpty: React.FC = () => {
  return (
    <div className="bg-slate-900/50 rounded-lg p-12">
      <div className="flex flex-col items-center text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold text-white mb-2">No Players Found</h3>
        <p className="text-slate-400 max-w-md">
          There are no players to display for the selected time period. Try changing the filter or check back later.
        </p>
      </div>
    </div>
  );
};