import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WaitlistPanel from '../WaitlistPanel';
import { useLobbyStore } from '../../../stores/lobby-store';

describe('WaitlistPanel', () => {
  const mockOnJoinTable = jest.fn();
  
  beforeEach(() => {
    mockOnJoinTable.mockClear();
    
    // Set up tables with waitlists
    useLobbyStore.setState({
      tables: [
        {
          id: 'table-456',
          name: 'Sakura Lounge',
          gameType: 'plo',
          stakes: { currency: '€', small: 0.5, big: 1 },
          players: 6,
          maxPlayers: 6,
          avgPot: 45,
          waitlist: 3,
          speed: 'turbo',
          handsPerHour: 90,
          playersPerFlop: 68,
          rakebackPercent: 0,
          features: ['turbo']
        },
        {
          id: 'table-888',
          name: 'Lucky Eights',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 8, big: 16 },
          players: 8,
          maxPlayers: 8,
          avgPot: 888,
          waitlist: 8,
          speed: 'normal',
          handsPerHour: 58,
          playersPerFlop: 38,
          rakebackPercent: 8,
          features: ['lucky8', 'featured']
        }
      ]
    });
  });

  test('does not render when no waitlist entries', () => {
    // Clear tables to simulate no waitlists
    useLobbyStore.setState({ tables: [] });
    
    const { container } = render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    expect(container.firstChild).toBeNull();
  });

  test('shows collapsed view initially with waitlist count', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      expect(waitlistButton).toBeInTheDocument();
    });
  });

  test('expands panel when clicked', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Wait for and click the collapsed button
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Check expanded content
    expect(screen.getByText('Your Waitlists')).toBeInTheDocument();
    expect(screen.getByText('Sakura Lounge')).toBeInTheDocument();
    expect(screen.getByText('Lucky Eights')).toBeInTheDocument();
  });

  test('displays waitlist position and estimated wait', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Check waitlist details
    expect(screen.getByText('#3')).toBeInTheDocument(); // Position
    expect(screen.getByText('#8')).toBeInTheDocument(); // Position
    expect(screen.getByText(/\d+ min/)).toBeInTheDocument(); // Est. wait
  });

  test('shows progress bar for wait time', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Check for progress bars
    const progressBars = screen.getAllByRole('progressbar', { hidden: true });
    expect(progressBars.length).toBeGreaterThan(0);
  });

  test('shows "Your turn is next" when position is 1', async () => {
    // Override mock data to set position to 1
    jest.spyOn(React, 'useState')
      .mockImplementationOnce(() => [
        [{
          tableId: 'table-456',
          tableName: 'Sakura Lounge',
          position: 1,
          estimatedWait: 1,
          joinedAt: new Date()
        }],
        jest.fn()
      ])
      .mockImplementation((initial) => React.useState(initial));

    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    expect(screen.getByText('🎉 Your turn is next!')).toBeInTheDocument();
    expect(screen.getByText('Join Now')).toBeInTheDocument();
  });

  test('handles join now button click', async () => {
    // Override mock data to set position to 1
    jest.spyOn(React, 'useState')
      .mockImplementationOnce(() => [
        [{
          tableId: 'table-456',
          tableName: 'Sakura Lounge',
          position: 1,
          estimatedWait: 1,
          joinedAt: new Date()
        }],
        jest.fn()
      ])
      .mockImplementation((initial) => React.useState(initial));

    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    const joinButton = screen.getByText('Join Now');
    fireEvent.click(joinButton);

    expect(mockOnJoinTable).toHaveBeenCalledWith('table-456');
  });

  test('removes entry when leave button clicked', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Get initial count of entries
    const initialEntries = screen.getAllByTitle('Leave waitlist');
    expect(initialEntries).toHaveLength(2);

    // Click first leave button
    fireEvent.click(initialEntries[0]);

    // Should have one less entry
    await waitFor(() => {
      const remainingEntries = screen.getAllByTitle('Leave waitlist');
      expect(remainingEntries).toHaveLength(1);
    });
  });

  test('collapses panel when X clicked', async () => {
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Click close button
    const closeButton = screen.getAllByText('✕')[0]; // First X is the panel close
    fireEvent.click(closeButton);

    // Should show collapsed view again
    await waitFor(() => {
      expect(screen.getByText(/Waitlist \(\d+\)/)).toBeInTheDocument();
      expect(screen.queryByText('Your Waitlists')).not.toBeInTheDocument();
    });
  });

  test('updates waiting time dynamically', async () => {
    jest.useFakeTimers();
    
    render(
      <WaitlistPanel apiUrl="test-api" onJoinTable={mockOnJoinTable} />
    );

    // Expand panel
    await waitFor(() => {
      const waitlistButton = screen.getByText(/Waitlist \(\d+\)/);
      fireEvent.click(waitlistButton);
    });

    // Initial waiting time
    expect(screen.getAllByText(/Waiting:/)[0].nextSibling?.textContent).toMatch(/\d+ min/);

    // Advance time
    jest.advanceTimersByTime(60000); // 1 minute

    // Waiting time should update
    await waitFor(() => {
      expect(screen.getAllByText(/Waiting:/)[0].nextSibling?.textContent).toMatch(/\d+ min/);
    });

    jest.useRealTimers();
  });
});