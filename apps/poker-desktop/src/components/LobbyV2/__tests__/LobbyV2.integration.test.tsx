import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LobbyV2 from '../index';
import { useLobbyWebSocket } from '../../../hooks/useLobbyWebSocket';
import { MockWebSocket } from '../../../utils/mock-websocket';

// Mock the websocket hook
jest.mock('../../../hooks/useLobbyWebSocket');

// Mock fetch
global.fetch = jest.fn();

describe('LobbyV2 Integration Tests', () => {
  const mockUseLobbyWebSocket = useLobbyWebSocket as jest.MockedFunction<typeof useLobbyWebSocket>;
  let mockWebSocket: MockWebSocket;
  
  beforeEach(() => {
    // Setup mock WebSocket
    mockWebSocket = new MockWebSocket();
    
    mockUseLobbyWebSocket.mockReturnValue({
      isConnected: true,
      lastMessage: null,
      sendMessage: jest.fn()
    });
    
    // Mock API responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/lobby/tables')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tables: [
              {
                id: 'table-1',
                name: 'Beginner Table',
                gameType: 'nlhe',
                stakes: { smallBlind: 1, bigBlind: 2 },
                maxPlayers: 9,
                currentPlayers: 5,
                pot: 50,
                status: 'active'
              },
              {
                id: 'table-2',
                name: 'High Stakes',
                gameType: 'nlhe',
                stakes: { smallBlind: 25, bigBlind: 50 },
                maxPlayers: 6,
                currentPlayers: 6,
                pot: 500,
                status: 'active'
              }
            ]
          })
        });
      }
      
      if (url.includes('/api/lobby/stats')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            playersOnline: 156,
            activeTables: 12,
            totalPot: 15000
          })
        });
      }
      
      return Promise.reject(new Error('Not found'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Load', () => {
    it('should load and display tables on mount', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText('Beginner Table')).toBeInTheDocument();
        expect(screen.getByText('High Stakes')).toBeInTheDocument();
      });
    });

    it('should display lobby statistics', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText(/156.*players online/i)).toBeInTheDocument();
        expect(screen.getByText(/12.*active tables/i)).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Updates', () => {
    it('should update table data when receiving WebSocket messages', async () => {
      const { rerender } = render(<LobbyV2 apiUrl="http://test.com" />);
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Beginner Table')).toBeInTheDocument();
      });
      
      // Simulate WebSocket message
      mockUseLobbyWebSocket.mockReturnValue({
        isConnected: true,
        lastMessage: {
          type: 'table_update',
          data: {
            tableId: 'table-1',
            currentPlayers: 7,
            pot: 150
          }
        },
        sendMessage: jest.fn()
      });
      
      rerender(<LobbyV2 apiUrl="http://test.com" />);
      
      // The store should update with new data
      await waitFor(() => {
        const tableRow = screen.getByTestId('table-row-table-1');
        expect(tableRow).toHaveTextContent('7/9');
      });
    });

    it('should show connection status', () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should handle disconnection', () => {
      mockUseLobbyWebSocket.mockReturnValue({
        isConnected: false,
        lastMessage: null,
        sendMessage: jest.fn()
      });
      
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should filter tables based on selected filters', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText('Beginner Table')).toBeInTheDocument();
      });
      
      // Open filters and select only high stakes
      const highStakesCheckbox = screen.getByLabelText('High Stakes');
      fireEvent.click(highStakesCheckbox);
      
      // Should trigger new fetch with filters
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(4); // Initial 2 + filtered 2
      });
    });
  });

  describe('Table Selection', () => {
    it('should show table preview when selecting a table', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText('Beginner Table')).toBeInTheDocument();
      });
      
      const tableRow = screen.getByTestId('table-row-table-1');
      fireEvent.click(tableRow);
      
      // Should show table preview
      expect(screen.getByTestId('table-preview-table-1')).toBeInTheDocument();
    });
  });

  describe('Quick Seat', () => {
    it('should open quick seat modal when clicking quick seat', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      const quickSeatButton = screen.getByText('Quick Seat');
      fireEvent.click(quickSeatButton);
      
      expect(screen.getByText('Finding seat...')).toBeInTheDocument();
    });
  });

  describe('Favorites', () => {
    it('should persist favorites to localStorage', async () => {
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText('Beginner Table')).toBeInTheDocument();
      });
      
      // Click favorite star
      const favoriteButton = screen.getByTestId('favorite-button-table-1');
      fireEvent.click(favoriteButton);
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'favoriteTables',
        expect.stringContaining('table-1')
      );
    });
  });

  describe('Error Handling', () => {
    it('should show error message when API fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load tables/i)).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should handle large number of tables with virtual scrolling', async () => {
      // Mock response with 1000 tables
      const manyTables = Array.from({ length: 1000 }, (_, i) => ({
        id: `table-${i}`,
        name: `Table ${i}`,
        gameType: 'nlhe',
        stakes: { smallBlind: 1, bigBlind: 2 },
        maxPlayers: 9,
        currentPlayers: Math.floor(Math.random() * 9),
        pot: Math.floor(Math.random() * 100),
        status: 'active'
      }));
      
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/lobby/tables')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ tables: manyTables })
          });
        }
        return Promise.reject(new Error('Not found'));
      });
      
      render(<LobbyV2 apiUrl="http://test.com" />);
      
      await waitFor(() => {
        // Should only render visible items
        const renderedRows = screen.getAllByTestId(/table-row-/);
        expect(renderedRows.length).toBeLessThan(50); // Virtual scrolling limits rendered items
      });
    });
  });
});