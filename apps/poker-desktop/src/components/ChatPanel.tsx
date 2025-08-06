import React, { useState, useRef, useEffect } from 'react';
import { validators, validate } from '../utils/validation';

interface ChatMessage {
  username: string;
  message: string;
  isSystem: boolean;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  className?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  messages, 
  onSendMessage, 
  isConnected,
  className = '' 
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedMessage = inputMessage.trim();
    
    // Validate message
    const messageValidation = validate(
      trimmedMessage,
      validators.required('Message cannot be empty'),
      validators.maxLength(500, 'Message is too long (max 500 characters)')
    );
    
    if (!messageValidation.isValid) {
      // Could show error in UI, for now just prevent sending
      return;
    }
    
    if (trimmedMessage && isConnected) {
      onSendMessage(trimmedMessage);
      setInputMessage('');
      inputRef.current?.focus();
    }
  };

  const formatTime = (timestamp: Date = new Date()) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex flex-col bg-gray-800 border border-gray-600 rounded-lg ${className}`}>
      {/* Chat header */}
      <div className="px-3 py-2 bg-gray-700 rounded-t-lg border-b border-gray-600">
        <div className="flex items-center justify-between">
          <h3 className="text-white text-sm font-semibold">Table Chat</h3>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 p-3 overflow-y-auto max-h-48 min-h-[120px]" data-testid="chat-messages">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-sm text-center py-4">
            No messages yet. Say hello to the table!
          </div>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`mb-2 text-sm ${msg.isSystem ? 'text-yellow-400 italic' : 'text-white'}`}
            >
              <span className="text-gray-400 text-xs mr-2">
                {formatTime()}
              </span>
              {msg.isSystem ? (
                <span>{msg.message}</span>
              ) : (
                <>
                  <span className="text-blue-300 font-semibold">{msg.username}:</span>
                  <span className="ml-1">{msg.message}</span>
                </>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-600">
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={isConnected ? "Type a message..." : "Not connected"}
            disabled={!isConnected}
            className="flex-1 px-3 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            maxLength={200}
            data-testid="chat-input"
          />
          <button
            type="submit"
            disabled={!isConnected || !inputMessage.trim()}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="chat-send-button"
          >
            Send
          </button>
        </div>
        {!isConnected && (
          <div className="text-red-400 text-xs mt-1">
            Chat unavailable - WebSocket not connected
          </div>
        )}
      </form>
    </div>
  );
};

export default ChatPanel;