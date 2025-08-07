import React, { useState, useEffect, useRef } from 'react';
import { ChatPanelProps, ChatMessage, PlayerModerationState } from './types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import UnreadIndicator from './UnreadIndicator';
import { parseCommand, formatCommandHelp } from './utils/chatCommands';

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  onCommand,
  onMutePlayer,
  onBlockPlayer,
  currentUserId,
  isConnected,
  className = ''
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [moderationState, setModerationState] = useState<PlayerModerationState>({
    mutedPlayers: new Set<string>(),
    blockedPlayers: new Set<string>()
  });
  const lastMessageCountRef = useRef(messages.length);

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

  const handleSendMessage = (message: string) => {
    // Check if it's a command
    const command = parseCommand(message);
    
    if (command) {
      if (command.command === 'help') {
        // Show help as a system message
        // Help command is handled by sending /help to parent
        // Send help message as a system message through parent component
        // Help command is handled by sending /help to parent
        // Notify parent to add this system message
        onSendMessage(`/help`);
      } else if (command.command === 'mute' || command.command === 'unmute') {
        // Handle local mute commands
        const playerName = command.args?.[0];
        if (playerName) {
          // Handle mute/unmute through parent component
          onCommand?.(command);
        }
      } else if (command.command === 'block' || command.command === 'unblock') {
        // Handle local block commands
        const playerName = command.args?.[0];
        if (playerName) {
          // Handle block/unblock through parent component
          onCommand?.(command);
        }
      } else {
        // Pass other commands to parent
        onCommand?.(command);
      }
    } else {
      // Regular message
      onSendMessage(message);
    }
  };

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
        // Handle report action
        // TODO: Implement report functionality
        // For now, send as a system message
        onSendMessage(`/report ${playerId}`);
        break;
    }
  };

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
          {/* Messages area */}
          <div className="flex-1 min-h-[200px] max-h-[400px]">
            <MessageList
              messages={messages}
              currentUserId={currentUserId}
              moderationState={moderationState}
              onPlayerAction={handlePlayerAction}
            />
          </div>

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

export default ChatPanel;