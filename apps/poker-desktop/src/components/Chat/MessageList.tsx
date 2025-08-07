import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MessageListProps, ChatMessage } from './types';

interface MessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  isMuted: boolean;
  onPlayerClick?: (e: React.MouseEvent, playerId: string, username: string) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isCurrentUser,
  isMuted,
  onPlayerClick
}) => {
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const content = isMuted ? <span className="italic text-gray-500">[muted]</span> : message.message;

  return (
    <div 
      className={`
        mb-2 text-sm
        ${message.isSystem ? 'text-yellow-400 italic text-center' : ''}
        ${message.isCommand ? 'text-green-400' : ''}
      `}
      data-testid="chat-message"
    >
      <span className="text-gray-400 text-xs mr-2">
        {formatTime(message.timestamp)}
      </span>
      {message.isSystem ? (
        <span>{content}</span>
      ) : (
        <>
          <button
            className={`
              font-semibold hover:underline cursor-pointer
              ${isCurrentUser ? 'text-blue-400' : 'text-blue-300'}
            `}
            onClick={(e) => onPlayerClick?.(e, message.userId, message.username)}
            data-testid="message-username"
          >
            {message.username}
          </button>
          <span className="text-white">:</span>
          <span className="ml-1 text-white">{content}</span>
        </>
      )}
    </div>
  );
};

const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  moderationState,
  onPlayerAction
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    playerId: string;
    username: string;
    x: number;
    y: number;
  } | null>(null);

  // Filter out blocked messages
  const filteredMessages = useMemo(() => {
    return messages.filter(message => !moderationState.blockedPlayers.has(message.userId));
  }, [messages, moderationState.blockedPlayers]);

  // Group messages by time intervals (5 minutes)
  const groupedMessages = useMemo(() => {
    const groups: { time: string; messages: ChatMessage[] }[] = [];
    let currentGroup: ChatMessage[] = [];
    let lastTime: Date | null = null;

    filteredMessages.forEach(msg => {
      const msgTime = new Date(msg.timestamp);
      
      if (!lastTime || msgTime.getTime() - lastTime.getTime() > 5 * 60 * 1000) {
        if (currentGroup.length > 0) {
          groups.push({
            time: lastTime!.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            messages: currentGroup
          });
        }
        currentGroup = [msg];
        lastTime = msgTime;
      } else {
        currentGroup.push(msg);
      }
    });

    if (currentGroup.length > 0 && lastTime) {
      groups.push({
        time: lastTime.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        messages: currentGroup
      });
    }

    return groups;
  }, [filteredMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages, autoScroll]);

  // Check if user has scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
    
    setAutoScroll(isAtBottom);
  };

  const handlePlayerClick = (e: React.MouseEvent, playerId: string, username: string) => {
    e.preventDefault();
    
    if (playerId === currentUserId) {
      return; // Don't show actions for self
    }

    setContextMenu({
      playerId,
      username,
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleContextMenuAction = (action: 'mute' | 'block' | 'report') => {
    if (contextMenu) {
      onPlayerAction?.(contextMenu.playerId, action);
      setContextMenu(null);
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenu) {
      const handleClickOutside = () => setContextMenu(null);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  return (
    <div className="relative h-full">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="overflow-y-auto h-full p-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
        data-testid="message-list"
      >
        {filteredMessages.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-8">
            No messages yet. Say hello to the table!
          </div>
        ) : (
          <>
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex}>
                {group.messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isCurrentUser={message.userId === currentUserId}
                    isMuted={moderationState.mutedPlayers.has(message.userId)}
                    onPlayerClick={handlePlayerClick}
                  />
                ))}
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-2 right-2 p-2 bg-gray-700 text-white rounded-full shadow-lg hover:bg-gray-600 transition-colors"
          aria-label="Scroll to bottom"
          data-testid="scroll-to-bottom"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="player-context-menu"
        >
          <button
            onClick={() => handleContextMenuAction('mute')}
            className="block w-full px-4 py-2 text-sm text-white hover:bg-gray-700 text-left"
          >
            {moderationState.mutedPlayers.has(contextMenu.playerId) ? 'Unmute' : 'Mute'} {contextMenu.username}
          </button>
          <button
            onClick={() => handleContextMenuAction('block')}
            className="block w-full px-4 py-2 text-sm text-white hover:bg-gray-700 text-left"
          >
            {moderationState.blockedPlayers.has(contextMenu.playerId) ? 'Unblock' : 'Block'} {contextMenu.username}
          </button>
          <button
            onClick={() => handleContextMenuAction('report')}
            className="block w-full px-4 py-2 text-sm text-red-400 hover:bg-gray-700 text-left"
          >
            Report {contextMenu.username}
          </button>
        </div>
      )}
    </div>
  );
};

export default MessageList;