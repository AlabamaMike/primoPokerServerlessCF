import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { ChatPanelProps, ChatMessage, ReportData } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { PlayerActions } from './PlayerActions';
import { UnreadIndicator } from './UnreadIndicator';
import { getCommandHelp } from './ChatCommandParser';

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  onCommand,
  onMutePlayer,
  onBlockPlayer,
  isConnected,
  currentUserId,
  mutedPlayers,
  blockedPlayers,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlayerMenu, setActivePlayerMenu] = useState<{
    playerId: string;
    playerName: string;
    position: { x: number; y: number };
  } | null>(null);
  
  const lastMessageCountRef = useRef(messages.length);

  useEffect(() => {
    // Track unread messages when collapsed
    if (!isExpanded && messages.length > lastMessageCountRef.current) {
      const newMessages = messages.length - lastMessageCountRef.current;
      setUnreadCount((prev) => prev + newMessages);
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isExpanded]);

  useEffect(() => {
    // Clear unread count when expanded
    if (isExpanded) {
      setUnreadCount(0);
    }
  }, [isExpanded]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handlePlayerAction = (playerId: string, event: MouseEvent) => {
    const player = messages.find((m) => m.userId === playerId);
    if (!player) return;

    setActivePlayerMenu({
      playerId,
      playerName: player.username,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const handleCommand = (command: string, args?: string) => {
    if (command === 'help') {
      // Help command would display the help message
      // This would typically be handled by the parent component
      onCommand(command, args);
    } else {
      onCommand(command, args);
    }
  };

  const handleMutePlayer = (playerId: string) => {
    onMutePlayer(playerId);
    setActivePlayerMenu(null);
  };

  const handleBlockPlayer = (playerId: string) => {
    onBlockPlayer(playerId);
    setActivePlayerMenu(null);
  };

  const handleReportPlayer = (playerId: string, data: ReportData) => {
    // Report functionality would be implemented by parent
    console.log('Report player:', playerId, data);
    setActivePlayerMenu(null);
  };

  // Filter messages based on muted players (not blocked - those are hidden)
  const displayMessages = messages.map((msg) => {
    if (mutedPlayers.has(msg.userId) && msg.type === 'chat') {
      return {
        ...msg,
        message: '[Muted]',
      };
    }
    return msg;
  });

  return (
    <>
      <div
        data-testid="chat-panel"
        role="region"
        aria-label="Chat panel"
        className={clsx(
          'flex flex-col bg-gray-800 border border-gray-600 rounded-lg transition-all',
          isExpanded ? 'h-96' : 'h-12 collapsed',
          className
        )}
      >
        <div
          data-testid="chat-header"
          onClick={handleToggle}
          className={clsx(
            'px-4 py-2 bg-gray-700 rounded-t-lg cursor-pointer',
            'flex items-center justify-between',
            'hover:bg-gray-600 transition-colors'
          )}
        >
          <div className="flex items-center space-x-2">
            <h3 className="text-white font-semibold">Chat</h3>
            <div
              className={clsx(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-green-400' : 'bg-red-400'
              )}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            {!isExpanded && unreadCount > 0 && (
              <UnreadIndicator
                count={unreadCount}
                size="small"
                animate={true}
              />
            )}
            <span className="text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          </div>
        </div>

        {isExpanded && (
          <>
            <MessageList
              messages={displayMessages}
              currentUserId={currentUserId}
              blockedPlayers={blockedPlayers}
              onPlayerAction={handlePlayerAction}
              className="flex-1 min-h-0"
            />
            
            <div className="p-3 border-t border-gray-600">
              <MessageInput
                onSendMessage={onSendMessage}
                onCommand={handleCommand}
                isConnected={isConnected}
              />
            </div>
          </>
        )}
      </div>

      {activePlayerMenu && (
        <PlayerActions
          playerId={activePlayerMenu.playerId}
          playerName={activePlayerMenu.playerName}
          onMute={handleMutePlayer}
          onBlock={handleBlockPlayer}
          onReport={handleReportPlayer}
          onClose={() => setActivePlayerMenu(null)}
          isMuted={mutedPlayers.has(activePlayerMenu.playerId)}
          isBlocked={blockedPlayers.has(activePlayerMenu.playerId)}
          position={activePlayerMenu.position}
          confirmBeforeBlock={true}
        />
      )}
    </>
  );
};