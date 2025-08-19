import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Leaderboard from '../Leaderboard';
import { StatsPeriod } from '@primo-poker/shared';

// Mock child components
jest.mock('../LeaderboardTable', () => ({
  __esModule: true,
  default: ({ players, onPlayerSelect, sortColumn, sortDirection, onSort }: any) => (
    <div data-testid="leaderboard-table">
      {players.map((p: any) => (
        <div key={p.playerId} onClick={() => onPlayerSelect(p.playerId)}>
          {p.username}
        </div>
      ))}
      <button onClick={() => onSort('username')}>Sort by username</button>
      <div>Sort: {sortColumn} - {sortDirection}</div>
    </div>
  )
}));

jest.mock('../PlayerStatsCard', () => ({
  __esModule: true,
  default: ({ player, onClose }: any) => (
    <div data-testid="player-stats-card">
      <div>{player.username}</div>
      <button onClick={onClose}>Close</button>
    </div>
  )
}));

jest.mock('../TimePeriodFilter', () => ({
  __esModule: true,
  default: ({ selectedPeriod, onPeriodChange }: any) => (
    <div data-testid="time-period-filter">
      <button onClick={() => onPeriodChange(StatsPeriod.DAILY)}>Daily</button>
      <button onClick={() => onPeriodChange(StatsPeriod.WEEKLY)}>Weekly</button>
      <div>Selected: {selectedPeriod}</div>
    </div>
  )
}));

jest.mock('../LeaderboardPagination', () => ({
  __esModule: true,
  default: ({ currentPage, onPageChange }: any) => (
    <div data-testid="leaderboard-pagination">
      <button onClick={() => onPageChange(2)}>Page 2</button>
      <div>Current page: {currentPage}</div>
    </div>
  )
}));

jest.mock('../LeaderboardStates', () => ({
  LeaderboardLoading: () => <div data-testid="loading-state">Loading...</div>,
  LeaderboardError: ({ error, onRetry }: any) => (
    <div data-testid="error-state">
      <div>Error: {error}</div>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
  LeaderboardEmpty: () => <div data-testid="empty-state">No players found</div>
}));

// Mock fetch
global.fetch = jest.fn();

const mockPlayersResponse = {
  players: [
    {
      playerId: '1',
      username: 'Player1',
      lifetimeHandsPlayed: 100000,
      lifetimeWinnings: 10000,
      lifetimeWinRate: 5.0,
      recentHandsPlayed: 1000,
      recentWinnings: 500,
      recentWinRate: 4.0,
      overallRank: 1,
      lastActiveAt: new Date()
    },
    {
      playerId: '2',
      username: 'Player2',
      lifetimeHandsPlayed: 80000,
      lifetimeWinnings: 8000,
      lifetimeWinRate: 4.0,
      recentHandsPlayed: 800,
      recentWinnings: 400,
      recentWinRate: 3.5,
      overallRank: 2,
      lastActiveAt: new Date()
    }
  ],
  total: 50
};

describe('Leaderboard', () => {
  const defaultProps = {
    apiUrl: 'https://api.example.com'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockPlayersResponse
    });
  });

  it('renders leaderboard header', async () => {
    render(<Leaderboard {...defaultProps} />);

    expect(screen.getByText('🏆')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });
  });

  it('fetches leaderboard data on mount', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/stats/leaderboard',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"period":"all_time"')
        })
      );
    });
  });

  it('shows loading state initially', () => {
    render(<Leaderboard {...defaultProps} />);

    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
  });

  it('shows player data after loading', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Player1')).toBeInTheDocument();
      expect(screen.getByText('Player2')).toBeInTheDocument();
    });
  });

  it('handles period filter changes', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Weekly'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://api.example.com/api/stats/leaderboard',
        expect.objectContaining({
          body: expect.stringContaining('"period":"weekly"')
        })
      );
    });
  });

  it('handles sorting changes', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sort by username'));

    expect(screen.getByText('Sort: username - desc')).toBeInTheDocument();
  });

  it('handles pagination changes', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Page 2'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://api.example.com/api/stats/leaderboard',
        expect.objectContaining({
          body: expect.stringContaining('"offset":20')
        })
      );
    });
  });

  it('shows player stats card when player is selected', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Player1'));

    expect(screen.getByTestId('player-stats-card')).toBeInTheDocument();
  });

  it('closes player stats card', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Player1'));
    expect(screen.getByTestId('player-stats-card')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('player-stats-card')).not.toBeInTheDocument();
  });

  it('handles refresh button click', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });

    const refreshButton = screen.getByLabelText('Refresh leaderboard');
    fireEvent.click(refreshButton);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shows error state on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });

  it('handles retry after error', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPlayersResponse
      });

    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Player1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no players', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ players: [], total: 0 })
    });

    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('hides pagination when only one page', async () => {
    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });

    // With 2 players and default page size of 20, should not show pagination
    expect(screen.queryByTestId('leaderboard-pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when multiple pages', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...mockPlayersResponse, total: 100 })
    });

    render(<Leaderboard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-pagination')).toBeInTheDocument();
    });
  });

  it('disables refresh button while loading', async () => {
    render(<Leaderboard {...defaultProps} />);

    const refreshButton = screen.getByLabelText('Refresh leaderboard');
    expect(refreshButton).toBeDisabled();

    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled();
    });
  });

  it('uses custom page size when provided', async () => {
    render(<Leaderboard {...defaultProps} defaultPageSize={50} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/api/stats/leaderboard',
        expect.objectContaining({
          body: expect.stringContaining('"limit":50')
        })
      );
    });
  });
});