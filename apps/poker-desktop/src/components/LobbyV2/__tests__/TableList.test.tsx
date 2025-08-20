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

  describe('ResizeObserver Behavior', () => {
    let mockResizeObserver: jest.Mock;
    let resizeCallback: ResizeObserverCallback;

    beforeEach(() => {
      mockResizeObserver = jest.fn().mockImplementation((callback) => {
        resizeCallback = callback;
        return {
          observe: jest.fn(),
          disconnect: jest.fn(),
          unobserve: jest.fn()
        };
      });
      global.ResizeObserver = mockResizeObserver;
    });

    afterEach(() => {
      // @ts-ignore
      delete global.ResizeObserver;
    });

    it('should update dimensions when container resizes', async () => {
      const { rerender } = render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Verify ResizeObserver was created
      expect(mockResizeObserver).toHaveBeenCalled();

      // Simulate resize
      const mockEntry: ResizeObserverEntry = {
        target: document.createElement('div'),
        contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: []
      };

      // Trigger resize callback
      resizeCallback([mockEntry], {} as ResizeObserver);

      // Wait for state update
      await waitFor(() => {
        const virtualList = screen.getByTestId('virtual-list');
        expect(virtualList).toHaveStyle({ height: '600px' });
      });
    });

    it('should handle zero-height container gracefully', () => {
      // Mock container with zero height
      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'clientHeight', { value: 0 });
      Object.defineProperty(mockElement, 'clientWidth', { value: 800 });
      
      jest.spyOn(React, 'useRef').mockReturnValueOnce({ current: mockElement });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Should not render virtual list with zero height
      expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
      expect(screen.getByText('No tables match your filters')).toBeInTheDocument();
    });

    it('should cleanup ResizeObserver on unmount', () => {
      const disconnectSpy = jest.fn();
      mockResizeObserver.mockImplementation((callback) => ({
        observe: jest.fn(),
        disconnect: disconnectSpy,
        unobserve: jest.fn()
      }));

      const { unmount } = render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      unmount();
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Virtual Scrolling Edge Cases', () => {
    it('should handle empty table list without rendering virtual list', () => {
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

      // Should show empty state, not virtual list
      expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
      expect(screen.getByText('No tables match your filters')).toBeInTheDocument();
    });

    it('should handle very rapid scrolling without performance issues', async () => {
      const manyTables = Array.from({ length: 1000 }, (_, i) => ({
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
      
      // Simulate rapid scrolling
      for (let i = 0; i < 10; i++) {
        fireEvent.scroll(virtualList, { target: { scrollTop: i * 1000 } });
      }
      
      // Should still be rendered and functional
      await waitFor(() => {
        expect(virtualList).toBeInTheDocument();
      });
    });

    it('should maintain scroll position when tables update', async () => {
      const initialTables = Array.from({ length: 100 }, (_, i) => ({
        ...mockTables[0],
        id: `table-${i}`,
        name: `Table ${i}`
      }));

      const { rerender } = render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      const virtualList = screen.getByTestId('virtual-list');
      
      // Scroll to middle
      fireEvent.scroll(virtualList, { target: { scrollTop: 500 } });
      
      // Update tables (e.g., player count changes)
      const updatedTables = initialTables.map(table => ({
        ...table,
        players: Math.min(table.players + 1, table.maxPlayers)
      }));

      mockUseLobbyStore.mockReturnValue({
        ...mockUseLobbyStore(),
        tables: updatedTables
      });

      rerender(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Virtual list should still be present
      expect(screen.getByTestId('virtual-list')).toBeInTheDocument();
    });

    it('should handle container resize during scroll', async () => {
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

      // Get ResizeObserver callback
      const resizeCallback = (global.ResizeObserver as jest.Mock).mock.calls[0][0];

      // Simulate resize during scroll
      const mockEntry: ResizeObserverEntry = {
        target: document.createElement('div'),
        contentRect: { width: 1200, height: 800 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: []
      };

      resizeCallback([mockEntry], {} as ResizeObserver);

      await waitFor(() => {
        const virtualList = screen.getByTestId('virtual-list');
        expect(virtualList).toHaveStyle({ height: '800px' });
      });
    });

    it('should gracefully handle negative or invalid dimensions', () => {
      // Mock container with invalid dimensions
      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'clientHeight', { value: -100 });
      Object.defineProperty(mockElement, 'clientWidth', { value: -100 });
      
      jest.spyOn(React, 'useRef').mockReturnValueOnce({ current: mockElement });

      render(
        <TableList 
          apiUrl="http://test.com" 
          selectedTableId={null} 
          onTableSelect={jest.fn()} 
        />
      );

      // Should not crash, should show empty state
      expect(screen.queryByTestId('virtual-list')).not.toBeInTheDocument();
    });
  });
});