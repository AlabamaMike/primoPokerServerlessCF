import { useEffect, useRef, useCallback } from 'react';
import { useLobbyStore } from '../stores/lobby-store';
import { MessageBatcher, BatchedMessage } from '../utils/message-batcher';

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
  const messageBatcherRef = useRef<MessageBatcher<any> | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const processBatch = useCallback((messages: BatchedMessage<LobbyUpdate>[]) => {
    const state = useLobbyStore.getState();
    let tables = [...state.tables];
    let stats = state.stats;
    let hasTableChanges = false;
    let hasStatsChanges = false;

    // Process all messages in the batch
    for (const message of messages) {
      const { type, payload } = message;

      switch (type) {
        case 'table_updated': {
          const tableIndex = tables.findIndex(t => t.id === payload.id);
          if (tableIndex !== -1) {
            // Apply delta update
            tables[tableIndex] = {
              ...tables[tableIndex],
              players: payload.currentPlayers ?? tables[tableIndex].players,
              avgPot: payload.pot ?? tables[tableIndex].avgPot,
              waitlist: payload.waitlist ?? tables[tableIndex].waitlist
            };
            hasTableChanges = true;
          }
          break;
        }

        case 'stats_update':
          stats = payload;
          hasStatsChanges = true;
          break;

        case 'table_added':
          // In a real implementation, we'd add the table directly
          console.log('New table added:', payload);
          hasTableChanges = true;
          break;

        case 'table_removed':
          tables = tables.filter(t => t.id !== payload.tableId);
          hasTableChanges = true;
          break;

        case 'waitlist_update': {
          const { tableId, waitlistCount } = payload;
          const tableIndex = tables.findIndex(t => t.id === tableId);
          if (tableIndex !== -1) {
            tables[tableIndex] = {
              ...tables[tableIndex],
              waitlist: waitlistCount
            };
            hasTableChanges = true;
          }
          break;
        }
      }
    }

    // Apply all changes in a single state update
    const updates: any = {};
    if (hasTableChanges) updates.tables = tables;
    if (hasStatsChanges) updates.stats = stats;
    
    if (Object.keys(updates).length > 0) {
      useLobbyStore.setState(updates);
    }
  }, []);

  const connect = () => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Initialize message batcher
      if (!messageBatcherRef.current) {
        messageBatcherRef.current = new MessageBatcher({
          batchInterval: 100, // Process every 100ms
          maxBatchSize: 50,
          onBatch: processBatch,
          onError: (error) => {
            console.error('Message batching error:', error);
          }
        });

        // Log metrics every 10 seconds in development
        if (process.env.NODE_ENV === 'development') {
          metricsIntervalRef.current = setInterval(() => {
            const metrics = messageBatcherRef.current?.getMetrics();
            if (metrics && metrics.totalBatches > 0) {
              console.log('WebSocket Batch Metrics:', {
                totalMessages: metrics.totalMessages,
                totalBatches: metrics.totalBatches,
                averageBatchSize: metrics.averageBatchSize.toFixed(2),
                messagesDropped: metrics.messagesDropped,
                averageProcessingTime: (metrics as any).averageProcessingTime?.toFixed(2) + 'ms'
              });
            }
          }, 10000);
        }
      }

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
          
          // Add message to batcher instead of processing immediately
          messageBatcherRef.current?.add(update.type, update.payload);
        } catch (error) {
          console.error('Failed to parse lobby update:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('Lobby WebSocket error:', error);
      };

      wsRef.current.onclose = () => {
        console.log('Lobby WebSocket disconnected');
        
        // Flush any pending messages before reconnecting
        messageBatcherRef.current?.flush();
        
        // Reconnect with exponential backoff
        if (enabled && reconnectCount.current < 10) { // Increased retry attempts
          const baseDelay = 1000;
          const maxDelay = 60000; // Max 60 seconds
          const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
          const delay = Math.min(baseDelay * Math.pow(2, reconnectCount.current) + jitter, maxDelay);
          reconnectCount.current++;
          
          console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectCount.current}/10)`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectCount.current >= 10) {
          console.error('Max reconnection attempts reached. Please refresh the page.');
          useLobbyStore.setState({ tablesError: 'Connection lost. Please refresh the page.' });
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
    
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current);
      metricsIntervalRef.current = null;
    }
    
    if (messageBatcherRef.current) {
      messageBatcherRef.current.flush();
      messageBatcherRef.current.destroy();
      messageBatcherRef.current = null;
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
  }, [url, enabled, processBatch]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    getMetrics: () => messageBatcherRef.current?.getMetrics() || null
  };
}