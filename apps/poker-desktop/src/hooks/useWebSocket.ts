import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketClient, IncomingMessage, WebSocketClientOptions } from '../lib/websocket-client';

export interface UseWebSocketOptions {
  url: string;
  token: string;
  tableId: string;
  enabled?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  connectionState: string;
  lastMessage: IncomingMessage | null;
  messageHistory: IncomingMessage[];
}

export interface WebSocketActions {
  connect: () => void;
  disconnect: () => void;
  sendPlayerAction: (action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in', amount?: number) => void;
  sendChatMessage: (message: string, playerId: string, username: string) => void;
  clearError: () => void;
  clearMessageHistory: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): [WebSocketState, WebSocketActions] {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    connectionState: 'disconnected',
    lastMessage: null,
    messageHistory: []
  });

  const clientRef = useRef<WebSocketClient | null>(null);
  const optionsRef = useRef(options);

  // Update options ref when options change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const handleMessage = useCallback((message: IncomingMessage) => {
    setState(prev => ({
      ...prev,
      lastMessage: message,
      messageHistory: [...prev.messageHistory.slice(-49), message] // Keep last 50 messages
    }));
  }, []);

  const handleError = useCallback((error: Error) => {
    setState(prev => ({
      ...prev,
      error,
      isConnecting: false
    }));
  }, []);

  const handleConnect = useCallback(() => {
    setState(prev => ({
      ...prev,
      isConnected: true,
      isConnecting: false,
      error: null,
      connectionState: 'connected'
    }));
  }, []);

  const handleDisconnect = useCallback(() => {
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      connectionState: 'disconnected'
    }));
  }, []);

  const connect = useCallback(() => {
    if (clientRef.current?.isConnected || state.isConnecting) {
      return;
    }

    setState(prev => ({
      ...prev,
      isConnecting: true,
      error: null
    }));

    const clientOptions: WebSocketClientOptions = {
      url: optionsRef.current.url,
      token: optionsRef.current.token,
      tableId: optionsRef.current.tableId,
      reconnectAttempts: optionsRef.current.reconnectAttempts,
      reconnectDelay: optionsRef.current.reconnectDelay,
      onMessage: handleMessage,
      onError: handleError,
      onConnect: handleConnect,
      onDisconnect: handleDisconnect
    };

    clientRef.current = new WebSocketClient(clientOptions);
    clientRef.current.connect();
  }, [state.isConnecting, handleMessage, handleError, handleConnect, handleDisconnect]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      connectionState: 'disconnected'
    }));
  }, []);

  const sendPlayerAction = useCallback((action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in', amount?: number) => {
    if (clientRef.current?.isConnected) {
      clientRef.current.sendPlayerAction(action, amount);
    } else {
      console.warn('Cannot send player action: WebSocket not connected');
    }
  }, []);

  const sendChatMessage = useCallback((message: string, playerId: string, username: string) => {
    if (clientRef.current?.isConnected) {
      clientRef.current.sendChatMessage(message, playerId, username);
    } else {
      console.warn('Cannot send chat message: WebSocket not connected');
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const clearMessageHistory = useCallback(() => {
    setState(prev => ({ ...prev, messageHistory: [], lastMessage: null }));
  }, []);

  // Auto-connect when enabled
  useEffect(() => {
    if (options.enabled && !state.isConnected && !state.isConnecting) {
      connect();
    } else if (!options.enabled && (state.isConnected || state.isConnecting)) {
      disconnect();
    }
  }, [options.enabled, state.isConnected, state.isConnecting, connect, disconnect]);

  // Update connection state from client
  useEffect(() => {
    const interval = setInterval(() => {
      if (clientRef.current) {
        const newConnectionState = clientRef.current.connectionState;
        setState(prev => {
          if (prev.connectionState !== newConnectionState) {
            return { ...prev, connectionState: newConnectionState };
          }
          return prev;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, []);

  const actions: WebSocketActions = {
    connect,
    disconnect,
    sendPlayerAction,
    sendChatMessage,
    clearError,
    clearMessageHistory
  };

  return [state, actions];
}