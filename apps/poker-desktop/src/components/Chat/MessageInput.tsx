import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { MessageInputProps } from './types';
import { parseChatCommand, isValidCommand, getCommandSuggestions, validateCommandArgs } from './ChatCommandParser';

// Placeholder for emoji picker - will be replaced with actual implementation
const EmojiPicker: React.FC<{ onSelect: (emoji: string) => void }> = ({ onSelect }) => {
  return (
    <div data-testid="emoji-picker" className="absolute bottom-full mb-2 bg-gray-800 border border-gray-600 rounded-lg p-2">
      <div className="grid grid-cols-5 gap-1">
        {['😀', '👍', '❤️', '😂', '🎉'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onCommand,
  isConnected,
  maxLength = 500,
  multiline = false,
  className,
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Handle click outside emoji picker
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Update command suggestions
    if (message.startsWith('/')) {
      const commandPart = message.slice(1).split(' ')[0];
      const suggestions = getCommandSuggestions(commandPart);
      setCommandSuggestions(suggestions);
      setShowCommandSuggestions(suggestions.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowCommandSuggestions(false);
    }
  }, [message]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || !isConnected) return;

    // Check if it's a command
    const command = parseChatCommand(trimmedMessage);
    if (command && isValidCommand(command.command)) {
      const validation = validateCommandArgs(command.command, command.args);
      if (validation.valid) {
        onCommand(command.command, command.args);
        setMessage('');
        return;
      }
      // Invalid command args - send as regular message
    }

    // Regular message
    onSendMessage(trimmedMessage);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommandSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => 
          (prev + 1) % commandSuggestions.length
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => 
          (prev - 1 + commandSuggestions.length) % commandSuggestions.length
        );
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selectedCommand = commandSuggestions[selectedSuggestionIndex];
        if (selectedCommand) {
          setMessage(`/${selectedCommand} `);
          setShowCommandSuggestions(false);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      handleSend();
    }

    if (e.key === 'Escape') {
      setShowEmojiPicker(false);
      setShowCommandSuggestions(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const input = inputRef.current;
    if (!input) return;

    const start = (input as HTMLInputElement | HTMLTextAreaElement).selectionStart || message.length;
    const end = (input as HTMLInputElement | HTMLTextAreaElement).selectionEnd || message.length;
    
    const newMessage = message.slice(0, start) + emoji + message.slice(end);
    setMessage(newMessage);
    setShowEmojiPicker(false);
    
    // Focus and set cursor position after emoji
    setTimeout(() => {
      input.focus();
      const newPosition = start + emoji.length;
      (input as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleCommandSuggestionClick = (command: string) => {
    setMessage(`/${command} `);
    setShowCommandSuggestions(false);
    inputRef.current?.focus();
  };

  const charCount = message.length;
  const isNearLimit = charCount > maxLength * 0.9;

  const InputComponent = multiline ? 'textarea' : 'input';

  return (
    <div className={clsx('relative', className)}>
      {showCommandSuggestions && (
        <div 
          data-testid="command-suggestions"
          className="absolute bottom-full mb-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg"
        >
          {commandSuggestions.map((cmd, index) => (
            <div
              key={cmd}
              role="option"
              aria-selected={index === selectedSuggestionIndex}
              onClick={() => handleCommandSuggestionClick(cmd)}
              className={clsx(
                'px-3 py-2 cursor-pointer transition-colors',
                index === selectedSuggestionIndex
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              )}
            >
              /{cmd}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end space-x-2">
        <div className="flex-1 relative">
          <InputComponent
            ref={inputRef as React.RefObject<HTMLInputElement> & React.RefObject<HTMLTextAreaElement>}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? 'Type a message...' : 'Not connected'}
            disabled={!isConnected}
            className={clsx(
              'w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600',
              'focus:outline-none focus:border-blue-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              multiline && 'resize-none'
            )}
            maxLength={maxLength}
            rows={multiline ? 3 : undefined}
            data-testid="chat-input"
            aria-label="Chat message input"
          />
          
          <div className="absolute right-2 bottom-2 flex items-center space-x-2">
            <span
              data-testid="char-count"
              className={clsx(
                'text-xs',
                isNearLimit ? 'text-yellow-400 warning' : 'text-gray-400'
              )}
              aria-live="polite"
              aria-label={`${maxLength - charCount} characters remaining`}
            >
              {charCount} / {maxLength}
            </span>
          </div>
        </div>

        <div className="relative" ref={emojiPickerRef}>
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={!isConnected}
            className={clsx(
              'p-2 rounded transition-colors',
              'hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            data-testid="emoji-button"
            aria-label="Open emoji picker"
          >
            😊
          </button>
          
          {showEmojiPicker && (
            <EmojiPicker onSelect={handleEmojiSelect} />
          )}
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!isConnected || !message.trim()}
          className={clsx(
            'px-4 py-2 bg-blue-600 text-white rounded',
            'hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors'
          )}
          data-testid="send-button"
          aria-label="Send message"
        >
          Send
        </button>
      </div>

      {!isConnected && (
        <div className="text-red-400 text-sm mt-1">
          Chat unavailable - not connected
        </div>
      )}
    </div>
  );
};