import { useEffect, useRef } from 'react';
import { useLobbyStore } from '../stores/lobby-store';

interface LobbyWebSocketOptions {
  url: string;
  enabled: boolean;
}

interface LobbyUpdate {
  type: 'table_added' | 'table_updated' | 'table_removed' | 'stats_update' | 'waitlist_update';
  payload: any;
}

export function useLobbyWebSocket({ url, enabled }: LobbyWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCount = useRef(0);
  
  const updateTable = (tableData: any) => {
    const { tables } = useLobbyStore.getState();
    const updatedTables = tables.map(table => 
      table.id === tableData.id 
        ? { 
            ...table, 
            players: tableData.currentPlayers || table.players,
            avgPot: tableData.pot || table.avgPot,
            waitlist: tableData.waitlist || table.waitlist
          }
        : table
    );
    useLobbyStore.setState({ tables: updatedTables });
  };

  const connect = () => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = url.replace(/^http/, 'ws') + '/ws/lobby';
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('Lobby WebSocket connected');
        reconnectCount.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const update: LobbyUpdate = JSON.parse(event.data);
          
          switch (update.type) {
            case 'table_updated':
              updateTable(update.payload);
              break;
              
            case 'stats_update':
              useLobbyStore.setState({ stats: update.payload });
              break;
              
            case 'table_added':
              // Refetch tables to get new table
              // In a real implementation, we'd add the table directly
              console.log('New table added:', update.payload);
              break;
              
            case 'table_removed':
              const { tables } = useLobbyStore.getState();
              useLobbyStore.setState({ 
                tables: tables.filter(t => t.id !== update.payload.tableId) 
              });
              break;
              
            case 'waitlist_update':
              const { tableId, waitlistCount } = update.payload;
              const state = useLobbyStore.getState();
              const updatedTables = state.tables.map(table => 
                table.id === tableId 
                  ? { ...table, waitlist: waitlistCount }
                  : table
              );
              useLobbyStore.setState({ tables: updatedTables });
              break;
          }
        } catch (error) {
          console.error('Failed to parse lobby update:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('Lobby WebSocket error:', error);
      };

      wsRef.current.onclose = () => {
        console.log('Lobby WebSocket disconnected');
        
        // Reconnect with exponential backoff
        if (enabled && reconnectCount.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectCount.current), 30000);
          reconnectCount.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (error) {
      console.error('Failed to create lobby WebSocket:', error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [url, enabled]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}