import React from 'react';
import { UnreadIndicatorProps } from './types';

const UnreadIndicator: React.FC<UnreadIndicatorProps> = ({ 
  count, 
  onClick,
  className = ''
}) => {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center justify-center
        min-w-[20px] h-5 px-1
        bg-red-500 text-white text-xs font-bold
        rounded-full
        hover:bg-red-600 transition-colors
        animate-pulse
        ${className}
      `}
      aria-label={`${count} unread messages`}
      data-testid="unread-indicator"
    >
      {displayCount}
    </button>
  );
};

export default UnreadIndicator;