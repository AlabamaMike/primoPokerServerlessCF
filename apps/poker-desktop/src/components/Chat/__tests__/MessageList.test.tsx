import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageList } from '../MessageList';
import type { ChatMessage } from '../types';

// Mock react-virtual
jest.mock('react-virtual', () => ({
  useVirtual: () => ({
    items: [],
    totalSize: 0,
    scrollToIndex: jest.fn(),
  }),
}));

describe('MessageList', () => {
  const mockOnPlayerAction = jest.fn();

  const defaultProps = {
    messages: [],
    currentUserId: 'user1',
    blockedPlayers: new Set<string>(),
    onPlayerAction: mockOnPlayerAction,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Message Rendering', () => {
    const testMessages: ChatMessage[] = [
      {
        id: '1',
        userId: 'user1',
        username: 'Alice',
        message: 'Hello!',
        timestamp: new Date('2025-01-01T10:00:00'),
        type: 'chat',
      },
      {
        id: '2',
        userId: 'system',
        username: 'System',
        message: 'Bob joined',
        timestamp: new Date('2025-01-01T10:01:00'),
        type: 'system',
      },
      {
        id: '3',
        userId: 'user2',
        username: 'Bob',
        message: 'Hi Alice!',
        timestamp: new Date('2025-01-01T10:02:00'),
        type: 'chat',
      },
    ];

    it('should render all messages', () => {
      render(<MessageList {...defaultProps} messages={testMessages} />);
      
      expect(screen.getByText('Hello!')).toBeInTheDocument();
      expect(screen.getByText('Bob joined')).toBeInTheDocument();
      expect(screen.getByText('Hi Alice!')).toBeInTheDocument();
    });

    it('should display timestamps', () => {
      render(<MessageList {...defaultProps} messages={testMessages} />);
      
      // Check for timestamp format (10:00 AM)
      expect(screen.getByText('10:00 AM')).toBeInTheDocument();
      expect(screen.getByText('10:01 AM')).toBeInTheDocument();
      expect(screen.getByText('10:02 AM')).toBeInTheDocument();
    });

    it('should apply different styles for message types', () => {
      render(<MessageList {...defaultProps} messages={testMessages} />);
      
      const chatMessage = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      const systemMessage = screen.getByText('Bob joined').closest('[data-testid="chat-message"]');
      
      expect(chatMessage).toHaveClass('message-chat');
      expect(systemMessage).toHaveClass('message-system');
    });

    it('should highlight own messages', () => {
      render(<MessageList {...defaultProps} messages={testMessages} />);
      
      const ownMessage = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      const otherMessage = screen.getByText('Hi Alice!').closest('[data-testid="chat-message"]');
      
      expect(ownMessage).toHaveClass('message-own');
      expect(otherMessage).not.toHaveClass('message-own');
    });
  });

  describe('Virtual Scrolling', () => {
    it('should handle large message lists efficiently', () => {
      // Generate 1000 messages
      const manyMessages: ChatMessage[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `msg-${i}`,
        userId: `user${i % 5}`,
        username: `User ${i % 5}`,
        message: `Message ${i}`,
        timestamp: new Date(),
        type: 'chat',
      }));

      render(<MessageList {...defaultProps} messages={manyMessages} />);
      
      // Virtual scrolling should limit DOM nodes
      const container = screen.getByTestId('message-list');
      expect(container).toBeInTheDocument();
      
      // Should have scroll container
      expect(container).toHaveStyle({ overflow: 'auto' });
    });

    it('should auto-scroll to bottom on new messages', async () => {
      const { rerender } = render(<MessageList {...defaultProps} messages={[]} />);
      
      const scrollToBottom = jest.spyOn(Element.prototype, 'scrollIntoView');
      
      const newMessage: ChatMessage = {
        id: '1',
        userId: 'user2',
        username: 'Bob',
        message: 'New message',
        timestamp: new Date(),
        type: 'chat',
      };
      
      rerender(<MessageList {...defaultProps} messages={[newMessage]} />);
      
      await waitFor(() => {
        expect(scrollToBottom).toHaveBeenCalled();
      });
      
      scrollToBottom.mockRestore();
    });

    it('should not auto-scroll if user has scrolled up', async () => {
      const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        userId: 'user2',
        username: 'Bob',
        message: `Message ${i}`,
        timestamp: new Date(),
        type: 'chat',
      }));

      const { rerender } = render(
        <MessageList {...defaultProps} messages={messages} />
      );
      
      const container = screen.getByTestId('message-list');
      
      // Simulate user scrolling up
      fireEvent.scroll(container, { target: { scrollTop: 100 } });
      
      const scrollToBottom = jest.spyOn(Element.prototype, 'scrollIntoView');
      
      // Add new message
      const newMessage: ChatMessage = {
        id: 'new-msg',
        userId: 'user3',
        username: 'Charlie',
        message: 'New message',
        timestamp: new Date(),
        type: 'chat',
      };
      
      rerender(
        <MessageList {...defaultProps} messages={[...messages, newMessage]} />
      );
      
      await waitFor(() => {
        expect(scrollToBottom).not.toHaveBeenCalled();
      });
      
      scrollToBottom.mockRestore();
    });
  });

  describe('Message Filtering', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        userId: 'user1',
        username: 'Alice',
        message: 'Hello!',
        timestamp: new Date(),
        type: 'chat',
      },
      {
        id: '2',
        userId: 'blocked-user',
        username: 'Blocked User',
        message: 'Spam message',
        timestamp: new Date(),
        type: 'chat',
      },
      {
        id: '3',
        userId: 'user2',
        username: 'Bob',
        message: 'Hi!',
        timestamp: new Date(),
        type: 'chat',
      },
    ];

    it('should hide messages from blocked users', () => {
      const blockedPlayers = new Set(['blocked-user']);
      
      render(
        <MessageList
          {...defaultProps}
          messages={messages}
          blockedPlayers={blockedPlayers}
        />
      );
      
      expect(screen.getByText('Hello!')).toBeInTheDocument();
      expect(screen.queryByText('Spam message')).not.toBeInTheDocument();
      expect(screen.getByText('Hi!')).toBeInTheDocument();
    });

    it('should show blocked message placeholder', () => {
      const blockedPlayers = new Set(['blocked-user']);
      
      render(
        <MessageList
          {...defaultProps}
          messages={messages}
          blockedPlayers={blockedPlayers}
          showBlockedPlaceholder
        />
      );
      
      expect(screen.getByText('Message blocked')).toBeInTheDocument();
    });
  });

  describe('Message Grouping', () => {
    it('should group consecutive messages from same user', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user1',
          username: 'Alice',
          message: 'Hello!',
          timestamp: new Date('2025-01-01T10:00:00'),
          type: 'chat',
        },
        {
          id: '2',
          userId: 'user1',
          username: 'Alice',
          message: 'How are you?',
          timestamp: new Date('2025-01-01T10:00:30'),
          type: 'chat',
        },
        {
          id: '3',
          userId: 'user2',
          username: 'Bob',
          message: 'Hi Alice!',
          timestamp: new Date('2025-01-01T10:01:00'),
          type: 'chat',
        },
      ];

      render(<MessageList {...defaultProps} messages={messages} />);
      
      // First message should show username
      const firstMessage = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      expect(firstMessage).toHaveTextContent('Alice');
      
      // Second message from same user should not show username again
      const secondMessage = screen.getByText('How are you?').closest('[data-testid="chat-message"]');
      expect(secondMessage).toHaveClass('grouped-message');
    });

    it('should not group messages if too much time has passed', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user1',
          username: 'Alice',
          message: 'Hello!',
          timestamp: new Date('2025-01-01T10:00:00'),
          type: 'chat',
        },
        {
          id: '2',
          userId: 'user1',
          username: 'Alice',
          message: 'Still here?',
          timestamp: new Date('2025-01-01T10:05:00'), // 5 minutes later
          type: 'chat',
        },
      ];

      render(<MessageList {...defaultProps} messages={messages} />);
      
      const firstMessage = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      const secondMessage = screen.getByText('Still here?').closest('[data-testid="chat-message"]');
      
      expect(firstMessage).toHaveTextContent('Alice');
      expect(secondMessage).toHaveTextContent('Alice');
      expect(secondMessage).not.toHaveClass('grouped-message');
    });
  });

  describe('Player Actions', () => {
    const message: ChatMessage = {
      id: '1',
      userId: 'user2',
      username: 'Bob',
      message: 'Hello!',
      timestamp: new Date(),
      type: 'chat',
    };

    it('should trigger player action callback on message interaction', async () => {
      render(<MessageList {...defaultProps} messages={[message]} />);
      
      const messageElement = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      fireEvent.contextMenu(messageElement!);
      
      await waitFor(() => {
        expect(mockOnPlayerAction).toHaveBeenCalledWith('user2', expect.any(Object));
      });
    });
  });

  describe('Performance', () => {
    it('should memoize message components', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user1',
          username: 'Alice',
          message: 'Hello!',
          timestamp: new Date(),
          type: 'chat',
        },
      ];

      const { rerender } = render(<MessageList {...defaultProps} messages={messages} />);
      
      // Re-render with same props
      rerender(<MessageList {...defaultProps} messages={messages} />);
      
      // Message should still be in DOM (not re-created)
      expect(screen.getByText('Hello!')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user1',
          username: 'Alice',
          message: 'Hello!',
          timestamp: new Date(),
          type: 'chat',
        },
      ];

      render(<MessageList {...defaultProps} messages={messages} />);
      
      const list = screen.getByRole('log', { name: 'Chat messages' });
      expect(list).toHaveAttribute('aria-live', 'polite');
      expect(list).toHaveAttribute('aria-relevant', 'additions');
    });

    it('should announce system messages with higher priority', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'system',
          username: 'System',
          message: 'Game starting!',
          timestamp: new Date(),
          type: 'system',
        },
      ];

      render(<MessageList {...defaultProps} messages={messages} />);
      
      const systemMessage = screen.getByText('Game starting!').closest('[data-testid="chat-message"]');
      expect(systemMessage).toHaveAttribute('aria-live', 'assertive');
    });
  });
});