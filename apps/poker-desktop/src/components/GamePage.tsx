import React, { useState, useEffect } from 'react';
// import { invoke } from '@tauri-apps/api/tauri';
import { testSafeInvoke } from '../utils/test-utils';
import PokerTable from './PokerTable';
import { ChatPanel } from './Chat';
import type { ChatMessage, ChatCommand } from './Chat';
import { saveChatMessages, loadChatMessages } from './Chat/utils/persistence';
import { useAuthStore } from '../stores/auth-store';
import { useWebSocket } from '../hooks/useWebSocket';
import { IncomingMessage } from '../lib/websocket-client';

interface GamePageProps {
  tableId: string;
  onLeaveTable?: () => void;
}

interface GameState {
  tableId: string;
  gameId: string;
  phase: 'waiting' | 'pre_flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
  pot: number;
  communityCards: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string }>;
  currentBet: number;
  minRaise: number;
  activePlayerId?: string;
  dealerId: string;
  smallBlindId: string;
  bigBlindId: string;
  handNumber: number;
}

interface Player {
  id: string;
  username: string;
  chips: number;
  currentBet: number;
  position: number;
  isActive: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  status: string;
  cards?: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string }>;
}

interface TableInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  gamePhase: string;
  pot: number;
  blinds: {
    small: number;
    big: number;
  };
}

