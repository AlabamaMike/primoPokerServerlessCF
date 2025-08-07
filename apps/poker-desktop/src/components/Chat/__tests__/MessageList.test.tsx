import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageList from '../MessageList';
import { ChatMessage, PlayerModerationState } from '../types';

describe('MessageList', () => {
  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      username: 'Alice',
      userId: 'user1',
      message: 'Hello!',
      timestamp: new Date('2024-01-01T10:00:00'),
      isSystem: false
    },
    {
      id: '2',
      username: 'Bob',
      userId: 'user2',
      message: 'Hi there!',
      timestamp: new Date('2024-01-01T10:05:00'),
      isSystem: false
    },
    {
      id: '3',
      username: 'System',
      userId: 'system',
      message: 'Charlie joined',
      timestamp: new Date('2024-01-01T10:10:00'),
      isSystem: true
    }
  ];

  const mockModerationState: PlayerModerationState = {
    mutedPlayers: new Set<string>(),
    blockedPlayers: new Set<string>()
  };

  const mockProps = {
    messages: mockMessages,
    currentUserId: 'user1',
    moderationState: mockModerationState,
    onPlayerAction: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all messages', () => {
    render(<MessageList {...mockProps} />);
    
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
    expect(screen.getByText('Charlie joined')).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    render(<MessageList {...mockProps} messages={[]} />);
    
    expect(screen.getByText('No messages yet. Say hello to the table!')).toBeInTheDocument();
  });

  it('highlights current user messages', () => {
    render(<MessageList {...mockProps} />);
    
    const aliceUsername = screen.getAllByTestId('message-username')[0];
    const bobUsername = screen.getAllByTestId('message-username')[1];
    
    expect(aliceUsername).toHaveClass('text-blue-400'); // Current user
    expect(bobUsername).toHaveClass('text-blue-300'); // Other user
  });

  it('hides blocked player messages', () => {
    const moderationWithBlocked = {
      ...mockModerationState,
      blockedPlayers: new Set(['user2'])
    };
    
    render(<MessageList {...mockProps} moderationState={moderationWithBlocked} />);
    
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.queryByText('Hi there!')).not.toBeInTheDocument();
  });

  it('shows muted indicator for muted players', () => {
    const moderationWithMuted = {
      ...mockModerationState,
      mutedPlayers: new Set(['user2'])
    };
    
    render(<MessageList {...mockProps} moderationState={moderationWithMuted} />);
    
    expect(screen.getByText('[muted]')).toBeInTheDocument();
    expect(screen.queryByText('Hi there!')).not.toBeInTheDocument();
  });

  it('opens player action menu on username click', () => {
    render(<MessageList {...mockProps} />);
    
    const bobUsername = screen.getAllByTestId('message-username')[1];
    fireEvent.click(bobUsername);
    
    expect(screen.getByTestId('player-context-menu')).toBeInTheDocument();
    expect(screen.getByText('Mute Bob')).toBeInTheDocument();
    expect(screen.getByText('Block Bob')).toBeInTheDocument();
  });

  it('does not show action menu for current user', () => {
    render(<MessageList {...mockProps} />);
    
    const aliceUsername = screen.getAllByTestId('message-username')[0];
    fireEvent.click(aliceUsername);
    
    expect(screen.queryByTestId('player-context-menu')).not.toBeInTheDocument();
  });

  it('formats message timestamps', () => {
    render(<MessageList {...mockProps} />);
    
    // Check that timestamps are displayed
    const timestamps = screen.getAllByText(/\d{1,2}:\d{2}/);
    expect(timestamps.length).toBeGreaterThan(0);
  });

  it('auto-scrolls to bottom on new messages', () => {
    const scrollIntoViewMock = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    
    const { rerender } = render(<MessageList {...mockProps} />);
    
    const newMessages = [...mockMessages, {
      id: '4',
      username: 'Dave',
      userId: 'user4',
      message: 'New message!',
      timestamp: new Date(),
      isSystem: false
    }];
    
    rerender(<MessageList {...mockProps} messages={newMessages} />);
    
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('shows scroll to bottom button when scrolled up', () => {
    render(<MessageList {...mockProps} />);
    
    const container = screen.getByTestId('message-list');
    
    // Simulate scrolling up
    fireEvent.scroll(container, { target: { scrollTop: 0 } });
    
    const scrollButton = screen.getByTestId('scroll-to-bottom');
    expect(scrollButton).toBeInTheDocument();
    
    // Click to scroll to bottom
    fireEvent.click(scrollButton);
    expect(container.scrollIntoView).toBeDefined();
  });
});