import React, { useEffect, useRef, useState, memo } from 'react';
import { clsx } from 'clsx';
import { MessageListProps, ChatMessage } from './types';

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
};

const shouldGroupMessages = (prevMsg: ChatMessage | null, currMsg: ChatMessage): boolean => {
  if (!prevMsg || prevMsg.userId !== currMsg.userId) return false;
  if (prevMsg.type !== 'chat' || currMsg.type !== 'chat') return false;
  
  // Group messages within 2 minutes
  const timeDiff = currMsg.timestamp.getTime() - prevMsg.timestamp.getTime();
  return timeDiff < 2 * 60 * 1000;
};

interface MessageItemProps {
  message: ChatMessage;
  isOwn: boolean;
  isGrouped: boolean;
  isBlocked: boolean;
  showBlockedPlaceholder?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const MessageItem = memo<MessageItemProps>(({ 
  message, 
  isOwn, 
  isGrouped,
  isBlocked,
  showBlockedPlaceholder,
  onContextMenu 
}) => {
  if (isBlocked && !showBlockedPlaceholder) {
    return null;
  }

  if (isBlocked && showBlockedPlaceholder) {
    return (
      <div
        data-testid="chat-message"
        className="px-3 py-1 text-gray-500 italic text-sm"
      >
        Message blocked
      </div>
    );
  }

  const isSystem = message.type === 'system';

  return (
    <div
      data-testid="chat-message"
      onContextMenu={onContextMenu}
      className={clsx(
        'px-3 py-1 group',
        isOwn && 'message-own',
        isGrouped && 'grouped-message',
        isSystem ? 'message-system' : 'message-chat'
      )}
      aria-live={isSystem ? 'assertive' : 'polite'}
    >
      <div className="flex items-start space-x-2">
        <span className="text-xs text-gray-400 flex-shrink-0">
          {formatTime(message.timestamp)}
        </span>
        
        <div className="flex-1">
          {!isGrouped && !isSystem && (
            <span className={clsx(
              'font-semibold mr-1',
              isOwn ? 'text-blue-400' : 'text-green-400'
            )}>
              {message.username}:
            </span>
          )}
          
          <span className={clsx(
            isSystem ? 'text-yellow-400 italic' : 'text-white'
          )}>
            {message.message}
          </span>
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  blockedPlayers,
  onPlayerAction,
  showBlockedPlaceholder = false,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const lastMessageCountRef = useRef(messages.length);

  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const isAtBottom = 
        container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      
      setIsUserScrolled(!isAtBottom);
    };

    containerRef.current.addEventListener('scroll', handleScroll);
    return () => containerRef.current?.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom if user hasn't scrolled up
    if (!isUserScrolled && messages.length > lastMessageCountRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isUserScrolled]);

  const handleContextMenu = (userId: string, event: React.MouseEvent) => {
    if (userId === currentUserId || userId === 'system') return;
    event.preventDefault();
    onPlayerAction?.(userId, event.nativeEvent);
  };

  return (
    <div
      ref={containerRef}
      data-testid="message-list"
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions"
      className={clsx(
        'flex-1 overflow-auto',
        className
      )}
      style={{ overflow: 'auto' }}
    >
      {messages.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          No messages yet
        </div>
      ) : (
        <>
          {messages.map((message, index) => {
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const isGrouped = shouldGroupMessages(prevMessage, message);
            const isOwn = message.userId === currentUserId;
            const isBlocked = blockedPlayers.has(message.userId);

            return (
              <MessageItem
                key={message.id}
                message={message}
                isOwn={isOwn}
                isGrouped={isGrouped}
                isBlocked={isBlocked}
                showBlockedPlaceholder={showBlockedPlaceholder}
                onContextMenu={(e) => handleContextMenu(message.userId, e)}
              />
            );
          })}
        </>
      )}
      <div ref={endRef} />
    </div>
  );
};