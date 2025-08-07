import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '../ChatPanel';
import type { ChatMessage } from '../types';

describe('Chat Integration Tests', () => {
  const mockOnSendMessage = jest.fn();
  const mockOnCommand = jest.fn();
  const mockOnMutePlayer = jest.fn();
  const mockOnBlockPlayer = jest.fn();

  const defaultProps = {
    messages: [],
    onSendMessage: mockOnSendMessage,
    onCommand: mockOnCommand,
    onMutePlayer: mockOnMutePlayer,
    onBlockPlayer: mockOnBlockPlayer,
    isConnected: true,
    currentUserId: 'user1',
    mutedPlayers: new Set<string>(),
    blockedPlayers: new Set<string>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Chat Flow', () => {
    it('should handle complete chat workflow', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChatPanel {...defaultProps} />);

      // 1. Open chat panel
      const header = screen.getByTestId('chat-header');
      await user.click(header);

      // 2. Send a message
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello everyone!');
      await user.click(screen.getByTestId('send-button'));

      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello everyone!');

      // 3. Simulate receiving messages
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user1',
          username: 'Alice',
          message: 'Hello everyone!',
          timestamp: new Date(),
          type: 'chat',
        },
        {
          id: '2',
          userId: 'user2',
          username: 'Bob',
          message: 'Hi Alice!',
          timestamp: new Date(),
          type: 'chat',
        },
      ];

      rerender(<ChatPanel {...defaultProps} messages={messages} />);

      // 4. Messages should be displayed
      expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
      expect(screen.getByText('Hi Alice!')).toBeInTheDocument();

      // 5. Use command
      await user.clear(input);
      await user.type(input, '/fold');
      await user.keyboard('{Enter}');

      expect(mockOnCommand).toHaveBeenCalledWith('fold', undefined);
    });

    it('should handle player moderation workflow', async () => {
      const user = userEvent.setup();
      
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user2',
          username: 'Bob',
          message: 'Spam message!',
          timestamp: new Date(),
          type: 'chat',
        },
      ];

      const { rerender } = render(
        <ChatPanel {...defaultProps} messages={messages} />
      );

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      // Right-click on message
      const message = screen.getByText('Spam message!').closest('[data-testid="chat-message"]');
      fireEvent.contextMenu(message!);

      // Player actions menu should appear
      await waitFor(() => {
        expect(screen.getByTestId('player-actions-menu')).toBeInTheDocument();
      });

      // Mute the player
      await user.click(screen.getByRole('button', { name: 'Mute player' }));
      expect(mockOnMutePlayer).toHaveBeenCalledWith('user2');

      // Simulate muted state
      const mutedPlayers = new Set(['user2']);
      rerender(
        <ChatPanel {...defaultProps} messages={messages} mutedPlayers={mutedPlayers} />
      );

      // Message should show as muted
      expect(screen.getByText('[Muted]')).toBeInTheDocument();
    });

    it('should handle unread messages workflow', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChatPanel {...defaultProps} />);

      // Chat starts collapsed
      expect(screen.getByTestId('chat-panel')).toHaveClass('collapsed');

      // Simulate receiving messages while collapsed
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user2',
          username: 'Bob',
          message: 'New message 1',
          timestamp: new Date(),
          type: 'chat',
        },
        {
          id: '2',
          userId: 'user3',
          username: 'Charlie',
          message: 'New message 2',
          timestamp: new Date(),
          type: 'chat',
        },
      ];

      rerender(<ChatPanel {...defaultProps} messages={messages} />);

      // Should show unread indicator
      const unreadIndicator = screen.getByTestId('unread-indicator');
      expect(unreadIndicator).toHaveTextContent('2');

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      // Unread indicator should disappear
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Command Suggestions Integration', () => {
    it('should show and interact with command suggestions', async () => {
      const user = userEvent.setup();
      render(<ChatPanel {...defaultProps} />);

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      const input = screen.getByPlaceholderText('Type a message...');
      
      // Type command prefix
      await user.type(input, '/');

      // Suggestions should appear
      await waitFor(() => {
        expect(screen.getByTestId('command-suggestions')).toBeInTheDocument();
      });

      // Type more to filter
      await user.type(input, 'fo');

      // Only fold should be suggested
      expect(screen.getByText('fold')).toBeInTheDocument();
      expect(screen.queryByText('check')).not.toBeInTheDocument();

      // Click suggestion
      await user.click(screen.getByText('fold'));

      // Input should be updated
      expect(input).toHaveValue('/fold ');
    });
  });

  describe('Emoji Integration', () => {
    it('should insert emojis into messages', async () => {
      const user = userEvent.setup();
      render(<ChatPanel {...defaultProps} />);

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Great game ');

      // Open emoji picker
      await user.click(screen.getByTestId('emoji-button'));

      // Select emoji
      await user.click(screen.getByText('👍'));

      // Emoji should be inserted
      expect(input).toHaveValue('Great game 👍');

      // Send message
      await user.click(screen.getByTestId('send-button'));

      expect(mockOnSendMessage).toHaveBeenCalledWith('Great game 👍');
    });
  });

  describe('Connection State Integration', () => {
    it('should handle disconnection gracefully', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChatPanel {...defaultProps} />);

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      // Initially connected
      const input = screen.getByPlaceholderText('Type a message...');
      expect(input).not.toBeDisabled();

      // Simulate disconnection
      rerender(<ChatPanel {...defaultProps} isConnected={false} />);

      // Input should be disabled
      expect(screen.getByPlaceholderText('Not connected')).toBeDisabled();
      expect(screen.getByText('Chat unavailable - not connected')).toBeInTheDocument();

      // Connection indicator should be red
      const indicator = screen.getByTestId('chat-header').querySelector('.bg-red-400');
      expect(indicator).toBeInTheDocument();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large message volumes efficiently', async () => {
      const user = userEvent.setup();
      
      // Generate 500 messages
      const manyMessages: ChatMessage[] = Array.from({ length: 500 }, (_, i) => ({
        id: `msg-${i}`,
        userId: `user${i % 10}`,
        username: `User ${i % 10}`,
        message: `Message ${i}`,
        timestamp: new Date(Date.now() - (500 - i) * 1000),
        type: 'chat',
      }));

      const { rerender } = render(
        <ChatPanel {...defaultProps} messages={manyMessages} />
      );

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      // Should render without issues
      expect(screen.getByTestId('message-list')).toBeInTheDocument();

      // Add more messages
      const newMessage: ChatMessage = {
        id: 'new-msg',
        userId: 'user1',
        username: 'Alice',
        message: 'New message after many',
        timestamp: new Date(),
        type: 'chat',
      };

      rerender(
        <ChatPanel {...defaultProps} messages={[...manyMessages, newMessage]} />
      );

      // New message should be visible (auto-scroll)
      await waitFor(() => {
        expect(screen.getByText('New message after many')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility Integration', () => {
    it('should maintain focus management throughout interactions', async () => {
      const user = userEvent.setup();
      render(<ChatPanel {...defaultProps} />);

      // Tab to header
      await user.tab();
      expect(screen.getByTestId('chat-header')).toHaveFocus();

      // Open with Enter
      await user.keyboard('{Enter}');

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByPlaceholderText('Type a message...')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('emoji-button')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('send-button')).toHaveFocus();
    });

    it('should announce important updates to screen readers', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ChatPanel {...defaultProps} />);

      // Open chat
      await user.click(screen.getByTestId('chat-header'));

      // Add system message
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'system',
          username: 'System',
          message: 'Game is starting!',
          timestamp: new Date(),
          type: 'system',
        },
      ];

      rerender(<ChatPanel {...defaultProps} messages={messages} />);

      // System message should have assertive aria-live
      const systemMsg = screen.getByText('Game is starting!').closest('[data-testid="chat-message"]');
      expect(systemMsg).toHaveAttribute('aria-live', 'assertive');
    });
  });
});