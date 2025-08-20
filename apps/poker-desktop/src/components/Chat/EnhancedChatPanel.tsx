import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatPanelProps, ChatMessage, PlayerModerationState } from './types';
import VirtualMessageList from './VirtualMessageList';
import MessageInput from './MessageInput';
import UnreadIndicator from './UnreadIndicator';
import { parseCommand, formatCommandHelp } from './utils/chatCommands';
import { saveChatMessages, loadChatMessages } from './utils/persistence';
import { messageCache } from '../../utils/message-cache';
import { sanitizeMessage } from './utils/sanitize';
import { MessageBatcher } from '../../utils/message-batcher';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClose: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center p-2 bg-gray-700 border-b border-gray-600">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages..."
        className="flex-1 px-3 py-1 bg-gray-800 text-white text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500"
      />
      <button
        type="submit"
        className="ml-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      >
        Search
      </button>
      <button
        type="button"
        onClick={onClose}
        className="ml-2 p-1 text-gray-400 hover:text-white"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </form>
  );
};

interface TypingIndicatorProps {
  typingUsers: string[];
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers }) => {
  if (typingUsers.length === 0) return null;

  const text = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
    ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
    : `${typingUsers[0]} and ${typingUsers.length - 1} others are typing...`;

  return (
    <div className="px-3 py-1 text-xs text-gray-400 italic">
      {text}
    </div>
  );
};

const EnhancedChatPanel: React.FC<ChatPanelProps & {
  tableId?: string;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  typingUsers?: string[];
}> = ({
  messages,
  onSendMessage,
  onCommand,
  onMutePlayer,
  onBlockPlayer,
  currentUserId,
  isConnected,
  className = '',
  tableId,
  onTypingStart,
  onTypingStop,
  typingUsers = []
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [moderationState, setModerationState] = useState<PlayerModerationState>({
    mutedPlayers: new Set<string>(),
    blockedPlayers: new Set<string>()
  });
  const lastMessageCountRef = useRef(messages.length);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Message batcher for rapid messages
  const messageBatcher = useMemo(() => new MessageBatcher(
    (batchedMessages) => {
      // Process batched messages
      batchedMessages.forEach(msg => onSendMessage(msg));
    },
    100 // 100ms batch window
  ), [onSendMessage]);

  // Load persisted messages on mount
  useEffect(() => {
    if (tableId) {
      const persisted = loadChatMessages(tableId);
      // Note: In a real implementation, you'd merge these with current messages
      // through a parent component or state management
    }
  }, [tableId]);

  // Save messages when they change
  useEffect(() => {
    if (tableId && messages.length > 0) {
      saveChatMessages(tableId, messages);
    }
  }, [messages, tableId]);

  // Pre-cache sanitized messages
  useEffect(() => {
    messages.forEach(message => {
      if (!messageCache.get(message.id)) {
        const sanitized = sanitizeMessage(message.message);
        messageCache.set(message.id, sanitized);
      }
    });
  }, [messages]);

  // Track unread messages when panel is collapsed
  useEffect(() => {
    if (isCollapsed && messages.length > lastMessageCountRef.current) {
      const newMessages = messages.length - lastMessageCountRef.current;
      setUnreadCount((prev) => prev + newMessages);
    }
    lastMessageCountRef.current = messages.length;
  }, [messages, isCollapsed]);

  // Clear unread count when panel is expanded
  useEffect(() => {
    if (!isCollapsed) {
      setUnreadCount(0);
    }
  }, [isCollapsed]);

  // Filter messages based on search
  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    
    const query = searchQuery.toLowerCase();
    return messages.filter(msg => 
      msg.message.toLowerCase().includes(query) ||
      msg.username.toLowerCase().includes(query)
    );
  }, [messages, searchQuery]);

  // Handle typing indicators
  const handleTypingStart = useCallback(() => {
    onTypingStart?.();
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      onTypingStop?.();
    }, 3000);
  }, [onTypingStart, onTypingStop]);

  const handleSendMessage = useCallback((message: string) => {
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTypingStop?.();

    // Check if it's a command
    const command = parseCommand(message);
    
    if (command) {
      if (command.command === 'help') {
        onSendMessage(`/help`);
      } else if (command.command === 'mute' || command.command === 'unmute') {
        const playerName = command.args?.[0];
        if (playerName) {
          onCommand?.(command);
        }
      } else if (command.command === 'block' || command.command === 'unblock') {
        const playerName = command.args?.[0];
        if (playerName) {
          onCommand?.(command);
        }
      } else {
        onCommand?.(command);
      }
    } else {
      // Use message batcher for regular messages
      messageBatcher.add(message);
    }
  }, [messageBatcher, onCommand, onSendMessage, onTypingStop]);

  const handlePlayerAction = (playerId: string, action: 'mute' | 'block' | 'report') => {
    switch (action) {
      case 'mute':
        const isMuted = moderationState.mutedPlayers.has(playerId);
        setModerationState((prev) => {
          const newMuted = new Set(prev.mutedPlayers);
          if (isMuted) {
            newMuted.delete(playerId);
          } else {
            newMuted.add(playerId);
          }
          return { ...prev, mutedPlayers: newMuted };
        });
        onMutePlayer?.(playerId);
        break;
        
      case 'block':
        const isBlocked = moderationState.blockedPlayers.has(playerId);
        setModerationState((prev) => {
          const newBlocked = new Set(prev.blockedPlayers);
          if (isBlocked) {
            newBlocked.delete(playerId);
          } else {
            newBlocked.add(playerId);
          }
          return { ...prev, blockedPlayers: newBlocked };
        });
        onBlockPlayer?.(playerId);
        break;
        
      case 'report':
        onSendMessage(`/report ${playerId}`);
        break;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      messageBatcher.flush();
    };
  }, [messageBatcher]);

  return (
    <div className={`flex flex-col bg-gray-800 border border-gray-600 rounded-lg ${className}`}>
      {/* Chat header */}
      <div className="px-3 py-2 bg-gray-700 rounded-t-lg border-b border-gray-600">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center space-x-2 text-white hover:text-gray-300 transition-colors"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand chat' : 'Collapse chat'}
            data-testid="chat-toggle"
          >
            <svg 
              className={`w-4 h-4 transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <h3 className="text-sm font-semibold">Table Chat</h3>
            {isCollapsed && unreadCount > 0 && (
              <UnreadIndicator count={unreadCount} />
            )}
          </button>
          
          <div className="flex items-center space-x-2">
            {!isCollapsed && (
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                aria-label="Search messages"
                data-testid="search-button"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                  />
                </svg>
              </button>
            )}
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-xs text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Chat content */}
      {!isCollapsed && (
        <>
          {/* Search bar */}
          {showSearch && (
            <SearchBar 
              onSearch={setSearchQuery}
              onClose={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
            />
          )}

          {/* Messages area */}
          <div className="flex-1 min-h-[200px] max-h-[400px]">
            <VirtualMessageList
              messages={filteredMessages}
              currentUserId={currentUserId}
              moderationState={moderationState}
              onPlayerAction={handlePlayerAction}
            />
          </div>

          {/* Typing indicator */}
          <TypingIndicator typingUsers={typingUsers} />

          {/* Input area */}
          <div className="p-3 border-t border-gray-600">
            <MessageInput
              onSendMessage={handleSendMessage}
              isConnected={isConnected}
              placeholder="Type a message or /help for commands..."
              maxLength={500}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default EnhancedChatPanel;