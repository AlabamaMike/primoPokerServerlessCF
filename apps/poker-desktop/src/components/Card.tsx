import React from 'react';

interface CardProps {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const Card: React.FC<CardProps> = ({ 
  suit, 
  rank, 
  faceDown = false, 
  size = 'medium',
  className = '' 
}) => {
  const sizeClasses = {
    small: 'w-8 h-12 text-xs',
    medium: 'w-12 h-16 text-sm',
    large: 'w-16 h-24 text-base'
  };

  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  const suitColors = {
    hearts: 'text-red-600',
    diamonds: 'text-red-600',
    clubs: 'text-black',
    spades: 'text-black'
  };

  if (faceDown) {
    return (
      <div 
        className={`
          ${sizeClasses[size]} 
          bg-blue-800 
          border-2 
          border-white 
          rounded-lg 
          flex 
          items-center 
          justify-center 
          shadow-md
          ${className}
        `}
        data-testid="card-face-down"
      >
        <div className="text-white text-xs">🂠</div>
      </div>
    );
  }

  return (
    <div 
      className={`
        ${sizeClasses[size]} 
        bg-white 
        border-2 
        border-gray-300 
        rounded-lg 
        flex 
        flex-col 
        items-center 
        justify-between 
        p-1 
        shadow-md
        ${className}
      `}
      data-testid={`card-${suit}-${rank}`}
    >
      <div className={`font-bold ${suitColors[suit]}`}>
        {rank}
      </div>
      <div className={`text-xl ${suitColors[suit]}`}>
        {suitSymbols[suit]}
      </div>
      <div className={`font-bold ${suitColors[suit]} transform rotate-180`}>
        {rank}
      </div>
    </div>
  );
};

export default Card;