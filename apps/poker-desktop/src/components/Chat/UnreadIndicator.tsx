import React from 'react';
import { clsx } from 'clsx';
import { UnreadIndicatorProps } from './types';

export const UnreadIndicator: React.FC<UnreadIndicatorProps> = ({
  count,
  onClick,
  maxCount = 99,
  size = 'medium',
  color = 'red',
  position = 'top-right',
  animate = true,
  animationType = 'pulse',
  className,
}) => {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > maxCount ? `${maxCount}+` : count.toString();

  const sizeClasses = {
    small: 'w-4 h-4 text-xs',
    medium: 'w-6 h-6 text-sm',
    large: 'w-8 h-8 text-base',
  };

  const positionClasses = {
    'top-right': 'top-0 right-0',
    'top-left': 'top-0 left-0',
    'bottom-right': 'bottom-0 right-0',
    'bottom-left': 'bottom-0 left-0',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    bounce: 'animate-bounce',
  };

  const handleClick = onClick ? () => onClick() : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const ariaLabel =
    count === 1
      ? '1 unread message'
      : count > maxCount
      ? `More than ${maxCount} unread messages`
      : `${count} unread messages`;

  return (
    <div
      data-testid="unread-indicator"
      role="status"
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={clsx(
        'absolute flex items-center justify-center rounded-full font-bold text-white',
        sizeClasses[size],
        positionClasses[position],
        `bg-${color}-500`,
        animate && animationClasses[animationType],
        onClick && 'cursor-pointer hover:scale-110 transition-transform',
        className
      )}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {displayCount}
    </div>
  );
};