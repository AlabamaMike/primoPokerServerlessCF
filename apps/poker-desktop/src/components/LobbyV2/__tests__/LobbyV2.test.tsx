import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LobbyV2 from '../index';
import { useLobbyStore } from '../../../stores/lobby-store';
import { testSafeInvoke } from '../../../utils/test-utils';

// Mock dependencies
jest.mock('../../../utils/test-utils');
jest.mock('../../../hooks/useLobbyWebSocket', () => ({
  useLobbyWebSocket: () => ({ isConnected: true })
}));

const mockTestSafeInvoke = testSafeInvoke as jest.MockedFunction<typeof testSafeInvoke>;

describe('LobbyV2', () => {
  beforeEach(() => {
    // Reset store
    useLobbyStore.setState({
      tables: [],
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      filters: {
        gameType: 'all',
        stakes: 'all',
        speed: 'all',
        tableSize: 'all',
        features: []
      },
      stats: {
        playersOnline: 0,
        activeTables: 0,
        totalPot: 0
      },
      favoriteTables: []
    });

    // Mock API responses
    mockTestSafeInvoke.mockImplementation(async (command) => {
      if (command === 'get_tables') {
        return [
          {
            id: 'table-1',
            name: 'Dragon\'s Fortune',
            gameType: 'nlhe',
            stakes: { currency: '€', small: 1, big: 2 },
            players: 5,
            maxPlayers: 6,
            avgPot: 88,
            waitlist: 0,
            speed: 'normal',
            handsPerHour: 60,
            playersPerFlop: 45,
            rakebackPercent: 10,
            features: ['featured', 'lucky8']
          }
        ];
      }
      if (command === 'get_lobby_stats') {
        return {
          playersOnline: 8888,
          activeTables: 88,
          totalPot: 888888
        };
      }
      return {};
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders lobby components', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    // Check header elements
    expect(screen.getByText('Primo Poker')).toBeInTheDocument();
    expect(screen.getByText('⚡ Quick Seat')).toBeInTheDocument();
    
    // Check game type tabs
    expect(screen.getByText('Cash Games')).toBeInTheDocument();
    expect(screen.getByText('Sit & Go')).toBeInTheDocument();
    expect(screen.getByText('Tournaments')).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });
  });

  test('loads and displays tables', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    // Initially shows loading
    expect(screen.getByText('Loading tables...')).toBeInTheDocument();

    // Wait for tables to load
    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
      expect(screen.getByText('€1/€2')).toBeInTheDocument();
      expect(screen.getByText('5/6')).toBeInTheDocument();
    });
  });

  test('displays lobby statistics', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('8,888')).toBeInTheDocument(); // Players online
      expect(screen.getByText('88')).toBeInTheDocument(); // Active tables
      expect(screen.getByText('€888,888')).toBeInTheDocument(); // Total pot
    });
  });

  test('opens quick seat modal when button clicked', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    const quickSeatButton = screen.getByText('⚡ Quick Seat');
    fireEvent.click(quickSeatButton);

    await waitFor(() => {
      expect(screen.getByText('Quick Seat')).toBeInTheDocument();
      expect(screen.getByText('Game Type')).toBeInTheDocument();
      expect(screen.getByText('Find Best Table')).toBeInTheDocument();
    });
  });

  test('selects table when clicked', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Click on the table row
    const tableRow = screen.getByText('Dragon\'s Fortune').closest('[class*="cursor-pointer"]');
    if (tableRow) {
      fireEvent.click(tableRow);
    }

    // Check that table preview shows
    await waitFor(() => {
      expect(screen.getByText('Join Table')).toBeInTheDocument();
      expect(screen.getByText('No Limit Hold\'em')).toBeInTheDocument();
    });
  });

  test('toggles favorite when star clicked', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Find and click favorite button
    const favoriteButtons = screen.getAllByText('☆');
    fireEvent.click(favoriteButtons[0]);

    // Check that it changes to filled star
    await waitFor(() => {
      expect(screen.getByText('⭐')).toBeInTheDocument();
    });
  });

  test('shows websocket connection status', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Live Updates')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  test('handles join table action', async () => {
    const onJoinTable = jest.fn();
    render(<LobbyV2 apiUrl="test-api" onJoinTable={onJoinTable} />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Mock successful join
    mockTestSafeInvoke.mockResolvedValueOnce({ success: true });

    // Click JOIN button
    const joinButton = screen.getByText('JOIN');
    fireEvent.click(joinButton);

    await waitFor(() => {
      expect(mockTestSafeInvoke).toHaveBeenCalledWith('join_table', expect.any(Object));
    });
  });
});