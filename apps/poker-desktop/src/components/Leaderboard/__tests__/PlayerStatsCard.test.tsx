import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerStatsCard from '../PlayerStatsCard';
import { PlayerStatsView, PlayerStatistics, StatsPeriod, StatsGameType } from '@primo-poker/shared';

const mockPlayer: PlayerStatsView = {
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
  lastActiveAt: new Date('2025-08-18T15:30:00')
};

const mockDetailedStats: PlayerStatistics = {
  id: '1',
  playerId: '1',
  period: StatsPeriod.ALL_TIME,
  gameType: StatsGameType.ALL,
  periodStart: new Date('2024-01-01'),
  handsPlayed: 150000,
  handsWon: 25000,
  showdownsWon: 12000,
  showdownsSeen: 20000,
  totalBetAmount: 500000,
  totalWinnings: 25000,
  totalRakeContributed: 5000,
  biggestPotWon: 2500,
  vpip: 28.5,
  pfr: 22.3,
  threeBet: 8.5,
  foldToThreeBet: 62.0,
  aggressionFactor: 2.8,
  aggressionFrequency: 45.0,
  cBet: 68.0,
  foldToCBet: 35.0,
  wtsd: 28.0,
  wsd: 52.0,
  sessionsPlayed: 500,
  totalSessionDuration: 1800000, // 500 hours in seconds
  profitableSessions: 300,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2025-08-18'),
  lastCalculatedAt: new Date('2025-08-18')
};

describe('PlayerStatsCard', () => {
  const defaultProps = {
    player: mockPlayer,
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders player information correctly', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('PokerPro123')).toBeInTheDocument();
    expect(screen.getByText(/Last active:/)).toBeInTheDocument();
  });

  it('displays rank badges correctly', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('🥇')).toBeInTheDocument(); // Gold medal for rank 1
    expect(screen.getByText('#1').closest('div')).toBeInTheDocument(); // Overall rank
  });

  it('shows all three ranking categories', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('Overall Rank')).toBeInTheDocument();
    expect(screen.getByText('Profit Rank')).toBeInTheDocument();
    expect(screen.getByText('Volume Rank')).toBeInTheDocument();
    
    // Check rank values
    expect(screen.getAllByText('#1')).toHaveLength(2); // Overall and Profit
    expect(screen.getByText('#3')).toBeInTheDocument(); // Volume
  });

  it('displays lifetime performance stats', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('Lifetime Performance')).toBeInTheDocument();
    expect(screen.getByText('150,000')).toBeInTheDocument(); // Total hands
    expect(screen.getByText('$25,000.00')).toBeInTheDocument(); // Total winnings
    expect(screen.getByText('+5.20 BB/100')).toBeInTheDocument(); // Win rate
  });

  it('displays recent performance stats', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument(); // Recent hands
    expect(screen.getByText('$2,000.00')).toBeInTheDocument(); // Recent winnings
    expect(screen.getByText('+6.10 BB/100')).toBeInTheDocument(); // Recent win rate
  });

  it('shows detailed stats when provided', () => {
    render(<PlayerStatsCard {...defaultProps} detailedStats={mockDetailedStats} />);

    expect(screen.getByText('Playing Style')).toBeInTheDocument();
    expect(screen.getByText('VPIP')).toBeInTheDocument();
    expect(screen.getByText('28.5%')).toBeInTheDocument();
    expect(screen.getByText('PFR')).toBeInTheDocument();
    expect(screen.getByText('22.3%')).toBeInTheDocument();
    expect(screen.getByText('AF')).toBeInTheDocument();
    expect(screen.getByText('2.80')).toBeInTheDocument();
  });

  it('displays achievements section when player has achievements', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    expect(screen.getByText('🏆')).toBeInTheDocument();
    expect(screen.getByText('12 Achievements Unlocked')).toBeInTheDocument();
  });

  it('does not display achievements section when no achievements', () => {
    const playerNoAchievements = { ...mockPlayer, achievementsCount: 0 };
    render(<PlayerStatsCard {...defaultProps} player={playerNoAchievements} />);

    expect(screen.queryByText('Achievements Unlocked')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking backdrop', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    const backdrop = screen.getByText('PokerPro123').closest('.fixed')!;
    fireEvent.click(backdrop);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('prevents closing when clicking card content', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    const cardContent = screen.getByText('PokerPro123').closest('.bg-slate-900')!;
    fireEvent.click(cardContent);

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(<PlayerStatsCard {...defaultProps} isLoading={true} />);

    const loadingContainer = document.querySelector('.animate-pulse');
    expect(loadingContainer).toBeInTheDocument();
  });

  it('applies correct colors for positive/negative values', () => {
    render(<PlayerStatsCard {...defaultProps} />);

    // Positive values should be green
    const positiveWinnings = screen.getByText('$25,000.00');
    expect(positiveWinnings).toHaveClass('text-emerald-400');

    const positiveWinRate = screen.getByText('+5.20 BB/100');
    expect(positiveWinRate).toHaveClass('text-emerald-400');
  });

  it('shows unranked when rank is undefined', () => {
    const unrankedPlayer = { ...mockPlayer, overallRank: undefined };
    render(<PlayerStatsCard {...defaultProps} player={unrankedPlayer} />);

    expect(screen.getByText('Unranked')).toBeInTheDocument();
  });

  it('displays all playing style stats correctly', () => {
    render(<PlayerStatsCard {...defaultProps} detailedStats={mockDetailedStats} />);

    // Pre-flop stats
    expect(screen.getByText('VPIP')).toBeInTheDocument();
    expect(screen.getByText('PFR')).toBeInTheDocument();
    expect(screen.getByText('3-Bet')).toBeInTheDocument();
    expect(screen.getByText('AF')).toBeInTheDocument();

    // Post-flop stats
    expect(screen.getByText('WTSD')).toBeInTheDocument();
    expect(screen.getByText('WSD')).toBeInTheDocument();
    expect(screen.getByText('C-Bet')).toBeInTheDocument();
    expect(screen.getByText('Fold to C-Bet')).toBeInTheDocument();
  });
});