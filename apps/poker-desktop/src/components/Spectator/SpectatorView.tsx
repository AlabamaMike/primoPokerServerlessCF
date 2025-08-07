import React from 'react';
import PokerTable from '../PokerTable';
import SpectatorIndicator from './SpectatorIndicator';
import SpectatorControls from './SpectatorControls';
import SpectatorChat from './SpectatorChat';
import HiddenCards from './HiddenCards';
import type { ChatMessage } from '../Chat/types';

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

interface SpectatorViewProps {
  gameState: GameState;
  players: Player[];
  spectatorCount: number;
  messages: ChatMessage[];
  currentUserId: string;
  onLeave: () => void;
  onSendMessage: (message: string, channel: string) => void;
  className?: string;
}

const SpectatorView: React.FC<SpectatorViewProps> = ({
  gameState,
  players,
  spectatorCount,
  messages,
  currentUserId,
  onLeave,
  onSendMessage,
  className = ''
}) => {
  // Hide hole cards unless it's showdown phase
  const shouldShowCards = gameState.phase === 'showdown' || gameState.phase === 'finished';
  
  // Modify players to hide their cards if not in showdown
  const spectatorPlayers = players.map(player => ({
    ...player,
    cards: shouldShowCards ? player.cards : undefined
  }));

  return (
    <div 
      data-testid="spectator-view"
      className={`flex flex-col h-full bg-gray-900 ${className}`}
    >
      {/* Header with spectator indicator */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Spectator Mode</h2>
        <SpectatorIndicator size="medium" />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Game table area */}
        <div className="flex-1 flex flex-col">
          {/* Controls */}
          <SpectatorControls
            spectatorCount={spectatorCount}
            onLeave={onLeave}
            className="m-4"
          />

          {/* Poker table wrapper with custom rendering for hidden cards */}
          <div className="flex-1 relative" data-testid="poker-table">
            <PokerTable
              gameState={gameState}
              players={spectatorPlayers}
              showAllCards={false}
              className="h-full"
            />
            
            {/* Overlay hidden cards for players with cards */}
            {!shouldShowCards && players.map(player => {
              if (player.cards && player.cards.length > 0) {
                return (
                  <div
                    key={player.id}
                    className="absolute"
                    style={{
                      // Position based on player position
                      // This is simplified - in real app would calculate exact positions
                      top: player.position < 3 ? '20%' : '60%',
                      left: player.position % 3 === 0 ? '20%' : player.position % 3 === 1 ? '50%' : '80%',
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    <HiddenCards count={player.cards.length} />
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Spectator chat sidebar */}
        <div className="w-96 border-l border-gray-700">
          <SpectatorChat
            messages={messages}
            onSendMessage={onSendMessage}
            currentUserId={currentUserId}
            spectatorCount={spectatorCount}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
};

export default SpectatorView;