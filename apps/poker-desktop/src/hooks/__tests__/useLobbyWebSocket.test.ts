import { renderHook, act } from '@testing-library/react';
import { useLobbyWebSocket } from '../useLobbyWebSocket';
import { useLobbyStore } from '../../stores/lobby-store';
import WS from 'jest-websocket-mock';

describe('useLobbyWebSocket', () => {
  let server: WS;
  const mockUrl = 'ws://localhost:8080';

  beforeEach(async () => {
    // Create mock WebSocket server
    server = new WS(mockUrl + '/ws/lobby');
    
    // Reset store
    useLobbyStore.setState({
      tables: [
        {
          id: 'table-1',
          name: 'Test Table',
          gameType: 'nlhe',
          stakes: { currency: '€', small: 1, big: 2 },
          players: 5,
          maxPlayers: 6,
          avgPot: 100,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 60,
          playersPerFlop: 40,
          rakebackPercent: 10,
          features: []
        }
      ],
      stats: {
        playersOnline: 1000,
        activeTables: 50,
        totalPot: 50000
      }
    });
  });

  afterEach(() => {
    WS.clean();
  });

  test('connects to WebSocket when enabled', async () => {
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;
    expect(server).toHaveReceivedMessages([]);
  });

  test('does not connect when disabled', async () => {
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: false }));

    // Wait a bit to ensure no connection
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(server).not.toHaveReceivedMessages([]);
  });

  test('handles table update messages', async () => {
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;

    const updateMessage = {
      type: 'table_updated',
      payload: {
        id: 'table-1',
        currentPlayers: 6,
        pot: 150,
        waitlist: 2
      }
    };

    act(() => {
      server.send(JSON.stringify(updateMessage));
    });

    const state = useLobbyStore.getState();
    const updatedTable = state.tables.find(t => t.id === 'table-1');
    
    expect(updatedTable?.players).toBe(6);
    expect(updatedTable?.avgPot).toBe(150);
    expect(updatedTable?.waitlist).toBe(2);
  });

  test('handles stats update messages', async () => {
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;

    const statsMessage = {
      type: 'stats_update',
      payload: {
        playersOnline: 1500,
        activeTables: 75,
        totalPot: 75000
      }
    };

    act(() => {
      server.send(JSON.stringify(statsMessage));
    });

    const state = useLobbyStore.getState();
    expect(state.stats).toEqual({
      playersOnline: 1500,
      activeTables: 75,
      totalPot: 75000
    });
  });

  test('handles table removed messages', async () => {
    // Add another table first
    useLobbyStore.setState({
      tables: [
        ...useLobbyStore.getState().tables,
        {
          id: 'table-2',
          name: 'Table to Remove',
          gameType: 'plo',
          stakes: { currency: '€', small: 2, big: 4 },
          players: 3,
          maxPlayers: 6,
          avgPot: 200,
          waitlist: 0,
          speed: 'normal',
          handsPerHour: 50,
          playersPerFlop: 60,
          rakebackPercent: 0,
          features: []
        }
      ]
    });

    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;

    const removeMessage = {
      type: 'table_removed',
      payload: {
        tableId: 'table-2'
      }
    };

    act(() => {
      server.send(JSON.stringify(removeMessage));
    });

    const state = useLobbyStore.getState();
    expect(state.tables).toHaveLength(1);
    expect(state.tables.find(t => t.id === 'table-2')).toBeUndefined();
  });

  test('handles waitlist update messages', async () => {
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;

    const waitlistMessage = {
      type: 'waitlist_update',
      payload: {
        tableId: 'table-1',
        waitlistCount: 5
      }
    };

    act(() => {
      server.send(JSON.stringify(waitlistMessage));
    });

    const state = useLobbyStore.getState();
    const updatedTable = state.tables.find(t => t.id === 'table-1');
    expect(updatedTable?.waitlist).toBe(5);
  });

  test('handles malformed messages gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    renderHook(() => useLobbyWebSocket({ url: mockUrl, enabled: true }));

    await server.connected;

    act(() => {
      server.send('invalid json');
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to parse lobby update:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  test('reconnects on disconnect', async () => {
    jest.useFakeTimers();
    
    const { result } = renderHook(() => 
      useLobbyWebSocket({ url: mockUrl, enabled: true })
    );

    await server.connected;
    expect(result.current.isConnected).toBe(true);

    // Close connection
    act(() => {
      server.close();
    });

    expect(result.current.isConnected).toBe(false);

    // Fast-forward to trigger reconnect
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Create new server for reconnection
    const newServer = new WS(mockUrl + '/ws/lobby');
    await newServer.connected;

    expect(result.current.isConnected).toBe(true);

    WS.clean();
    jest.useRealTimers();
  });

  test('cleans up on unmount', async () => {
    const { unmount } = renderHook(() => 
      useLobbyWebSocket({ url: mockUrl, enabled: true })
    );

    await server.connected;

    unmount();

    // Connection should be closed
    await server.closed;
  });

  test('handles connection errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Use invalid URL to trigger error
    renderHook(() => 
      useLobbyWebSocket({ url: 'ws://invalid-url', enabled: true })
    );

    // Wait a bit for error to occur
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to create lobby WebSocket:', 
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });
});