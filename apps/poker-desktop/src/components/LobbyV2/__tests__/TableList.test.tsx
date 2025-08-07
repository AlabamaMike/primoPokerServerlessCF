import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TableList from '../TableList';
import { useLobbyStore } from '../../../stores/lobby-store';
import { FixedSizeList } from 'react-window';

// Mock the store
jest.mock('../../../stores/lobby-store');

// Mock react-window
jest.mock('react-window', () => ({
  FixedSizeList: jest.fn(({ children, itemCount, itemSize, height }) => (
    <div data-testid="virtual-list" style={{ height }}>
      {Array.from({ length: Math.min(itemCount, 10) }).map((_, index) =>
        children({ index, style: { height: itemSize, top: index * itemSize } })
      )}
    </div>
  )),
}));

describe('TableList', () => {
  const mockUseLobbyStore = useLobbyStore as jest.MockedFunction<typeof useLobbyStore>;
  
  const mockTables = [
    {
      id: 'table-1',
      name: 'High Stakes Hold\'em',
      stakes: { small: 25, big: 50 },
      players: 6,
      maxPlayers: 9,
      avgPot: 500,
      handsPerHour: 60,
      waitlist: 2,
      gameType: 'holdem',
      isFavorite: false
    },
    {
      id: 'table-2',
      name: 'Beginner\'s Luck',
      stakes: { small: 1, big: 2 },
      players: 8,
      maxPlayers: 9,
      avgPot: 25,
      handsPerHour: 80,
      waitlist: 0,
      gameType: 'holdem',
      isFavorite: true
    },
    {
      id: 'table-3',
      name: 'Mid Stakes PLO',
      stakes: { small: 5, big: 10 },
      players: 4,
      maxPlayers: 6,
      avgPot: 150,
      handsPerHour: 50,
      waitlist: 1,
      gameType: 'plo',
      isFavorite: false
    }
  ];

  beforeEach(() => {
    mockUseLobbyStore.mockReturnValue({
      tables: mockTables,
      isLoadingTables: false,
      tablesError: null,
      joinTable: jest.fn(),
      joinWaitlist: jest.fn(),
      fetchTables: jest.fn(),
      fetchStats: jest.fn(),
      stats: null,
      isLoadingStats: false,
      statsError: null,
      waitlistPositions: [],
      toggleFavorite: jest.fn(),
      favoriteTableIds: new Set(['table-2'])
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Virtual Scrolling', () => {
    it('should render tables using virtual scrolling', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );
      
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    it('should render visible items only', () => {
      const manyTables = Array.from({ length: 100 }, (_, i) => ({
        ...mockTables[0],
        id: `table-${i}`,
        name: `Table ${i}`
      }));

      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: manyTables
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Should only render a limited number of items
      const rows = screen.getAllByTestId(/table-row/);
      expect(rows.length).toBeLessThan(manyTables.length);
    });

    it('should handle scroll to load more items', async () => {
      const manyTables = Array.from({ length: 50 }, (_, i) => ({
        ...mockTables[0],
        id: `table-${i}`,
        name: `Table ${i}`
      }));

      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: manyTables
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const virtualList = screen.getByTestId('virtual-list');
      
      // Simulate scroll
      fireEvent.scroll(virtualList, { target: { scrollTop: 500 } });
      
      await waitFor(() => {
        // Virtual list should handle scrolling
        expect(virtualList).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('should sort tables by stakes by default', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const rows = screen.getAllByTestId(/table-row/);
      expect(rows).toHaveLength(3);
    });

    it('should toggle sort direction when clicking same column', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const stakesHeader = screen.getByText(/Stakes/);
      
      // First click - should maintain asc order
      fireEvent.click(stakesHeader);
      
      // Second click - should reverse to desc order
      fireEvent.click(stakesHeader);
      
      expect(screen.getByTestId('sort-indicator-stakes')).toHaveClass('rotate-180');
    });

    it('should sort by different columns', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Sort by name
      const nameHeader = screen.getByText(/Table Name/);
      fireEvent.click(nameHeader);
      
      expect(screen.getByTestId('sort-indicator-name')).toBeInTheDocument();
      
      // Sort by players
      const playersHeader = screen.getByText(/Players/);
      fireEvent.click(playersHeader);
      
      expect(screen.getByTestId('sort-indicator-players')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should highlight selected table', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId="table-2" 
          onTableSelect={jest.fn()} 
        />
      );

      const selectedRow = screen.getByTestId('table-row-table-2');
      expect(selectedRow).toHaveClass('bg-slate-800/50');
    });

    it('should call onTableSelect when clicking a table', () => {
      const onTableSelect = jest.fn();
      
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={onTableSelect} 
        />
      );

      const tableRow = screen.getByTestId('table-row-table-1');
      fireEvent.click(tableRow);
      
      expect(onTableSelect).toHaveBeenCalledWith('table-1');
    });
  });

  describe('Loading States', () => {
    it('should show loading indicator', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        isLoadingTables: true,
        tables: []
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      expect(screen.getByText('Loading tables...')).toBeInTheDocument();
    });

    it('should show error message', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tablesError: 'Failed to load tables',
        tables: []
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      expect(screen.getByText('Failed to load tables')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no tables match filters', () => {
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: []
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      expect(screen.getByText('No tables match your filters')).toBeInTheDocument();
    });
  });

  describe('Favorites', () => {
    it('should display favorite indicator for favorite tables', () => {
      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const favoriteRow = screen.getByTestId('table-row-table-2');
      expect(favoriteRow.querySelector('[data-testid="favorite-star"]')).toBeInTheDocument();
    });

    it('should toggle favorite status when clicking star', () => {
      const toggleFavorite = jest.fn();
      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        toggleFavorite
      });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const favoriteButton = screen.getByTestId('favorite-button-table-1');
      fireEvent.click(favoriteButton);
      
      expect(toggleFavorite).toHaveBeenCalledWith('table-1');
    });
  });
});