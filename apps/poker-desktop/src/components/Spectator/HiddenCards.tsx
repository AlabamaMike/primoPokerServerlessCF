import React from 'react';

interface HiddenCardsProps {
  count?: number;
  className?: string;
}

const HiddenCards: React.FC<HiddenCardsProps> = ({ count = 2, className = '' }) => {
  return (
    <div 
      data-testid="hidden-cards-container" 
      className={`flex gap-1 ${className}`}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          data-testid="hidden-card"
          className="card-back w-16 h-20 bg-gradient-to-br from-blue-900 to-blue-700 rounded-md border border-gray-700 shadow-lg flex items-center justify-center"
        >
          <div className="w-14 h-18 border-2 border-blue-600 rounded-sm bg-blue-800/50" />
        </div>
      ))}
    </div>
  );
};

export default HiddenCards;