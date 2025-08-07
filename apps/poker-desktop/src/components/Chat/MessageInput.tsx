import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { MessageInputProps } from './types';
import { getCommandSuggestions } from './utils/chatCommands';
import EmojiPicker from './EmojiPicker';

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  isConnected,
  placeholder = "Type a message...",
  maxLength = 500
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Update command suggestions as user types
  useEffect(() => {
    const suggestions = getCommandSuggestions(message);
    setCommandSuggestions(suggestions);
    setSelectedSuggestion(0);
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !isConnected) return;
    
    onSendMessage(trimmedMessage);
    setMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (commandSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestion((prev) => 
            prev > 0 ? prev - 1 : commandSuggestions.length - 1
          );
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestion((prev) => 
            (prev + 1) % commandSuggestions.length
          );
          break;
          
        case 'Tab':
          e.preventDefault();
          if (commandSuggestions[selectedSuggestion]) {
            setMessage(commandSuggestions[selectedSuggestion] + ' ');
          }
          break;
      }
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const cursorPos = inputRef.current?.selectionStart || message.length;
    const newMessage = 
      message.slice(0, cursorPos) + emoji + message.slice(cursorPos);
    
    setMessage(newMessage);
    
    // Set cursor position after emoji
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = cursorPos + emoji.length;
        inputRef.current.setSelectionRange(newPos, newPos);
        inputRef.current.focus();
      }
    }, 0);
  };

  const remainingChars = maxLength - message.length;
  const showCharWarning = remainingChars < 50;

  return (
    <div className="relative">
      {/* Command suggestions */}
      {commandSuggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600 rounded shadow-lg">
          {commandSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              onClick={() => setMessage(suggestion + ' ')}
              className={`
                block w-full px-3 py-1 text-sm text-left
                ${index === selectedSuggestion 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700'
                }
              `}
              data-testid={`suggestion-${suggestion}`}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? placeholder : "Not connected"}
            disabled={!isConnected}
            maxLength={maxLength}
            className="
              w-full px-3 py-2 pr-10
              bg-gray-700 text-white text-sm rounded
              border border-gray-600
              focus:outline-none focus:border-blue-500
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            data-testid="chat-input"
          />
          
          {/* Character count */}
          {message.length > 0 && (
            <span 
              className={`
                absolute right-2 top-1/2 transform -translate-y-1/2
                text-xs
                ${showCharWarning ? 'text-yellow-400' : 'text-gray-500'}
              `}
              data-testid="char-count"
            >
              {remainingChars}
            </span>
          )}
        </div>

        {/* Emoji button */}
        <button
          ref={emojiButtonRef}
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={!isConnected}
          className="
            p-2 text-gray-400 hover:text-white
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
          aria-label="Open emoji picker"
          data-testid="emoji-button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={!isConnected || !message.trim()}
          className="
            px-4 py-2
            bg-blue-600 text-white text-sm rounded
            hover:bg-blue-700
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          "
          data-testid="send-button"
        >
          Send
        </button>
      </form>

      {/* Connection warning */}
      {!isConnected && (
        <div className="text-red-400 text-xs mt-1">
          Chat unavailable - Not connected
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <EmojiPicker
          anchorEl={emojiButtonRef.current}
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  );
};

export default MessageInput;