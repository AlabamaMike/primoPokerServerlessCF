import React, { useState, useEffect } from 'react';
import PokerTable from './PokerTable';

const GameTableDemo: React.FC = () => {
  const [gameState, setGameState] = useState({
    tableId: 'demo-table-123',
    gameId: 'demo-game-456',
    phase: 'flop' as const,
    pot: 450,
    communityCards: [
      { suit: 'hearts' as const, rank: 'A' },
      { suit: 'diamonds' as const, rank: 'K' },
      { suit: 'clubs' as const, rank: 'Q' }
    ],
    currentBet: 50,
    minRaise: 50,
    activePlayerId: 'player-2',
    dealerId: 'player-1',
    smallBlindId: 'player-2',
    bigBlindId: 'player-3',  
    handNumber: 12
  });

  const [players, setPlayers] = useState([
    {
      id: 'player-1',
      username: 'Alice',
      chips: 1250,
      currentBet: 50,
      position: 1,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active',
      cards: [
        { suit: 'spades' as const, rank: 'A' },
        { suit: 'hearts' as const, rank: 'K' }
      ]
    },
    {
      id: 'player-2',
      username: 'Bob',
      chips: 950,
      currentBet: 50,
      position: 3,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active'
    },
    {
      id: 'player-3',
      username: 'Charlie',
      chips: 1580,
      currentBet: 100,
      position: 6,
      isActive: false,
      isFolded: false,
      isAllIn: false,
      status: 'active'
    },
    {
      id: 'player-4',
      username: 'Diana',
      chips: 0,
      currentBet: 800,
      position: 8,
      isActive: false,
      isFolded: false,
      isAllIn: true,
      status: 'all_in'
    },
    {
      id: 'player-5',
      username: 'Eve',
      chips: 750,
      currentBet: 0,
      position: 4,
      isActive: false,
      isFolded: true,
      isAllIn: false,
      status: 'folded'
    }
  ]);

  const [currentUserId, setCurrentUserId] = useState('player-1');
  const [autoProgress, setAutoProgress] = useState(false);

  // Auto-progress demo
  useEffect(() => {
    if (!autoProgress) return;

    const interval = setInterval(() => {
      setGameState(prev => {
        const phases = ['pre_flop', 'flop', 'turn', 'river', 'showdown'] as const;
        const currentIndex = phases.indexOf(prev.phase as any);
        const nextPhase = phases[currentIndex + 1] || phases[0];
        
        let newCommunityCards = [...prev.communityCards];
        
        // Add cards as we progress through phases
        if (nextPhase === 'flop' && newCommunityCards.length === 0) {
          newCommunityCards = [
            { suit: 'hearts', rank: 'A' },
            { suit: 'diamonds', rank: 'K' },
            { suit: 'clubs', rank: 'Q' }
          ];
        } else if (nextPhase === 'turn' && newCommunityCards.length === 3) {
          newCommunityCards.push({ suit: 'spades', rank: 'J' });
        } else if (nextPhase === 'river' && newCommunityCards.length === 4) {
          newCommunityCards.push({ suit: 'hearts', rank: '10' });
        } else if (nextPhase === 'pre_flop') {
          newCommunityCards = [];
        }

        return {
          ...prev,
          phase: nextPhase,
          communityCards: newCommunityCards,
          pot: prev.pot + Math.floor(Math.random() * 200),
          handNumber: nextPhase === 'pre_flop' ? prev.handNumber + 1 : prev.handNumber
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [autoProgress]);

  const handlePlayerAction = (action: string, amount?: number) => {
    console.log(`Player action: ${action}`, amount ? `Amount: ${amount}` : '');
    
    // Simulate action handling
    if (action === 'fold') {
      setPlayers(prev => prev.map(p => 
        p.id === currentUserId ? { ...p, isFolded: true, status: 'folded' } : p
      ));
    } else if (action === 'call' || action === 'raise') {
      const callAmount = amount || gameState.currentBet;
      setPlayers(prev => prev.map(p => 
        p.id === currentUserId ? { 
          ...p, 
          currentBet: callAmount,
          chips: Math.max(0, p.chips - callAmount)
        } : p
      ));
    }
    
    // Move to next player
    const currentPlayerIndex = players.findIndex(p => p.id === gameState.activePlayerId);
    const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    const nextPlayer = players[nextPlayerIndex];
    
    setGameState(prev => ({
      ...prev,
      activePlayerId: nextPlayer.id
    }));
  };

  const handleSitDown = (position: number) => {
    console.log(`Sitting down at position ${position}`);
    // Add a new player
    const newPlayer = {
      id: `player-${Date.now()}`,
      username: `Player${position}`,
      chips: 1000,
      currentBet: 0,
      position,
      isActive: false,
      isFolded: false,
      isAllIn: false,
      status: 'active'
    };
    
    setPlayers(prev => [...prev, newPlayer]);
  };

  const switchUser = (userId: string) => {
    setCurrentUserId(userId);
  };

  const resetDemo = () => {
    setGameState(prev => ({
      ...prev,
      phase: 'pre_flop',
      pot: 30,
      communityCards: [],
      currentBet: 20,
      handNumber: prev.handNumber + 1
    }));
    
    setPlayers(prev => prev.map(p => ({
      ...p,
      isFolded: false,
      isAllIn: p.id === 'player-4',
      currentBet: p.position <= 2 ? 20 : 0,
      status: p.id === 'player-4' ? 'all_in' : 'active'
    })));
  };

  return (
    <div className="min-h-screen bg-green-900 p-4">
      {/* Demo controls */}
      <div className="mb-4 bg-black bg-opacity-50 rounded-lg p-4">
        <h1 className="text-white text-xl font-bold mb-4">🃏 Poker Table Demo</h1>
        
        <div className="flex flex-wrap gap-4 items-center text-white">
          <div className="flex items-center space-x-2">
            <label className="text-sm">View as:</label>
            <select 
              value={currentUserId} 
              onChange={(e) => switchUser(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded"
            >
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.username}</option>
              ))}
            </select>
          </div>
          
          <button
            onClick={() => setAutoProgress(!autoProgress)}
            className={`px-3 py-1 rounded text-sm ${
              autoProgress ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {autoProgress ? 'Stop Auto' : 'Auto Progress'}
          </button>
          
          <button
            onClick={resetDemo}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Reset Hand
          </button>
          
          <div className="text-sm">
            Phase: <span className="font-bold">{gameState.phase}</span> | 
            Hand: <span className="font-bold">#{gameState.handNumber}</span>
          </div>
        </div>
      </div>

      {/* Poker table */}
      <PokerTable
        gameState={gameState}
        players={players}
        currentUserId={currentUserId}
        onPlayerAction={handlePlayerAction}
        onSitDown={handleSitDown}
        showAllCards={false}
      />
      
      {/* Player info */}
      <div className="mt-4 bg-black bg-opacity-50 rounded-lg p-4">
        <h3 className="text-white font-bold mb-2">Players at Table:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-white text-sm">
          {players.map(player => (
            <div 
              key={player.id} 
              className={`p-2 rounded ${
                player.id === currentUserId ? 'bg-blue-600' : 'bg-gray-700'
              } ${
                player.id === gameState.activePlayerId ? 'ring-2 ring-yellow-400' : ''
              }`}
            >
              <div className="font-semibold">{player.username} (Seat {player.position})</div>
              <div>Chips: ${player.chips}</div>
              <div>Bet: ${player.currentBet}</div>
              <div>Status: {player.status}</div>
              {player.isFolded && <div className="text-red-400">FOLDED</div>}
              {player.isAllIn && <div className="text-yellow-400">ALL IN</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GameTableDemo;