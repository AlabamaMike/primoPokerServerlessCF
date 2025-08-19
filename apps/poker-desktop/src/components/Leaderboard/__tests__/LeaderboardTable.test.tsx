import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeaderboardTable from '../LeaderboardTable';
import { PlayerStatsView } from '@primo-poker/shared';

// Mock react-window
jest.mock('react-window', () => ({
  FixedSizeList: ({ children, itemCount, itemSize }: any) => (
    <div data-testid="virtual-list">
      {Array.from({ length: itemCount }).map((_, index) => (
        <div key={index} style={{ height: itemSize }}>
          {children({ index, style: {} })}
        </div>
      ))}
    </div>
  ),
}));

const mockPlayers: PlayerStatsView[] = [
  {
    playerId: '1',
    username: 'PokerPro123',
    lifetimeHandsPlayed: 150000,
    lifetimeWinnings: 25000,
    lifetimeWinRate: 5.2,
    recentHandsPlayed: 5000,
    recentWinnings: 2000,
    recentWinRate: 6.1,
    overallRank: 1,
    profitRank: 1,
    volumeRank: 3,
    achievementsCount: 12,
    lastActiveAt: new Date('2025-08-18')
  },
  {
    playerId: '2',
    username: 'FishCatcher99',
    lifetimeHandsPlayed: 100000,
    lifetimeWinnings: -5000,
    lifetimeWinRate: -2.1,
    recentHandsPlayed: 2000,
    recentWinnings: -500,
    recentWinRate: -3.5,
    overallRank: 25,
    profitRank: 150,
    volumeRank: 10,
    achievementsCount: 3,
    lastActiveAt: new Date('2025-08-17')
  },
  {
    playerId: '3',
    username: 'LuckyAce',
    lifetimeHandsPlayed: 75000,
    lifetimeWinnings: 15000,
    lifetimeWinRate: 4.5,
    recentHandsPlayed: 3000,
    recentWinnings: 1500,
    recentWinRate: 5.0,
    overallRank: 5,
    profitRank: 3,
    volumeRank: 15,
    achievementsCount: 8,
    lastActiveAt: new Date('2025-08-18')
  }
];

describe('LeaderboardTable', () => {
  const defaultProps = {
    players: mockPlayers,
    sortColumn: 'winnings' as const,
    sortDirection: 'desc' as const,
    onSort: jest.fn(),
    onPlayerSelect: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the leaderboard table with player data', () => {
    render(<LeaderboardTable {...defaultProps} />);

    expect(screen.getByText('PokerPro123')).toBeInTheDocument();
    expect(screen.getByText('FishCatcher99')).toBeInTheDocument();
    expect(screen.getByText('LuckyAce')).toBeInTheDocument();
  });

  it('displays rank badges correctly', () => {
    render(<LeaderboardTable {...defaultProps} />);

    expect(screen.getByText('🥇')).toBeInTheDocument(); // Gold medal for rank 1
    expect(screen.getByText('#25')).toBeInTheDocument(); // Regular rank display
    expect(screen.getByText('#5')).toBeInTheDocument();
  });

  it('formats currency values correctly', () => {
    render(<LeaderboardTable {...defaultProps} />);

    expect(screen.getByText('$25.00K')).toBeInTheDocument();
    expect(screen.getByText('-$5.00K')).toBeInTheDocument();
    expect(screen.getByText('$15.00K')).toBeInTheDocument();
  });

  it('formats win rates correctly', () => {
    render(<LeaderboardTable {...defaultProps} />);

    expect(screen.getByText('+5.20 BB/100')).toBeInTheDocument();
    expect(screen.getByText('-2.10 BB/100')).toBeInTheDocument();
    expect(screen.getByText('+4.50 BB/100')).toBeInTheDocument();
  });

  it('calls onSort when clicking column headers', () => {
    render(<LeaderboardTable {...defaultProps} />);

    fireEvent.click(screen.getByText('Player'));
    expect(defaultProps.onSort).toHaveBeenCalledWith('username');

    fireEvent.click(screen.getByText('Hands'));
    expect(defaultProps.onSort).toHaveBeenCalledWith('handsPlayed');

    fireEvent.click(screen.getByText('Win Rate'));
    expect(defaultProps.onSort).toHaveBeenCalledWith('winRate');
  });

  it('shows sort indicator on active column', () => {
    render(<LeaderboardTable {...defaultProps} />);

    const winningsHeader = screen.getByText('Winnings').parentElement;
    expect(winningsHeader).toHaveTextContent('↓'); // desc indicator
  });

  it('calls onPlayerSelect when clicking a row', () => {
    render(<LeaderboardTable {...defaultProps} />);

    const firstRow = screen.getByText('PokerPro123').closest('[role="row"]')!;
    fireEvent.click(firstRow);

    expect(defaultProps.onPlayerSelect).toHaveBeenCalledWith('1');
  });

  it('handles keyboard navigation correctly', () => {
    render(<LeaderboardTable {...defaultProps} />);

    const firstRow = screen.getByText('PokerPro123').closest('[role="row"]')!;
    
    fireEvent.keyDown(firstRow, { key: 'Enter' });
    expect(defaultProps.onPlayerSelect).toHaveBeenCalledWith('1');

    fireEvent.keyDown(firstRow, { key: ' ' });
    expect(defaultProps.onPlayerSelect).toHaveBeenCalledTimes(2);
  });

  it('highlights selected player', () => {
    render(<LeaderboardTable {...defaultProps} selectedPlayerId="2" />);

    const selectedRow = screen.getByText('FishCatcher99').closest('[role="row"]')!;
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');
    expect(selectedRow).toHaveClass('bg-purple-900/20');
  });

  it('shows loading state', () => {
    render(<LeaderboardTable {...defaultProps} players={[]} isLoading={true} />);

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<LeaderboardTable {...defaultProps} players={[]} error="Failed to load data" />);

    expect(screen.getByText('Error: Failed to load data')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<LeaderboardTable {...defaultProps} players={[]} />);

    expect(screen.getByText('No players found')).toBeInTheDocument();
  });

  it('displays achievement count when present', () => {
    render(<LeaderboardTable {...defaultProps} />);

    expect(screen.getByText('12 achievements')).toBeInTheDocument();
    expect(screen.getByText('3 achievements')).toBeInTheDocument();
  });

  it('applies correct color classes for positive/negative values', () => {
    render(<LeaderboardTable {...defaultProps} />);

    // Positive winnings should be green
    const positiveWinnings = screen.getByText('$25.00K');
    expect(positiveWinnings).toHaveClass('text-emerald-400');

    // Negative winnings should be red
    const negativeWinnings = screen.getByText('-$5.00K');
    expect(negativeWinnings).toHaveClass('text-red-400');
  });
});