import React from 'react';

interface SpectatorIndicatorProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

const SpectatorIndicator: React.FC<SpectatorIndicatorProps> = ({ 
  className = '', 
  size = 'medium' 
}) => {
  const sizeClasses = {
    small: 'text-xs px-2 py-1',
    medium: 'text-sm px-3 py-1.5',
    large: 'text-base px-4 py-2'
  };

  return (
    <div 
      data-testid="spectator-indicator"
      className={`spectator-badge inline-flex items-center gap-1.5 bg-amber-600 text-white rounded-full font-semibold ${sizeClasses[size]} ${className}`}
    >
      <svg 
        data-testid="spectator-icon"
        className="w-4 h-4" 
        fill="currentColor" 
        viewBox="0 0 20 20"
      >
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
      </svg>
      <span>SPECTATOR</span>
    </div>
  );
};

export default SpectatorIndicator;