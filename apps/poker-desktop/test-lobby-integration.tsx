import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LobbyV2 } from './src/components/LobbyV2';
import { useLobbyStore } from './src/stores/lobby-store';

// Mock the test utils
jest.mock('./src/utils/test-utils', () => ({
  testSafeInvoke: jest.fn().mockImplementation((command) => {
    if (command === 'get_tables') {
      return Promise.resolve([
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
      ]);
    }
    if (command === 'get_lobby_stats') {
      return Promise.resolve({
        playersOnline: 8888,
        activeTables: 88,
        totalPot: 888888
      });
    }
    return Promise.resolve({});
  })
}));

describe('Lobby Integration', () => {
  beforeEach(() => {
    // Reset store before each test
    useLobbyStore.setState({
      tables: [],
      isLoadingTables: false,
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
  });

  test('loads tables on mount and displays them', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    // Should show loading initially
    expect(screen.getByText(/Loading tables.../i)).toBeInTheDocument();

    // Wait for tables to load
    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Check that table details are displayed
    expect(screen.getByText('€1/€2')).toBeInTheDocument();
    expect(screen.getByText('5/6')).toBeInTheDocument();
    expect(screen.getByText('€88')).toBeInTheDocument();
  });

  test('updates stats in status bar', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    // Wait for stats to load
    await waitFor(() => {
      expect(screen.getByText('8,888')).toBeInTheDocument(); // Players online
      expect(screen.getByText('88')).toBeInTheDocument(); // Active tables
      expect(screen.getByText('€888,888')).toBeInTheDocument(); // Total pot
    });
  });

  test('filters tables correctly', async () => {
    const { rerender } = render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Apply filter
    const store = useLobbyStore.getState();
    store.setFilters({ ...store.filters, gameType: 'plo' });

    // Should filter out the NLHE table
    expect(screen.queryByText('Dragon\'s Fortune')).not.toBeInTheDocument();
    expect(screen.getByText('No tables match your filters')).toBeInTheDocument();
  });

  test('selects table and shows preview', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Click on table row
    const tableRow = screen.getByText('Dragon\'s Fortune').closest('[role="row"]');
    tableRow?.click();

    // Should show table preview
    expect(screen.getByText('Join Table')).toBeInTheDocument();
    expect(screen.getByText('No Limit Hold\'em')).toBeInTheDocument();
    expect(screen.getByText('10% Rake Back')).toBeInTheDocument();
  });

  test('toggles favorite tables', async () => {
    render(<LobbyV2 apiUrl="test-api" />);

    await waitFor(() => {
      expect(screen.getByText('Dragon\'s Fortune')).toBeInTheDocument();
    });

    // Find favorite button
    const favoriteButton = screen.getByText('☆');
    favoriteButton.click();

    // Should update to favorited state
    expect(screen.getByText('⭐')).toBeInTheDocument();

    // Check store state
    const store = useLobbyStore.getState();
    expect(store.favoriteTables).toContain('table-1');
  });
});