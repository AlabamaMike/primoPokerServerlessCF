import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TablePreviewCard from '../TablePreviewCard';
import { Table } from '../types';
import { useLobbyWebSocket } from '../../../hooks/useLobbyWebSocket';

// Mock the websocket hook
jest.mock('../../../hooks/useLobbyWebSocket');

describe('TablePreviewCard', () => {
  const mockUseLobbyWebSocket = useLobbyWebSocket as jest.MockedFunction<typeof useLobbyWebSocket>;
  
  const mockTable: Table = {
    id: 'table-1',
    name: 'High Stakes Hold\'em',
    stakes: { small: 25, big: 50, currency: '€' },
    players: 6,
    maxPlayers: 9,
    avgPot: 500,
    handsPerHour: 60,
    waitlist: 2,
    gameType: 'nlhe',
    speed: 'normal',
    features: ['featured', 'rakeback'],
    rakebackPercent: 50,
    playersPerFlop: 35
  };

  beforeEach(() => {
    mockUseLobbyWebSocket.mockReturnValue({
      isConnected: true,
      lastMessage: null,
      sendMessage: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Live Updates', () => {
    it('should display initial table statistics', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      expect(screen.getByText('High Stakes Hold\'em')).toBeInTheDocument();
      expect(screen.getByText('€25/€50')).toBeInTheDocument();
      expect(screen.getByText('6/9')).toBeInTheDocument();
      expect(screen.getByText('€500')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
    });

    it('should update statistics when receiving WebSocket messages', async () => {
      const { rerender } = render(<TablePreviewCard table={mockTable} />);
      
      // Simulate WebSocket update
      await act(async () => {
        mockUseLobbyWebSocket.mockReturnValue({
          isConnected: true,
          lastMessage: {
            type: 'table_update',
            data: {
              tableId: 'table-1',
              players: 8,
              avgPot: 750,
              waitlist: 3
            }
          },
          sendMessage: jest.fn()
        });
        
        rerender(<TablePreviewCard table={{ ...mockTable, players: 8, avgPot: 750, waitlist: 3 }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('8/9')).toBeInTheDocument();
        expect(screen.getByText('€750')).toBeInTheDocument();
      });
    });

    it('should animate statistics changes', async () => {
      const { rerender } = render(<TablePreviewCard table={mockTable} />);
      
      // Update avgPot
      await act(async () => {
        rerender(<TablePreviewCard table={{ ...mockTable, avgPot: 600 }} />);
      });
      
      const avgPotElement = screen.getByTestId('avg-pot-value');
      expect(avgPotElement).toHaveClass('text-emerald-400');
      
      // Wait for animation to complete
      await waitFor(() => {
        expect(avgPotElement).not.toHaveClass('text-emerald-400');
      }, { timeout: 2000 });
    });

    it('should show live indicator when connected', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      const liveIndicator = screen.getByTestId('live-indicator');
      expect(liveIndicator).toHaveClass('bg-emerald-500');
    });

    it('should show disconnected indicator when not connected', () => {
      mockUseLobbyWebSocket.mockReturnValue({
        isConnected: false,
        lastMessage: null,
        sendMessage: jest.fn()
      });
      
      render(<TablePreviewCard table={mockTable} />);
      
      const liveIndicator = screen.getByTestId('live-indicator');
      expect(liveIndicator).toHaveClass('bg-slate-500');
    });
  });

  describe('Player Seats Visualization', () => {
    it('should display seat positions', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      const seats = screen.getAllByTestId(/seat-\d+/);
      expect(seats).toHaveLength(mockTable.maxPlayers);
    });

    it('should show occupied seats', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      const occupiedSeats = screen.getAllByTestId(/seat-occupied/);
      expect(occupiedSeats).toHaveLength(mockTable.players);
    });

    it('should show empty seats', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      const emptySeats = screen.getAllByTestId(/seat-empty/);
      expect(emptySeats).toHaveLength(mockTable.maxPlayers - mockTable.players);
    });
  });

  describe('Features Display', () => {
    it('should display table features', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      expect(screen.getByText('Featured')).toBeInTheDocument();
      expect(screen.getByText('50% Rakeback')).toBeInTheDocument();
    });

    it('should display game type badge', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      expect(screen.getByText("NL Hold'em")).toBeInTheDocument();
    });

    it('should display speed indicator', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      expect(screen.getByText('Normal Speed')).toBeInTheDocument();
    });
  });

  describe('Statistics Panel', () => {
    it('should display all key statistics', () => {
      render(<TablePreviewCard table={mockTable} />);
      
      expect(screen.getByText('Players/Flop')).toBeInTheDocument();
      expect(screen.getByText('35%')).toBeInTheDocument();
      
      expect(screen.getByText('Hands/Hour')).toBeInTheDocument();
      expect(screen.getByText('60')).toBeInTheDocument();
      
      expect(screen.getByText('Avg Pot')).toBeInTheDocument();
      expect(screen.getByText('€500')).toBeInTheDocument();
      
      expect(screen.getByText('Waitlist')).toBeInTheDocument();
      expect(screen.getByText('2 players')).toBeInTheDocument();
    });

    it('should update statistics with animation', async () => {
      const { rerender } = render(<TablePreviewCard table={mockTable} />);
      
      // Update hands per hour
      await act(async () => {
        rerender(<TablePreviewCard table={{ ...mockTable, handsPerHour: 75 }} />);
      });
      
      const handsPerHourElement = screen.getByTestId('hands-per-hour-value');
      expect(handsPerHourElement).toHaveClass('text-emerald-400');
    });
  });

  describe('Null State', () => {
    it('should show placeholder when no table selected', () => {
      render(<TablePreviewCard table={null} />);
      
      expect(screen.getByText('Select a table to view details')).toBeInTheDocument();
    });
  });

  describe('Trend Indicators', () => {
    it('should show trend arrows for increasing values', async () => {
      const { rerender } = render(<TablePreviewCard table={mockTable} />);
      
      await act(async () => {
        rerender(<TablePreviewCard table={{ ...mockTable, players: 7 }} />);
      });
      
      const trendUp = screen.getByTestId('players-trend-up');
      expect(trendUp).toBeInTheDocument();
    });

    it('should show trend arrows for decreasing values', async () => {
      const { rerender } = render(<TablePreviewCard table={mockTable} />);
      
      await act(async () => {
        rerender(<TablePreviewCard table={{ ...mockTable, players: 5 }} />);
      });
      
      const trendDown = screen.getByTestId('players-trend-down');
      expect(trendDown).toBeInTheDocument();
    });
  });
});