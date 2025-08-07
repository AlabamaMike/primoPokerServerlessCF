import React, { useEffect, useRef } from 'react';
import { PlayerActionsProps } from './types';

const PlayerActions: React.FC<PlayerActionsProps> = ({
  playerId,
  username,
  isMuted,
  isBlocked,
  onMute,
  onBlock,
  onReport,
  anchorEl,
  onClose
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position based on anchor element
  const getPosition = () => {
    if (!anchorEl) return { top: 0, left: 0 };
    
    const rect = anchorEl.getBoundingClientRect();
    const menuHeight = 150; // Approximate height
    const menuWidth = 200; // Approximate width
    
    let top = rect.bottom + 5;
    let left = rect.left;
    
    // Adjust if menu would go off screen
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 5;
    }
    
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
      ref={menuRef}
      className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-2 min-w-[180px]"
      style={{ top: position.top, left: position.left }}
      data-testid="player-actions-menu"
    >
      <div className="px-3 py-1 text-sm text-gray-400 border-b border-gray-700">
        {username}
      </div>
      
      <div className="py-1">
        <button
          onClick={() => {
            onMute();
            onClose();
          }}
          className="w-full px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors flex items-center space-x-2"
          data-testid="mute-button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
              />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" 
              />
            )}
          </svg>
          <span className="text-white">
            {isMuted ? 'Unmute' : 'Mute'} {username}
          </span>
        </button>

        <button
          onClick={() => {
            onBlock();
            onClose();
          }}
          className="w-full px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors flex items-center space-x-2"
          data-testid="block-button"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" 
            />
          </svg>
          <span className="text-white">
            {isBlocked ? 'Unblock' : 'Block'} {username}
          </span>
        </button>

        {onReport && (
          <>
            <div className="border-t border-gray-700 my-1"></div>
            <button
              onClick={() => {
                onReport();
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left hover:bg-gray-700 transition-colors flex items-center space-x-2"
              data-testid="report-button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" 
                />
              </svg>
              <span className="text-red-400">
                Report {username}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PlayerActions;