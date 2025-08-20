import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineQueue } from '../services/offline-queue';

interface ConnectionState {
  isOnline: boolean;
  isConnected: boolean;
  lastOnlineTime: Date | null;
  reconnectAttempts: number;
  queueSize: number;
}

interface UseConnectionStateOptions {
  checkInterval?: number;
  onOnline?: () => void;
  onOffline?: () => void;
  onReconnect?: () => void;
  enableQueueProcessing?: boolean;
}

export function useConnectionState(
  checkConnectionFn?: () => Promise<boolean>,
  options: UseConnectionStateOptions = {}
): ConnectionState & {
  checkConnection: () => Promise<void>;
  processQueue: () => Promise<void>;
} {
  const {
    checkInterval = 30000, // 30 seconds
    onOnline,
    onOffline,
    onReconnect,
    enableQueueProcessing = true
  } = options;

  const [state, setState] = useState<ConnectionState>({
    isOnline: navigator.onLine,
    isConnected: false,
    lastOnlineTime: navigator.onLine ? new Date() : null,
    reconnectAttempts: 0,
    queueSize: offlineQueue.getQueueSize()
  });

  const wasOnlineRef = useRef(navigator.onLine);
  const wasConnectedRef = useRef(false);
  const checkIntervalRef = useRef<number>();

  // Check connection to backend
  const checkConnection = useCallback(async () => {
    try {
      const isConnected = checkConnectionFn ? await checkConnectionFn() : navigator.onLine;
      
      setState(prev => {
        const wasConnected = prev.isConnected;
        const newState = {
          ...prev,
          isConnected,
          reconnectAttempts: isConnected ? 0 : prev.reconnectAttempts + 1
        };

        // Handle reconnection
        if (!wasConnected && isConnected && prev.reconnectAttempts > 0) {
          onReconnect?.();
        }

        return newState;
      });

      // Process offline queue when connected
      if (isConnected && enableQueueProcessing && offlineQueue.getQueueSize() > 0) {
        // This should be handled by the component using this hook
        // by calling processQueue when appropriate
      }
    } catch (error) {
      console.error('Connection check failed:', error);
      setState(prev => ({
        ...prev,
        isConnected: false,
        reconnectAttempts: prev.reconnectAttempts + 1
      }));
    }
  }, [checkConnectionFn, onReconnect, enableQueueProcessing]);

  // Process offline queue
  const processQueue = useCallback(async () => {
    if (!state.isConnected || !checkConnectionFn) return;

    try {
      await offlineQueue.processQueue(async (action, payload) => {
        // This should be implemented by the component using this hook
        // For now, we'll just throw an error
        throw new Error(`No handler for action: ${action}`);
      });
    } catch (error) {
      console.error('Failed to process offline queue:', error);
    }
  }, [state.isConnected, checkConnectionFn]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => {
        const newState = {
          ...prev,
          isOnline: true,
          lastOnlineTime: new Date()
        };

        if (!wasOnlineRef.current) {
          onOnline?.();
          wasOnlineRef.current = true;
        }

        return newState;
      });

      // Check backend connection when browser comes online
      checkConnection();
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isOnline: false,
        isConnected: false
      }));

      if (wasOnlineRef.current) {
        onOffline?.();
        wasOnlineRef.current = false;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection, onOnline, onOffline]);

  // Subscribe to offline queue changes
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((queue) => {
      setState(prev => ({
        ...prev,
        queueSize: queue.length
      }));
    });

    return unsubscribe;
  }, []);

  // Periodic connection checks
  useEffect(() => {
    if (checkConnectionFn && checkInterval > 0) {
      // Initial check
      checkConnection();

      // Set up interval
      checkIntervalRef.current = setInterval(checkConnection, checkInterval);

      return () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
        }
      };
    }
  }, [checkConnection, checkConnectionFn, checkInterval]);

  // Track connection state changes
  useEffect(() => {
    if (wasConnectedRef.current !== state.isConnected) {
      wasConnectedRef.current = state.isConnected;
    }
  }, [state.isConnected]);

  return {
    ...state,
    checkConnection,
    processQueue
  };
}

// Helper hook for simple online/offline detection
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}