import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../Chat/types';

interface SpectatorChatProps {
  messages: ChatMessage[];
  onSendMessage: (message: string, channel: string) => void;
  currentUserId: string;
  spectatorCount?: number;
  className?: string;
  disabled?: boolean;
}

const SpectatorChat: React.FC<SpectatorChatProps> = ({ 
  messages, 
  onSendMessage, 
  currentUserId, 
  spectatorCount,
  className = '',
  disabled = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !disabled) {
      onSendMessage(inputValue.trim(), 'spectator');
      setInputValue('');
    }
  };

  // Filter messages to show only spectator channel messages
  const spectatorMessages = messages.filter(msg => 
    msg.channel === 'spectator'
  );

  return (
    <div 
      data-testid="spectator-chat"
      className={`flex flex-col bg-gray-900 rounded-lg h-full ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white">Spectator Chat</h3>
          {spectatorCount !== undefined && (
            <span className="text-sm text-gray-400">({spectatorCount} watching)</span>
          )}
        </div>
        <div 
          data-testid="spectator-channel-indicator"
          className="px-2 py-1 bg-amber-600/20 text-amber-400 text-xs rounded-full"
        >
          Spectators Only
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {spectatorMessages.map((message) => (
          <div 
            key={message.id} 
            className={`flex flex-col ${message.userId === currentUserId ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span>{message.username}</span>
              <span>•</span>
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
            <div 
              className={`max-w-[80%] px-3 py-2 rounded-lg ${
                message.isSystem 
                  ? 'bg-gray-700 text-gray-300 italic' 
                  : message.userId === currentUserId 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-gray-700 text-gray-100'
              }`}
            >
              {message.message}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Notice */}
      <div className="px-4 py-2 bg-gray-800/50 border-t border-gray-700">
        <p className="text-xs text-gray-400 text-center">
          Spectators only can see these messages
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Chat with other spectators..."
          disabled={disabled}
          className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amber-600"
          maxLength={200}
        />
      </form>
    </div>
  );
};

export default SpectatorChat;