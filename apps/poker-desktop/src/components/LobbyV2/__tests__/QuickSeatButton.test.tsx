import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickSeatButton from '../QuickSeatButton';
import { useLobbyStore } from '../../../stores/lobby-store';
import LobbyService from '../../../services/lobby-service';

// Mock dependencies
jest.mock('../../../stores/lobby-store');
jest.mock('../../../services/lobby-service');

describe('QuickSeatButton', () => {
  const mockUseLobbyStore = useLobbyStore as jest.MockedFunction<typeof useLobbyStore>;
  const mockOnSeatFound = jest.fn();
  const mockOnCancel = jest.fn();
  
  beforeEach(() => {
    mockUseLobbyStore.mockReturnValue({
      tables: [
        {
          id: 'table-1',
          name: 'Beginner Table',
          stakes: { small: 1, big: 2, currency: '€' },
          players: 5,
          maxPlayers: 9,
          avgPot: 20,
          handsPerHour: 60,
          waitlist: 0,
          gameType: 'nlhe',
          speed: 'normal',
          features: []
        },
        {
          id: 'table-2',
          name: 'High Stakes',
          stakes: { small: 25, big: 50, currency: '€' },
          players: 9,
          maxPlayers: 9,
          avgPot: 500,
          handsPerHour: 50,
          waitlist: 2,
          gameType: 'nlhe',
          speed: 'normal',
          features: []
        }
      ],
      filters: {
        gameTypes: ['nlhe'],
        stakes: ['low'],
        tableSizes: [9],
        features: []
      },
      isLoadingTables: false,
      tablesError: null,
      selectedTableId: null,
      selectedTable: null,
      favoriteTables: [],
      favoriteTableIds: new Set(),
      stats: { playersOnline: 0, activeTables: 0, totalPot: 0 },
      toggleFavorite: jest.fn(),
      selectTable: jest.fn(),
      setFilters: jest.fn(),
      fetchTables: jest.fn(),
      fetchStats: jest.fn(),
      joinTable: jest.fn(),
      joinWaitlist: jest.fn()
    });
    
    // Mock LobbyService
    (LobbyService as jest.MockedClass<typeof LobbyService>).mockImplementation(() => ({
      getTables: jest.fn(),
      getLobbyStats: jest.fn(),
      joinTable: jest.fn().mockResolvedValue({ success: true }),
      joinWaitlist: jest.fn(),
      quickSeat: jest.fn().mockResolvedValue({ 
        success: true, 
        tableId: 'table-1' 
      })
    } as any));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should render the quick seat button', () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      expect(screen.getByText('Quick Seat')).toBeInTheDocument();
    });

    it('should show lightning icon', () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      expect(screen.getByText('⚡')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading state when searching', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(screen.getByText('Finding seat...')).toBeInTheDocument();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should disable button while searching', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(button).toBeDisabled();
    });

    it('should show cancel option while searching', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Success States', () => {
    it('should call onSeatFound when seat is found', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(mockOnSeatFound).toHaveBeenCalledWith('table-1');
      });
    });

    it('should show success message briefly', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('Seat found!')).toBeInTheDocument();
      });
      
      // Should reset after delay
      await waitFor(() => {
        expect(screen.queryByText('Seat found!')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Error States', () => {
    it('should show error when no seats available', async () => {
      const mockService = LobbyService as jest.MockedClass<typeof LobbyService>;
      mockService.mockImplementation(() => ({
        quickSeat: jest.fn().mockResolvedValue({ 
          success: false, 
          message: 'No available seats found' 
        })
      } as any));
      
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('No seats available')).toBeInTheDocument();
      });
    });

    it('should reset error state after delay', async () => {
      const mockService = LobbyService as jest.MockedClass<typeof LobbyService>;
      mockService.mockImplementation(() => ({
        quickSeat: jest.fn().mockResolvedValue({ 
          success: false 
        })
      } as any));
      
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.getByText('No seats available')).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.queryByText('No seats available')).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('Cancel Functionality', () => {
    it('should cancel search when cancel is clicked', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);
      
      expect(mockOnCancel).toHaveBeenCalled();
      expect(screen.getByText('Quick Seat')).toBeInTheDocument();
    });
  });

  describe('Filter Integration', () => {
    it('should respect current filters when finding seats', async () => {
      const mockService = LobbyService as jest.MockedClass<typeof LobbyService>;
      const quickSeatMock = jest.fn().mockResolvedValue({ 
        success: true, 
        tableId: 'table-1' 
      });
      
      mockService.mockImplementation(() => ({
        quickSeat: quickSeatMock
      } as any));
      
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(quickSeatMock).toHaveBeenCalledWith({
          gameTypes: ['nlhe'],
          stakes: ['low'],
          tableSizes: [9],
          features: []
        });
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label');
    });

    it('should announce loading state to screen readers', async () => {
      render(
        <QuickSeatButton 
          apiUrl="http://test.com"
          onSeatFound={mockOnSeatFound}
          onCancel={mockOnCancel}
        />
      );
      
      const button = screen.getByRole('button');
      fireEvent.click(button);
      
      expect(button).toHaveAttribute('aria-busy', 'true');
    });
  });
});