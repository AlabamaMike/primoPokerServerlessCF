import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { EmojiPickerProps } from './types';

// Split emojis into chunks for lazy loading
const EMOJI_CATEGORIES = {
  'Poker': ['♠️', '♥️', '♦️', '♣️', '🃏', '🎰', '💰', '🤑', '💵', '🏆'],
  'Reactions': ['😎', '😅', '😂', '🤔', '😮', '😤', '😭', '🙄', '😬', '🤯'],
  'Gestures': ['👍', '👎', '👏', '🙏', '💪', '✌️', '🤝', '👋', '🤞', '🤷'],
  'Fun': ['🔥', '💀', '🎉', '🎊', '⭐', '💯', '🚀', '💥', '❤️', '💔'],
  'More': ['😊', '😍', '🥳', '😱', '😴', '🤗', '🙃', '😇', '🤓', '😈']
};

// Frequently used emojis stored in localStorage
const RECENT_EMOJIS_KEY = 'poker-chat-recent-emojis';
const MAX_RECENT_EMOJIS = 10;

interface EmojiCategoryProps {
  category: string;
  emojis: string[];
  onSelect: (emoji: string) => void;
  isVisible: boolean;
}

const EmojiCategory: React.FC<EmojiCategoryProps> = React.memo(({ 
  category, 
  emojis, 
  onSelect,
  isVisible 
}) => {
  return (
    <div className="mb-3">
      <h3 className="text-xs text-gray-400 font-semibold mb-1 sticky top-0 bg-gray-800">
        {category}
      </h3>
      <div className="grid grid-cols-5 gap-1">
        {isVisible ? (
          emojis.map((emoji, index) => (
            <button
              key={`${category}-${index}`}
              onClick={() => onSelect(emoji)}
              className="p-2 text-xl hover:bg-gray-700 rounded transition-colors"
              data-testid={`emoji-${emoji}`}
            >
              {emoji}
            </button>
          ))
        ) : (
          // Placeholder while not visible
          emojis.map((_, index) => (
            <div
              key={`${category}-${index}-placeholder`}
              className="p-2 h-10 bg-gray-700 rounded animate-pulse"
            />
          ))
        )}
      </div>
    </div>
  );
});

EmojiCategory.displayName = 'EmojiCategory';

const LazyEmojiPicker: React.FC<EmojiPickerProps> = ({ 
  onSelect, 
  onClose,
  anchorEl 
}) => {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(new Set(['Recent', 'Poker']));
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load recent emojis from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (stored) {
      try {
        setRecentEmojis(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to parse recent emojis from localStorage:', err);
      }
    }
  }, []);

  // Calculate position based on anchor element
  const getPosition = () => {
    if (!anchorEl) return { top: 0, left: 0 };
    
    const rect = anchorEl.getBoundingClientRect();
    const pickerHeight = 350; // Approximate height
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

  // Intersection observer for lazy loading categories
  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const category = entry.target.getAttribute('data-category');
        if (category) {
          setVisibleCategories(prev => new Set(prev).add(category));
        }
      }
    });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(observerCallback, {
      root: pickerRef.current,
      rootMargin: '50px',
      threshold: 0.1
    });

    categoryRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [observerCallback]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: string) => {
    // Update recent emojis
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, MAX_RECENT_EMOJIS);
    setRecentEmojis(updated);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
    
    onSelect(emoji);
    onClose();
  }, [recentEmojis, onSelect, onClose]);

  // Filter emojis based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) {
      // Show recent emojis when not searching
      const categories: Record<string, string[]> = {};
      if (recentEmojis.length > 0) {
        categories['Recent'] = recentEmojis;
      }
      return { ...categories, ...EMOJI_CATEGORIES };
    }

    // Search through all emojis
    const filtered: Record<string, string[]> = {};
    Object.entries(EMOJI_CATEGORIES).forEach(([category, emojis]) => {
      const matchingEmojis = emojis.filter(emoji => 
        emoji.includes(searchQuery) || 
        category.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingEmojis.length > 0) {
        filtered[category] = matchingEmojis;
      }
    });
    
    return filtered;
  }, [searchQuery, recentEmojis]);

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
      {/* Search input */}
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search emojis..."
          className="w-full px-3 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          autoFocus
        />
      </div>

      {/* Emoji categories */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
        {Object.entries(filteredCategories).map(([category, emojis]) => (
          <div
            key={category}
            ref={(el) => {
              if (el) categoryRefs.current.set(category, el);
            }}
            data-category={category}
          >
            <EmojiCategory
              category={category}
              emojis={emojis}
              onSelect={handleEmojiSelect}
              isVisible={visibleCategories.has(category)}
            />
          </div>
        ))}
        
        {Object.keys(filteredCategories).length === 0 && (
          <div className="text-center text-gray-400 py-4">
            No emojis found
          </div>
        )}
      </div>
    </div>
  );
};

export default LazyEmojiPicker;