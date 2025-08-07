import React from 'react';

interface SpectatorControlsProps {
  spectatorCount: number;
  onLeave: () => void;
  className?: string;
  disabled?: boolean;
}

const SpectatorControls: React.FC<SpectatorControlsProps> = ({ 
  spectatorCount, 
  onLeave, 
  className = '',
  disabled = false
}) => {
  return (
    <div 
      data-testid="spectator-controls"
      className={`flex items-center justify-between bg-gray-800 p-4 rounded-lg ${className}`}
    >
      <div className="flex items-center gap-2 text-gray-300" aria-label={`${spectatorCount} ${spectatorCount === 1 ? 'spectator' : 'spectators'} watching`}>
        <svg 
          data-testid="spectator-count-icon"
          className="w-5 h-5" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
        </svg>
        <span className="font-medium" role="status">
          {spectatorCount} {spectatorCount === 1 ? 'spectator' : 'spectators'}
        </span>
      </div>
      
      <button
        onClick={onLeave}
        disabled={disabled}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        aria-label="Leave spectating"
      >
        Leave Spectating
      </button>
    </div>
  );
};

export default SpectatorControls;