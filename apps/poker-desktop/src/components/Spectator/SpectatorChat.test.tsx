import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SpectatorChat from './SpectatorChat';
import type { ChatMessage } from '../Chat/types';

describe('SpectatorChat', () => {
  const mockOnSendMessage = vi.fn();
  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      username: 'Spectator1',
      userId: 'spec1',
      message: 'Nice hand!',
      timestamp: new Date('2024-01-01T10:00:00'),
      isSystem: false,
      channel: 'spectator'
    },
    {
      id: '2',
      username: 'System',
      userId: 'system',
      message: 'Spectator2 joined',
      timestamp: new Date('2024-01-01T10:01:00'),
      isSystem: true,
      channel: 'spectator'
    }
  ];

  beforeEach(() => {
    mockOnSendMessage.mockClear();
  });

  it('should render spectator chat header', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
      />
    );
    expect(screen.getByText('Spectator Chat')).toBeInTheDocument();
  });

  it('should display spectator channel indicator', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
      />
    );
    const indicator = screen.getByTestId('spectator-channel-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent('Spectators Only');
  });

  it('should render messages in spectator channel', () => {
    render(
      <SpectatorChat 
        messages={mockMessages} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
      />
    );
    expect(screen.getByText('Nice hand!')).toBeInTheDocument();
    expect(screen.getByText('Spectator2 joined')).toBeInTheDocument();
  });

  it('should send message with spectator channel', async () => {
    const user = userEvent.setup();
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
      />
    );

    const input = screen.getByPlaceholderText(/chat with other spectators/i);
    await user.type(input, 'Great game!');
    await user.keyboard('{Enter}');

    expect(mockOnSendMessage).toHaveBeenCalledWith('Great game!', 'spectator');
  });

  it('should apply additional className', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
        className="custom-class"
      />
    );
    const container = screen.getByTestId('spectator-chat');
    expect(container).toHaveClass('custom-class');
  });

  it('should show spectator count when provided', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
        spectatorCount={5}
      />
    );
    expect(screen.getByText('(5 watching)')).toBeInTheDocument();
  });

  it('should disable input when disabled prop is true', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
        disabled={true}
      />
    );
    const input = screen.getByPlaceholderText(/chat with other spectators/i);
    expect(input).toBeDisabled();
  });

  it('should show "Spectators only can see these messages" notice', () => {
    render(
      <SpectatorChat 
        messages={[]} 
        onSendMessage={mockOnSendMessage}
        currentUserId="spec1"
      />
    );
    expect(screen.getByText(/spectators only can see these messages/i)).toBeInTheDocument();
  });
});