import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FavoritesManager from '../FavoritesManager';
import { useLobbyStore } from '../../../stores/lobby-store';

// Mock the store
jest.mock('../../../stores/lobby-store');

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock as any;

describe('FavoritesManager', () => {
  const mockUseLobbyStore = useLobbyStore as jest.MockedFunction<typeof useLobbyStore>;
  const mockOnJoinTable = jest.fn();
  
  const mockTables = [
    {
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
      features: []
    },
    {
      id: 'table-2',
      name: 'Beginner\'s Luck',
      stakes: { small: 1, big: 2, currency: '€' },
      players: 8,
      maxPlayers: 9,
      avgPot: 25,
      handsPerHour: 80,
      waitlist: 0,
      gameType: 'nlhe',
      speed: 'normal',
      features: []
    },
    {
      id: 'table-3',
      name: 'Mid Stakes PLO',
      stakes: { small: 5, big: 10, currency: '€' },
      players: 4,
      maxPlayers: 6,
      avgPot: 150,
      handsPerHour: 50,
      waitlist: 1,
      gameType: 'plo',
      speed: 'normal',
      features: []
    }
  ];

  beforeEach(() => {
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    
    mockUseLobbyStore.mockReturnValue({
      tables: mockTables,
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      selectedTable: null,
      favoriteTables: ['table-1', 'table-3'],
      favoriteTableIds: new Set(['table-1', 'table-3']),
      filters: {
        gameTypes: ['nlhe'],
        stakes: ['micro', 'low'],
        tableSizes: [6, 9],
        features: []
      },
      stats: { playersOnline: 0, activeTables: 0, totalPot: 0 },
      toggleFavorite: jest.fn(),
      selectTable: jest.fn(),
      setFilters: jest.fn(),
      fetchTables: jest.fn(),
      fetchStats: jest.fn(),
      joinTable: jest.fn(),
      joinWaitlist: jest.fn()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Display', () => {
    it('should display favorite tables', () => {
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      expect(screen.getByText('Favorite Tables')).toBeInTheDocument();
      expect(screen.getByText('High Stakes Hold\'em')).toBeInTheDocument();
      expect(screen.getByText('Mid Stakes PLO')).toBeInTheDocument();
      expect(screen.queryByText('Beginner\'s Luck')).not.toBeInTheDocument();
    });

    it('should show empty state when no favorites', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        favoriteTables: [],
        favoriteTableIds: new Set()
      });
      
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      expect(screen.getByText('No favorite tables yet')).toBeInTheDocument();
      expect(screen.getByText('Star tables to see them here')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should allow removing favorites', () => {
      const toggleFavorite = jest.fn();
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        toggleFavorite
      });
      
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      const removeButton = screen.getAllByLabelText(/Remove from favorites/)[0];
      fireEvent.click(removeButton);
      
      expect(toggleFavorite).toHaveBeenCalledWith('table-1');
    });

    it('should allow joining table from favorites', () => {
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      const joinButton = screen.getAllByText('Join')[0];
      fireEvent.click(joinButton);
      
      expect(mockOnJoinTable).toHaveBeenCalledWith('table-1');
    });
  });

  describe('Live Updates', () => {
    it('should update table stats in real-time', async () => {
      const { rerender } = render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      // Simulate table update
      const updatedTables = [...mockTables];
      updatedTables[0] = { ...updatedTables[0], players: 8 };
      
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: updatedTables
      });
      
      rerender(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByText('8/9')).toBeInTheDocument();
      });
    });

    it('should show table full state', () => {
      const fullTables = [...mockTables];
      fullTables[0] = { ...fullTables[0], players: 9 };
      
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: fullTables
      });
      
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      expect(screen.getByText('Full')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should display favorites in order they were added', () => {
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      const tableNames = screen.getAllByTestId(/favorite-table-name/);
      expect(tableNames[0]).toHaveTextContent('High Stakes Hold\'em');
      expect(tableNames[1]).toHaveTextContent('Mid Stakes PLO');
    });
  });

  describe('Persistence', () => {
    it('should save favorites to localStorage', () => {
      const toggleFavorite = jest.fn().mockImplementation((tableId) => {
        const newFavorites = ['table-1', 'table-3', 'table-2'];
        localStorageMock.setItem('favoriteTables', JSON.stringify(newFavorites));
      });
      
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        toggleFavorite
      });
      
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      // Simulate adding a favorite
      toggleFavorite('table-2');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'favoriteTables',
        JSON.stringify(['table-1', 'table-3', 'table-2'])
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      expect(screen.getByRole('region', { name: /favorite tables/i })).toBeInTheDocument();
    });

    it('should have keyboard navigation support', () => {
      render(
        <FavoritesManager 
          apiUrl="http://test.com"
          onJoinTable={mockOnJoinTable}
        />
      );
      
      const firstButton = screen.getAllByText('Join')[0];
      firstButton.focus();
      
      expect(document.activeElement).toBe(firstButton);
    });
  });
});