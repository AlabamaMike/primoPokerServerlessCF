import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SpectatorView from './SpectatorView';
import type { ChatMessage } from '../Chat/types';

describe('SpectatorView', () => {
  const mockGameState = {
    tableId: 'table-123',
    gameId: 'game-456',
    phase: 'flop' as const,
    pot: 100,
    communityCards: [
      { suit: 'hearts' as const, rank: 'A' },
      { suit: 'diamonds' as const, rank: 'K' },
      { suit: 'clubs' as const, rank: 'Q' }
    ],
    currentBet: 20,
    minRaise: 40,
    activePlayerId: 'player1',
    dealerId: 'player2',
    smallBlindId: 'player3',
    bigBlindId: 'player1',
    handNumber: 42
  };

  const mockPlayers = [
    {
      id: 'player1',
      username: 'Alice',
      chips: 1000,
      currentBet: 20,
      position: 0,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      status: 'active',
      cards: [
        { suit: 'hearts' as const, rank: '10' },
        { suit: 'spades' as const, rank: 'J' }
      ]
    },
    {
      id: 'player2',
      username: 'Bob',
      chips: 800,
      currentBet: 0,
      position: 1,
      isActive: false,
      isFolded: false,
      isAllIn: false,
      status: 'waiting'
    }
  ];

  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      username: 'Spectator1',
      userId: 'spec1',
      message: 'Nice hand!',
      timestamp: new Date(),
      isSystem: false,
      channel: 'spectator'
    }
  ];

  const mockOnLeave = vi.fn();
  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    mockOnLeave.mockClear();
    mockOnSendMessage.mockClear();
  });

  it('should render poker table for spectators', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    // Should render poker table
    const pokerTables = screen.getAllByTestId('poker-table');
    expect(pokerTables.length).toBeGreaterThan(0);
  });

  it('should hide player hole cards before showdown', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    // Should show hidden cards instead of actual cards
    expect(screen.queryAllByTestId('hidden-card')).toHaveLength(2); // For player1 who has cards
  });

  it('should show player hole cards during showdown', () => {
    const showdownState = { ...mockGameState, phase: 'showdown' as const };
    
    render(
      <SpectatorView
        gameState={showdownState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    // Should show actual cards during showdown
    expect(screen.queryAllByTestId('hidden-card')).toHaveLength(0);
  });

  it('should render spectator indicator', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByTestId('spectator-indicator')).toBeInTheDocument();
  });

  it('should render spectator controls', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByTestId('spectator-controls')).toBeInTheDocument();
    expect(screen.getByText('5 spectators')).toBeInTheDocument();
  });

  it('should render spectator chat', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    expect(screen.getByTestId('spectator-chat')).toBeInTheDocument();
  });

  it('should call onLeave when leave button clicked', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    const leaveButton = screen.getByRole('button', { name: /leave/i });
    fireEvent.click(leaveButton);
    expect(mockOnLeave).toHaveBeenCalledTimes(1);
  });

  it('should not allow any game actions', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
      />
    );

    // Should not find any action buttons
    expect(screen.queryByText(/fold/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/call/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raise/i)).not.toBeInTheDocument();
  });

  it('should apply additional className', () => {
    render(
      <SpectatorView
        gameState={mockGameState}
        players={mockPlayers}
        spectatorCount={5}
        messages={mockMessages}
        currentUserId="spec1"
        onLeave={mockOnLeave}
        onSendMessage={mockOnSendMessage}
        className="custom-class"
      />
    );

    const container = screen.getByTestId('spectator-view');
    expect(container).toHaveClass('custom-class');
  });
});