import React, { useEffect, useRef } from 'react';
import { EmojiPickerProps } from './types';

// Common poker and gaming emojis
const EMOJI_CATEGORIES = {
  'Poker': ['♠️', '♥️', '♦️', '♣️', '🃏', '🎰', '💰', '🤑', '💵', '🏆'],
  'Reactions': ['😎', '😅', '😂', '🤔', '😮', '😤', '😭', '🙄', '😬', '🤯'],
  'Gestures': ['👍', '👎', '👏', '🙏', '💪', '✌️', '🤝', '👋', '🤞', '🤷'],
  'Fun': ['🔥', '💀', '🎉', '🎊', '⭐', '💯', '🚀', '💥', '❤️', '💔']
};

const EmojiPicker: React.FC<EmojiPickerProps> = ({ 
  onSelect, 
  onClose,
  anchorEl 
}) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  // Calculate position based on anchor element
  const getPosition = () => {
    if (!anchorEl) return { top: 0, left: 0 };
    
    const rect = anchorEl.getBoundingClientRect();
    const pickerHeight = 300; // Approximate height
    const pickerWidth = 280; // Approximate width
    
    let top = rect.bottom + 5;
    let left = rect.left;
    
    // Adjust if picker would go off screen
    if (top + pickerHeight > window.innerHeight) {
      top = rect.top - pickerHeight - 5;
    }
    
    if (left + pickerWidth > window.innerWidth) {
      left = window.innerWidth - pickerWidth - 10;
    }
    
    return { top, left };
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!anchorEl) return null;

  const position = getPosition();

  return (
    <div
      ref={pickerRef}
      className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 p-3"
      style={{ top: position.top, left: position.left }}
      data-testid="emoji-picker"
    >
      <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
          <div key={category} className="mb-3">
            <h3 className="text-xs text-gray-400 font-semibold mb-1 sticky top-0 bg-gray-800">
              {category}
            </h3>
            <div className="grid grid-cols-5 gap-1">
              {emojis.map((emoji, index) => (
                <button
                  key={`${category}-${index}`}
                  onClick={() => {
                    onSelect(emoji);
                    onClose();
                  }}
                  className="p-2 text-xl hover:bg-gray-700 rounded transition-colors"
                  data-testid={`emoji-${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;