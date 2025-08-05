import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickSeatModal from '../QuickSeatModal';
import { useLobbyStore } from '../../../stores/lobby-store';

describe('QuickSeatModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSeatFound = jest.fn();
  
  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSeatFound.mockClear();
    
    // Set up test tables in store
    useLobbyStore.setState({
      tables: [
        {
          id: 'table-1',
          name: 'Low Stakes NLHE',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 0.5, big: 1 },
          players: 4,
          maxPlayers: 6,
          avgPot: 20,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 60,
          playersPerFlop: 40,
          rakebackPercent: 10,
          features: []
        },
        {
          id: 'table-2',
          name: 'High Stakes PLO',
          gameType: 'plo',
          stakes: { currency: '€', small: 10, big: 20 },
          players: 6,
          maxPlayers: 6,
          avgPot: 500,
          waitlist: 3,
          speed: 'normal',
          handsPerHour: 50,
          playersPerFlop: 60,
          rakebackPercent: 0,
          features: []
        },
        {
          id: 'table-3',
          name: 'Turbo NLHE',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 2, big: 4 },
          players: 8,
          maxPlayers: 9,
          avgPot: 100,
          waitlist: 0,
          speed: 'turbo',
          handsPerHour: 90,
          playersPerFlop: 35,
          rakebackPercent: 5,
          features: ['turbo']
        }
      ],
      joinTable: jest.fn().mockResolvedValue(true),
      joinWaitlist: jest.fn().mockResolvedValue(2)
    });
  });

  test('renders modal when open', () => {
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    expect(screen.getByText('Quick Seat')).toBeInTheDocument();
    expect(screen.getByText('Game Type')).toBeInTheDocument();
    expect(screen.getByText('Maximum Big Blind:')).toBeInTheDocument();
    expect(screen.getByText('Table Size')).toBeInTheDocument();
    expect(screen.getByText('Find Best Table')).toBeInTheDocument();
  });

  test('does not render when closed', () => {
    render(
      <QuickSeatModal
        isOpen={false}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    expect(screen.queryByText('Quick Seat')).not.toBeInTheDocument();
  });

  test('closes modal when X clicked', () => {
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    const closeButton = screen.getByText('✕');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  test('updates preferences correctly', () => {
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    // Change game type
    const gameTypeSelect = screen.getByRole('combobox');
    fireEvent.change(gameTypeSelect, { target: { value: 'plo' } });
    expect(gameTypeSelect).toHaveValue('plo');

    // Change stakes slider
    const stakesSlider = screen.getByRole('slider', { name: /maximum big blind/i });
    fireEvent.change(stakesSlider, { target: { value: '5' } });
    expect(screen.getByText('Maximum Big Blind: €5')).toBeInTheDocument();

    // Change table size
    const sixMaxButton = screen.getByText('6-Max');
    fireEvent.click(sixMaxButton);
    expect(sixMaxButton).toHaveClass('bg-purple-600');
  });

  test('finds best table with open seats', async () => {
    const { joinTable } = useLobbyStore.getState();
    
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    // Set preferences to match table-1
    const stakesSlider = screen.getByRole('slider', { name: /maximum big blind/i });
    fireEvent.change(stakesSlider, { target: { value: '2' } });

    const findButton = screen.getByText('Find Best Table');
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(joinTable).toHaveBeenCalledWith('test-api', 'table-1', 100);
      expect(mockOnSeatFound).toHaveBeenCalledWith('table-1');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  test('joins waitlist when no seats available', async () => {
    const { joinWaitlist } = useLobbyStore.getState();
    
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    // Set preferences to match only full table (table-2)
    const gameTypeSelect = screen.getByRole('combobox');
    fireEvent.change(gameTypeSelect, { target: { value: 'plo' } });
    
    const stakesSlider = screen.getByRole('slider', { name: /maximum big blind/i });
    fireEvent.change(stakesSlider, { target: { value: '25' } });

    const findButton = screen.getByText('Find Best Table');
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(joinWaitlist).toHaveBeenCalledWith('test-api', 'table-2');
    });
  });

  test('shows alert when no tables match', async () => {
    // Mock alert
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    // Set preferences that match no tables
    const stakesSlider = screen.getByRole('slider', { name: /maximum big blind/i });
    fireEvent.change(stakesSlider, { target: { value: '0.1' } });

    const findButton = screen.getByText('Find Best Table');
    fireEvent.click(findButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'No tables match your preferences. Try adjusting your filters.'
      );
    });

    alertSpy.mockRestore();
  });

  test('prefers tables with more players when multiple matches', async () => {
    // Add another table with fewer players
    useLobbyStore.setState({
      tables: [
        ...useLobbyStore.getState().tables,
        {
          id: 'table-4',
          name: 'Empty NLHE',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 0.5, big: 1 },
          players: 2, // Fewer players than table-1
          maxPlayers: 6,
          avgPot: 10,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 60,
          playersPerFlop: 40,
          rakebackPercent: 10,
          features: []
        }
      ]
    });

    const { joinTable } = useLobbyStore.getState();
    
    render(
      <QuickSeatModal
        isOpen={true}
        onClose={mockOnClose}
        onSeatFound={mockOnSeatFound}
        apiUrl="test-api"
      />
    );

    const findButton = screen.getByText('Find Best Table');
    fireEvent.click(findButton);

    await waitFor(() => {
      // Should join table-1 (4 players) over table-4 (2 players)
      expect(joinTable).toHaveBeenCalledWith('test-api', 'table-1', 100);
    });
  });
});