const GamePage: React.FC<GamePageProps> = ({ tableId, onLeaveTable }) => {
  const { user } = useAuthStore();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    // Load persisted messages for this table
    return loadChatMessages(tableId);
  });
  const [rateLimitError, setRateLimitError] = useState<any | null>(null);

  const apiUrl = 'https://primo-poker-server.alabamamike.workers.dev';

  // Get auth token for WebSocket
  const [authToken, setAuthToken] = useState<string | null>(null);

  // WebSocket connection
  const [wsState, wsActions] = useWebSocket({
    url: apiUrl,
    token: authToken || '',
    tableId,
    enabled: !!authToken,
    reconnectAttempts: 5,
    reconnectDelay: 3000
  });

  // Mock game state for testing
  const mockGameState: GameState = {
    tableId: tableId,
    gameId: 'game-123',
    phase: 'flop',
    pot: 150,
    communityCards: [
      { suit: 'hearts', rank: 'A' },
      { suit: 'diamonds', rank: 'K' },
      { suit: 'clubs', rank: 'Q' }
    ],
    currentBet: 25,
    minRaise: 25,
    activePlayerId: 'player-2',
    dealerId: 'player-1',
    smallBlindId: 'player-2',
    bigBlindId: 'player-3',
    handNumber: 5
  };

  const mockPlayers: Player[] = [
    {
      id: 'player-1',
      username: 'Alice',
      chips: 1000,
      currentBet: 25,
      position: 1,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active',
      cards: [
        { suit: 'spades', rank: 'A' },
        { suit: 'hearts', rank: 'K' }
      ]
    },
    {
      id: 'player-2',
      username: 'Bob',
      chips: 850,
      currentBet: 25,
      position: 3,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active'
    },
    {
      id: 'player-3',
      username: 'Charlie',
      chips: 1200,
      currentBet: 50,
      position: 6,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active'
    }
  ];

  // Get auth token for WebSocket
  const fetchAuthToken = async () => {
    try {
      const token = await testSafeInvoke<{ access_token: string } | null>('get_auth_token');
      if (token) {
        setAuthToken(token.access_token);
      }
    } catch (err) {
      console.error('Failed to get auth token:', err);
    }
  };

  // Fetch table info
  const fetchTableInfo = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // For now, use mock data until WebSocket provides real data
      const mockTableInfo: TableInfo = {
        id: tableId,
        name: 'Test Table',
        playerCount: 3,
        maxPlayers: 9,
        gamePhase: 'flop',
        pot: 150,
        blinds: {
          small: 10,
          big: 20
        }
      };
      
      setTableInfo(mockTableInfo);
      
      // Don't set mock data if WebSocket is connected - let WebSocket handle it
      if (!wsState.isConnected) {
        setGameState(mockGameState);
        setPlayers(mockPlayers);
      }
      
    } catch (err) {
      console.error('Failed to fetch table info:', err);
      setError('Failed to load table information');
    } finally {
      setLoading(false);
    }
  };

  // Handle rate limit errors from WebSocket
  const handleRateLimitError = (error: any) => {
    setRateLimitError(error);
    // Clear error after retry period
    if (error.rateLimitInfo?.retryAfter) {
      setTimeout(() => {
        setRateLimitError(null);
      }, error.rateLimitInfo.retryAfter * 1000);
    }
  };

  // Handle WebSocket messages
  const handleWebSocketMessage = (message: IncomingMessage) => {
    // Process WebSocket message
    
    switch (message.type) {
      case 'game_update':
        // Update game state from WebSocket
        if (message.payload) {
          setGameState(message.payload.gameState || message.payload);
          if (message.payload.players) {
            setPlayers(message.payload.players);
          }
        }
        break;
        
      case 'chat':
        // Add chat message
        setChatMessages(prev => [...prev.slice(-49), {
          id: `msg-${Date.now()}-${Math.random()}`,
          username: message.payload.username,
          userId: message.payload.userId || 'unknown',
          message: message.payload.message,
          timestamp: new Date(),
          isSystem: message.payload.isSystem
        }]);
        break;
        
      case 'connection_established':
        // WebSocket connection established
        setError(null);
        break;
        
      case 'error':
        console.error('WebSocket error:', message.payload.message);
        // Check for rate limit error
        if (message.payload.rateLimitInfo) {
          // Pass rate limit error to ChatPanel via a callback
          handleRateLimitError(message.payload);
        } else {
          setError(message.payload.message);
        }
        break;
        
      default:
        // Unknown message type - could log to monitoring service
    }
  };

  // Handle player actions via WebSocket
  const handlePlayerAction = async (action: string, amount?: number) => {
    try {
      // Execute player action
      
      if (wsState.isConnected && user) {
        // Send action via WebSocket
        wsActions.sendPlayerAction(action as 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin', amount);
        setError(null);
      } else {
        // Fallback to HTTP API call
        console.warn('WebSocket not connected, using HTTP fallback');
        // TODO: Implement HTTP fallback
        setError('Connection lost - please reconnect');
      }
      
    } catch (err) {
      console.error('Failed to perform action:', err);
      setError(`Failed to ${action}`);
    }
  };

  // Handle sitting down at table
  const handleSitDown = async (_position: number) => {
    try {
      // Attempt to sit at table position
      
      // TODO: Implement actual API call
      // const result = await invoke('sit_down', { 
      //   tableId, 
      //   position,
      //   buyIn: 1000 
      // });
      
      setError(null);
      
    } catch (err) {
      console.error('Failed to sit down:', err);
      setError('Failed to sit down at table');
    }
  };

  // Handle sending chat messages
  const handleSendChatMessage = (message: string) => {
    if (wsState.isConnected && user) {
      wsActions.sendChatMessage(message, user.id, user.username || user.email);
    }
  };

  // Handle chat commands
  const handleChatCommand = (command: ChatCommand) => {
    if (!wsState.isConnected || !user) return;
    
    switch (command.command) {
      case 'fold':
      case 'check':
      case 'call':
      case 'allin':
        handlePlayerAction(command.command);
        break;
        
      case 'bet':
      case 'raise':
        if (
          Array.isArray(command.args) &&
          command.args.length > 0 &&
          typeof command.args[0] === 'string'
        ) {
          const numAmount = parseFloat(command.args[0]);
          if (!isNaN(numAmount) && numAmount > 0) {
            handlePlayerAction(command.command, numAmount);
          }
        }
        break;
        
      default:
        // Unhandled command - could be logged for monitoring
    }
  };

  // Handle player moderation
  const handleMutePlayer = (_playerId: string) => {
    // TODO: Implement mute functionality
  };

  const handleBlockPlayer = (_playerId: string) => {
    // TODO: Implement block functionality
  };

  // Leave table
  const handleLeaveTable = () => {
    // Disconnect WebSocket before leaving
    wsActions.disconnect();
    
    if (onLeaveTable) {
      onLeaveTable();
    }
  };

  // Initialize auth token and table info
  useEffect(() => {
    fetchAuthToken();
    fetchTableInfo();
  }, [tableId]);

  // Handle WebSocket messages
  useEffect(() => {
    if (wsState.lastMessage) {
      handleWebSocketMessage(wsState.lastMessage);
    }
  }, [wsState.lastMessage]);

  // Handle WebSocket connection state changes
  useEffect(() => {
    if (wsState.error) {
      setError(`Connection error: ${wsState.error.message}`);
    }
  }, [wsState.error]);

  // Fallback polling when WebSocket is not connected
  useEffect(() => {
    if (!wsState.isConnected && !wsState.isConnecting) {
      const interval = setInterval(fetchTableInfo, 5000);
      return () => clearInterval(interval);
    }
  }, [wsState.isConnected, wsState.isConnecting]);

  // Save chat messages to localStorage when they change
  useEffect(() => {
    saveChatMessages(tableId, chatMessages);
  }, [tableId, chatMessages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-900">
        <div className="text-white text-xl">Loading table...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-900">
        <div className="text-red-400 text-xl mb-4">{error}</div>
        <button
          onClick={handleLeaveTable}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  if (!gameState || !tableInfo) {
    return (
      <div className="flex items-center justify-center h-screen bg-green-900">
        <div className="text-white text-xl">Table not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-green-900 flex flex-col" data-testid="game-page">
      {/* Header */}
      <div className="bg-green-800 text-white p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{tableInfo.name}</h1>
          <div className="text-sm text-green-200">
            Blinds: ${tableInfo.blinds.small}/${tableInfo.blinds.big}
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className={`px-2 py-1 rounded text-xs flex items-center space-x-1 ${
            wsState.isConnected ? 'bg-green-600' : 
            wsState.isConnecting ? 'bg-yellow-600' : 'bg-red-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              wsState.isConnected ? 'bg-green-300' : 
              wsState.isConnecting ? 'bg-yellow-300 animate-pulse' : 'bg-red-300'
            }`} />
            <span>
              {wsState.isConnected ? 'Live' : 
               wsState.isConnecting ? 'Connecting...' : 'Offline'}
            </span>
          </div>
          <button
            onClick={handleLeaveTable}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            data-testid="leave-table-button"
          >
            Leave Table
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-500 text-white p-2 text-center">
          {error}
        </div>
      )}

      {/* Main game area */}
      <div className="flex-1 flex p-4 space-x-4">
        {/* Poker table */}
        <div className="flex-1">
          <PokerTable
            gameState={gameState}
            players={players}
            currentUserId={user?.id}
            onPlayerAction={handlePlayerAction}
            onSitDown={handleSitDown}
            showAllCards={false}
          />
        </div>
        
        {/* Chat panel */}
        <div className="w-80">
          <ChatPanel
            messages={chatMessages}
            onSendMessage={handleSendChatMessage}
            onCommand={handleChatCommand}
            onMutePlayer={handleMutePlayer}
            onBlockPlayer={handleBlockPlayer}
            currentUserId={user?.id}
            isConnected={wsState.isConnected}
            className="h-full"
            onRateLimitError={handleRateLimitError}
          />
        </div>
      </div>
    </div>
  );
};

export default GamePage;