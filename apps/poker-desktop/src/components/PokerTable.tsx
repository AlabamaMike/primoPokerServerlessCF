import React from 'react';
import Card from './Card';
import PlayerSeat from './PlayerSeat';

interface GameState {
  tableId: string;
  gameId: string;
  phase: 'waiting' | 'pre_flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
  pot: number;
  communityCards: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string }>;
  currentBet: number;
  minRaise: number;
  activePlayerId?: string;
  dealerId: string;
  smallBlindId: string;
  bigBlindId: string;
  handNumber: number;
}

interface Player {
  id: string;
  username: string;
  chips: number;
  currentBet: number;
  position: number;
  isActive: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  status: string;
  cards?: Array<{ suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string }>;
}

interface PokerTableProps {
  gameState: GameState;
  players: Player[];
  currentUserId?: string;
  onPlayerAction?: (action: string, amount?: number) => void;
  onSitDown?: (position: number) => void;
  showAllCards?: boolean;
  className?: string;
}

const PokerTable: React.FC<PokerTableProps> = ({
  gameState,
  players,
  currentUserId,
  onPlayerAction,
  onSitDown,
  showAllCards = false,
  className = ''
}) => {
  const formatChips = (chips: number): string => {
    if (chips >= 1000000) return `${(chips / 1000000).toFixed(1)}M`;
    if (chips >= 1000) return `${(chips / 1000).toFixed(1)}K`;
    return chips.toString();
  };

  const getPhaseDisplay = (phase: string): string => {
    switch (phase) {
      case 'waiting': return 'Waiting for players';
      case 'pre_flop': return 'Pre-flop';
      case 'flop': return 'Flop';
      case 'turn': return 'Turn';
      case 'river': return 'River';
      case 'showdown': return 'Showdown';
      case 'finished': return 'Hand finished';
      default: return phase;
    }
  };

  // Position players around the table (9-max)
  const seatPositions = [
    { top: '10%', left: '50%', transform: 'translateX(-50%)' }, // Seat 1 (top)
    { top: '20%', left: '80%', transform: 'translateX(-50%)' }, // Seat 2 (top right)
    { top: '50%', left: '85%', transform: 'translateX(-50%)' }, // Seat 3 (right)
    { top: '80%', left: '80%', transform: 'translateX(-50%)' }, // Seat 4 (bottom right)
    { top: '90%', left: '65%', transform: 'translateX(-50%)' }, // Seat 5 (bottom right center)
    { top: '90%', left: '35%', transform: 'translateX(-50%)' }, // Seat 6 (bottom left center)
    { top: '80%', left: '20%', transform: 'translateX(-50%)' }, // Seat 7 (bottom left)
    { top: '50%', left: '15%', transform: 'translateX(-50%)' }, // Seat 8 (left)
    { top: '20%', left: '20%', transform: 'translateX(-50%)' }, // Seat 9 (top left)
  ];

  const getPlayerAtPosition = (position: number): Player | undefined => {
    return players.find(p => p.position === position);
  };

  const currentPlayer = currentUserId ? players.find(p => p.id === currentUserId) : undefined;
  const isCurrentPlayerTurn = gameState.activePlayerId === currentUserId;

  const availableActions = isCurrentPlayerTurn ? ['fold', 'check', 'call', 'raise'] : [];

  return (
    <div className={`relative w-full h-full min-h-[600px] bg-green-800 rounded-xl p-8 ${className}`} data-testid="poker-table">
      {/* Table surface */}
      <div className="absolute inset-8 bg-green-700 rounded-full border-4 border-yellow-600 shadow-inner">
        
        {/* Community cards area */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="flex space-x-2 mb-4" data-testid="community-cards">
            {Array.from({ length: 5 }).map((_, index) => {
              const card = gameState.communityCards[index];
              return (
                <div key={index} className="w-12 h-16">
                  {card ? (
                    <Card suit={card.suit} rank={card.rank} />
                  ) : (
                    <div className="w-12 h-16 border-2 border-dashed border-gray-400 rounded-lg opacity-30" />
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Pot */}
          <div className="text-center">
            <div className="bg-yellow-400 text-black px-4 py-2 rounded-full text-lg font-bold shadow-lg">
              Pot: ${formatChips(gameState.pot)}
            </div>
            <div className="text-white text-sm mt-1">
              {getPhaseDisplay(gameState.phase)} - Hand #{gameState.handNumber}
            </div>
          </div>
        </div>

        {/* Player seats */}
        {seatPositions.map((pos, index) => {
          const seatNumber = index + 1;
          const player = getPlayerAtPosition(seatNumber);
          
          return (
            <div
              key={seatNumber}
              className="absolute"
              style={pos}
            >
              <PlayerSeat
                position={seatNumber}
                player={player}
                isDealer={player?.id === gameState.dealerId}
                isSmallBlind={player?.id === gameState.smallBlindId}
                isBigBlind={player?.id === gameState.bigBlindId}
                isCurrentPlayer={player?.id === gameState.activePlayerId}
                showCards={showAllCards || player?.id === currentUserId}
                onSitDown={() => onSitDown?.(seatNumber)}
              />
            </div>
          );
        })}
      </div>

      {/* Action buttons (if it's current player's turn) */}
      {isCurrentPlayerTurn && onPlayerAction && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2" data-testid="action-buttons">
          <button
            onClick={() => onPlayerAction('fold')}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            data-testid="fold-button"
          >
            Fold
          </button>
          {gameState.currentBet === 0 ? (
            <button
              onClick={() => onPlayerAction('check')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              data-testid="check-button"
            >
              Check
            </button>
          ) : (
            <button
              onClick={() => onPlayerAction('call', gameState.currentBet)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              data-testid="call-button"
            >
              Call ${gameState.currentBet}
            </button>
          )}
          <button
            onClick={() => onPlayerAction('raise', gameState.currentBet + gameState.minRaise)}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            data-testid="raise-button"
          >
            Raise
          </button>
        </div>
      )}

      {/* Game info overlay */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 text-white p-3 rounded-lg text-sm">
        <div>Table: {gameState.tableId.slice(0, 8)}...</div>
        <div>Players: {players.length}/9</div>
        <div>Phase: {getPhaseDisplay(gameState.phase)}</div>
        {gameState.currentBet > 0 && <div>Current bet: ${gameState.currentBet}</div>}
      </div>

      {/* Waiting message */}
      {gameState.phase === 'waiting' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-75 text-white p-6 rounded-lg text-center">
          <h2 className="text-xl font-bold mb-2">Waiting for players...</h2>
          <p>Need at least 2 players to start the game</p>
        </div>
      )}
    </div>
  );
};

export default PokerTable;