import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TableListRow from '../TableListRow';
import { useLobbyStore } from '../../../stores/lobby-store';

// Mock the store
jest.mock('../../../stores/lobby-store');

describe('TableListRow', () => {
  const mockUseLobbyStore = useLobbyStore as jest.MockedFunction<typeof useLobbyStore>;
  
  const mockTable = {
    id: 'table-1',
    name: 'Test Table',
    stakes: { small: 1, big: 2, currency: '$' },
    players: 6,
    maxPlayers: 9,
    avgPot: 50,
    speed: 'normal',
    waitlist: 0,
    gameType: 'nlhe',
    features: [],
    rakebackPercent: null
  };

  beforeEach(() => {
    mockUseLobbyStore.mockReturnValue({
      tables: [mockTable],
      isLoadingTables: false,
      tablesError: null,
      joinTable: jest.fn().mockResolvedValue(true),
      joinWaitlist: jest.fn().mockResolvedValue(1),
      fetchTables: jest.fn(),
      fetchStats: jest.fn(),
      stats: null,
      isLoadingStats: false,
      statsError: null,
      waitlistPositions: [],
      toggleFavorite: jest.fn(),
      favoriteTableIds: new Set()
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Lazy Loading Functionality', () => {
    let mockIntersectionObserver: jest.Mock;
    let observeCallback: IntersectionObserverCallback;
    let observerInstance: {
      observe: jest.Mock;
      disconnect: jest.Mock;
      unobserve: jest.Mock;
    };

    beforeEach(() => {
      observerInstance = {
        observe: jest.fn(),
        disconnect: jest.fn(),
        unobserve: jest.fn()
      };

      mockIntersectionObserver = jest.fn().mockImplementation((callback, options) => {
        observeCallback = callback;
        return observerInstance;
      });
      global.IntersectionObserver = mockIntersectionObserver;
    });

    afterEach(() => {
      // @ts-ignore
      delete global.IntersectionObserver;
    });

    it('should show placeholder when not visible, content when intersecting', async () => {
      render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
        />
      );

      // Initially should show placeholder
      const placeholder = screen.queryByText(mockTable.name);
      expect(placeholder).not.toBeInTheDocument();
      expect(screen.getByTestId(`table-row-${mockTable.id}`)).toHaveTextContent('');

      // Simulate intersection
      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        rootBounds: null,
        time: 0
      };

      // Trigger intersection callback
      observeCallback([mockEntry], {} as IntersectionObserver);

      // Wait for content to appear
      await waitFor(() => {
        expect(screen.getByText(mockTable.name)).toBeInTheDocument();
      });

      // Verify observer was disconnected after content loaded
      expect(observerInstance.disconnect).toHaveBeenCalled();
    });

    it('should start observing with correct root margin', () => {
      render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
        />
      );

      // Verify IntersectionObserver was created with correct options
      expect(mockIntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          rootMargin: '50px',
          threshold: 0.01
        })
      );
    });

    it('should not update state after component unmount', async () => {
      const { unmount } = render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
        />
      );

      // Unmount component
      unmount();

      // Try to trigger intersection after unmount
      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        rootBounds: null,
        time: 0
      };

      // This should not cause any errors
      expect(() => {
        observeCallback([mockEntry], {} as IntersectionObserver);
      }).not.toThrow();
    });

    it('should cleanup observer on unmount', () => {
      const { unmount } = render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
        />
      );

      unmount();
      expect(observerInstance.disconnect).toHaveBeenCalled();
    });

    it('should handle multiple rapid intersections gracefully', async () => {
      render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
        />
      );

      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        rootBounds: null,
        time: 0
      };

      // Trigger multiple intersections rapidly
      observeCallback([mockEntry], {} as IntersectionObserver);
      observeCallback([mockEntry], {} as IntersectionObserver);
      observeCallback([mockEntry], {} as IntersectionObserver);

      // Should still render content only once
      await waitFor(() => {
        expect(screen.getByText(mockTable.name)).toBeInTheDocument();
      });

      // Observer should be disconnected only once
      expect(observerInstance.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memoization', () => {
    it('should not re-render when props are unchanged', () => {
      const onSelect = jest.fn();
      const { rerender } = render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={onSelect}
          apiUrl="http://test.com"
          isFavorite={false}
        />
      );

      // Force intersection to show content
      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        rootBounds: null,
        time: 0
      };

      // Get the observer callback and trigger it
      const observerCallback = (global.IntersectionObserver as jest.Mock).mock.calls[0][0];
      observerCallback([mockEntry], {} as IntersectionObserver);

      // Rerender with same props
      rerender(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={onSelect}
          apiUrl="http://test.com"
          isFavorite={false}
        />
      );

      // IntersectionObserver should not be created again
      expect(global.IntersectionObserver).toHaveBeenCalledTimes(1);
    });

    it('should re-render when relevant props change', async () => {
      const { rerender } = render(
        <TableListRow
          table={mockTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
          isFavorite={false}
        />
      );

      // Force intersection to show content
      const mockEntry: IntersectionObserverEntry = {
        isIntersecting: true,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        intersectionRatio: 1,
        rootBounds: null,
        time: 0
      };

      const observerCallback = (global.IntersectionObserver as jest.Mock).mock.calls[0][0];
      observerCallback([mockEntry], {} as IntersectionObserver);

      await waitFor(() => {
        expect(screen.getByText(mockTable.name)).toBeInTheDocument();
      });

      // Update table with more players
      const updatedTable = { ...mockTable, players: 8 };
      
      rerender(
        <TableListRow
          table={updatedTable}
          isSelected={false}
          onSelect={jest.fn()}
          apiUrl="http://test.com"
          isFavorite={false}
        />
      );

      // Should show updated player count
      expect(screen.getByText('8/9')).toBeInTheDocument();
    });
  });
});