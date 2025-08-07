import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatPanel } from '../ChatPanel';
import type { ChatMessage } from '../types';

describe('ChatPanel', () => {
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

  describe('Component Rendering', () => {
    it('should render the chat panel with all sub-components', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
      expect(screen.getByTestId('chat-header')).toBeInTheDocument();
      expect(screen.getByTestId('message-list')).toBeInTheDocument();
      expect(screen.getByTestId('message-input')).toBeInTheDocument();
    });

    it('should show collapsed state by default', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const panel = screen.getByTestId('chat-panel');
      expect(panel).toHaveClass('collapsed');
    });

    it('should toggle expanded/collapsed state when header is clicked', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const header = screen.getByTestId('chat-header');
      const panel = screen.getByTestId('chat-panel');
      
      // Initially collapsed
      expect(panel).toHaveClass('collapsed');
      
      // Click to expand
      fireEvent.click(header);
      expect(panel).not.toHaveClass('collapsed');
      
      // Click to collapse
      fireEvent.click(header);
      expect(panel).toHaveClass('collapsed');
    });
  });

  describe('Message Display', () => {
    const testMessages: ChatMessage[] = [
      {
        id: '1',
        userId: 'user1',
        username: 'Alice',
        message: 'Hello everyone!',
        timestamp: new Date('2025-01-01T10:00:00'),
        type: 'chat',
      },
      {
        id: '2',
        userId: 'system',
        username: 'System',
        message: 'Bob joined the table',
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

    it('should display all messages', () => {
      render(<ChatPanel {...defaultProps} messages={testMessages} />);
      
      expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
      expect(screen.getByText('Bob joined the table')).toBeInTheDocument();
      expect(screen.getByText('Hi Alice!')).toBeInTheDocument();
    });

    it('should display empty state when no messages', () => {
      render(<ChatPanel {...defaultProps} messages={[]} />);
      
      expect(screen.getByText('No messages yet')).toBeInTheDocument();
    });

    it('should not display messages from blocked players', () => {
      const blockedPlayers = new Set(['user2']);
      render(
        <ChatPanel
          {...defaultProps}
          messages={testMessages}
          blockedPlayers={blockedPlayers}
        />
      );
      
      expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
      expect(screen.getByText('Bob joined the table')).toBeInTheDocument();
      expect(screen.queryByText('Hi Alice!')).not.toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should send message on form submit', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByTestId('send-button');
      
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);
      
      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
      });
      
      // Input should be cleared after sending
      expect(input).toHaveValue('');
    });

    it('should not send empty messages', () => {
      render(<ChatPanel {...defaultProps} />);
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.click(sendButton);
      
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('should disable input when not connected', () => {
      render(<ChatPanel {...defaultProps} isConnected={false} />);
      
      const input = screen.getByPlaceholderText('Not connected');
      const sendButton = screen.getByTestId('send-button');
      
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('should show emoji picker when emoji button is clicked', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const emojiButton = screen.getByTestId('emoji-button');
      fireEvent.click(emojiButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
      });
    });
  });

  describe('Command Parsing', () => {
    it('should parse and execute /fold command', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.change(input, { target: { value: '/fold' } });
      fireEvent.submit(input.closest('form')!);
      
      await waitFor(() => {
        expect(mockOnCommand).toHaveBeenCalledWith('fold');
        expect(mockOnSendMessage).not.toHaveBeenCalled();
      });
    });

    it('should parse and execute /check command', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.change(input, { target: { value: '/check' } });
      fireEvent.submit(input.closest('form')!);
      
      await waitFor(() => {
        expect(mockOnCommand).toHaveBeenCalledWith('check');
        expect(mockOnSendMessage).not.toHaveBeenCalled();
      });
    });

    it('should parse and execute /all-in command', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.change(input, { target: { value: '/all-in' } });
      fireEvent.submit(input.closest('form')!);
      
      await waitFor(() => {
        expect(mockOnCommand).toHaveBeenCalledWith('all-in');
        expect(mockOnSendMessage).not.toHaveBeenCalled();
      });
    });

    it('should show available commands on /help', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.change(input, { target: { value: '/help' } });
      fireEvent.submit(input.closest('form')!);
      
      await waitFor(() => {
        expect(screen.getByText(/Available commands:/)).toBeInTheDocument();
      });
    });

    it('should treat invalid commands as regular messages', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.change(input, { target: { value: '/invalid' } });
      fireEvent.submit(input.closest('form')!);
      
      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith('/invalid');
        expect(mockOnCommand).not.toHaveBeenCalled();
      });
    });
  });

  describe('Player Actions', () => {
    const messageWithActions: ChatMessage = {
      id: '1',
      userId: 'user2',
      username: 'Bob',
      message: 'Hello!',
      timestamp: new Date(),
      type: 'chat',
    };

    it('should show player action menu on message hover', async () => {
      render(<ChatPanel {...defaultProps} messages={[messageWithActions]} />);
      
      const message = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      fireEvent.mouseEnter(message!);
      
      await waitFor(() => {
        expect(screen.getByTestId('player-actions')).toBeInTheDocument();
      });
    });

    it('should mute player when mute button is clicked', async () => {
      render(<ChatPanel {...defaultProps} messages={[messageWithActions]} />);
      
      const message = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      fireEvent.mouseEnter(message!);
      
      const muteButton = screen.getByTestId('mute-button');
      fireEvent.click(muteButton);
      
      await waitFor(() => {
        expect(mockOnMutePlayer).toHaveBeenCalledWith('user2');
      });
    });

    it('should block player when block button is clicked', async () => {
      render(<ChatPanel {...defaultProps} messages={[messageWithActions]} />);
      
      const message = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      fireEvent.mouseEnter(message!);
      
      const blockButton = screen.getByTestId('block-button');
      fireEvent.click(blockButton);
      
      await waitFor(() => {
        expect(mockOnBlockPlayer).toHaveBeenCalledWith('user2');
      });
    });

    it('should not show actions for own messages', async () => {
      const ownMessage: ChatMessage = {
        ...messageWithActions,
        userId: 'user1',
      };
      
      render(<ChatPanel {...defaultProps} messages={[ownMessage]} />);
      
      const message = screen.getByText('Hello!').closest('[data-testid="chat-message"]');
      fireEvent.mouseEnter(message!);
      
      await waitFor(() => {
        expect(screen.queryByTestId('player-actions')).not.toBeInTheDocument();
      });
    });
  });

  describe('Unread Indicators', () => {
    it('should show unread count when collapsed and new messages arrive', async () => {
      const { rerender } = render(<ChatPanel {...defaultProps} />);
      
      // Collapse the panel
      const header = screen.getByTestId('chat-header');
      fireEvent.click(header);
      
      // Add new messages
      const newMessages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user2',
          username: 'Bob',
          message: 'New message',
          timestamp: new Date(),
          type: 'chat',
        },
      ];
      
      rerender(<ChatPanel {...defaultProps} messages={newMessages} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
      });
    });

    it('should clear unread count when panel is expanded', async () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user2',
          username: 'Bob',
          message: 'New message',
          timestamp: new Date(),
          type: 'chat',
        },
      ];
      
      render(<ChatPanel {...defaultProps} messages={messages} />);
      
      // Initially should have unread count when collapsed
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
      
      // Expand panel
      const header = screen.getByTestId('chat-header');
      fireEvent.click(header);
      
      await waitFor(() => {
        expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ChatPanel {...defaultProps} />);
      
      expect(screen.getByRole('region', { name: 'Chat panel' })).toBeInTheDocument();
      expect(screen.getByRole('log', { name: 'Chat messages' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Chat message input' })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<ChatPanel {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      
      // Test Enter key to send
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      
      await waitFor(() => {
        expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
      });
    });

    it('should announce new messages to screen readers', async () => {
      const { rerender } = render(<ChatPanel {...defaultProps} />);
      
      const newMessages: ChatMessage[] = [
        {
          id: '1',
          userId: 'user2',
          username: 'Bob',
          message: 'New message',
          timestamp: new Date(),
          type: 'chat',
        },
      ];
      
      rerender(<ChatPanel {...defaultProps} messages={newMessages} />);
      
      await waitFor(() => {
        const liveRegion = screen.getByRole('log', { name: 'Chat messages' });
        expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});