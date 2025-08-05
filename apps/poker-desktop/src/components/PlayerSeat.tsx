import React from 'react';
import Card from './Card';

interface PlayerSeatProps {
  position: number;
  player?: {
    id: string;
    username: string;
    chips: number;
    currentBet: number;
    isActive: boolean;
    isFolded: boolean;
    isAllIn: boolean;
    status: string;
    cards?: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string }>;
  };
  isDealer?: boolean;
  isSmallBlind?: boolean;
  isBigBlind?: boolean;
  onSitDown?: () => void;
  showCards?: boolean;
  isCurrentPlayer?: boolean;
  className?: string;
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({
  position,
  player,
  isDealer = false,
  isSmallBlind = false,
  isBigBlind = false,
  onSitDown,
  showCards = false,
  isCurrentPlayer = false,
  className = ''
}) => {
  const isEmpty = !player;

  const formatChips = (chips: number): string => {
    if (chips >= 1000000) return `${(chips / 1000000).toFixed(1)}M`;
    if (chips >= 1000) return `${(chips / 1000).toFixed(1)}K`;
    return chips.toString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'playing':
        return 'border-green-500 bg-green-50';
      case 'folded':
        return 'border-gray-400 bg-gray-100 opacity-60';
      case 'all_in':
        return 'border-yellow-500 bg-yellow-50';
      case 'away':
        return 'border-orange-400 bg-orange-50';
      case 'sitting_out':
        return 'border-red-400 bg-red-50';
      default:
        return 'border-gray-300 bg-white';
    }
  };

  if (isEmpty) {
    return (
      <div 
        className={`
          relative 
          w-24 h-20 
          border-2 
          border-dashed 
          border-gray-300 
          rounded-lg 
          flex 
          flex-col 
          items-center 
          justify-center 
          cursor-pointer 
          hover:border-blue-400 
          hover:bg-blue-50 
          transition-colors
          ${className}
        `}
        onClick={onSitDown}
        data-testid={`empty-seat-${position}`}
      >
        <div className="text-gray-400 text-xs">Seat {position}</div>
        <div className="text-gray-400 text-xs">Sit Down</div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Player cards */}
      {player.cards && showCards && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 flex space-x-1">
          {player.cards.map((card, index) => (
            <Card
              key={index}
              suit={card.suit}
              rank={card.rank}
              size="small"
            />
          ))}
        </div>
      )}

      {/* Player info */}
      <div 
        className={`
          w-24 h-20 
          border-2 
          rounded-lg 
          flex 
          flex-col 
          items-center 
          justify-center 
          relative
          ${getStatusColor(player.status)}
          ${isCurrentPlayer ? 'ring-2 ring-blue-500' : ''}
        `}
        data-testid={`player-seat-${position}`}
      >
        {/* Dealer button */}
        {isDealer && (
          <div 
            className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 border-2 border-white rounded-full flex items-center justify-center text-xs font-bold"
            data-testid="dealer-button"
          >
            D
          </div>
        )}

        {/* Blind indicators */}
        {isSmallBlind && (
          <div 
            className="absolute -top-1 -left-1 w-4 h-4 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs"
            data-testid="small-blind"
          >
            S
          </div>
        )}
        {isBigBlind && (
          <div 
            className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
            data-testid="big-blind"
          >
            B
          </div>
        )}

        {/* Player name */}
        <div className="text-xs font-semibold truncate w-full text-center px-1">
          {player.username}
        </div>
        
        {/* Chip count */}
        <div className="text-xs text-gray-600">
          ${formatChips(player.chips)}
        </div>

        {/* Current bet */}
        {player.currentBet > 0 && (
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 bg-yellow-400 text-black text-xs px-2 py-1 rounded-full">
            ${player.currentBet}
          </div>
        )}

        {/* Status indicators */}
        {player.isFolded && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-50 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">FOLDED</span>
          </div>
        )}
        
        {player.isAllIn && (
          <div className="absolute inset-0 bg-yellow-500 bg-opacity-50 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">ALL IN</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerSeat;