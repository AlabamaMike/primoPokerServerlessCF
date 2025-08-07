import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ChatPanel from '../ChatPanel';
import { ChatMessage } from '../types';

describe('ChatPanel', () => {
  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      username: 'Alice',
      userId: 'user1',
      message: 'Hello everyone!',
      timestamp: new Date('2024-01-01T10:00:00'),
      isSystem: false
    },
    {
      id: '2',
      username: 'System',
      userId: 'system',
      message: 'Bob joined the table',
      timestamp: new Date('2024-01-01T10:01:00'),
      isSystem: true
    }
  ];

  const mockProps = {
    messages: mockMessages,
    onSendMessage: jest.fn(),
    onCommand: jest.fn(),
    onMutePlayer: jest.fn(),
    onBlockPlayer: jest.fn(),
    currentUserId: 'user1',
    isConnected: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders chat panel with messages', () => {
    render(<ChatPanel {...mockProps} />);
    
    expect(screen.getByText('Table Chat')).toBeInTheDocument();
    expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
    expect(screen.getByText('Bob joined the table')).toBeInTheDocument();
  });

  it('shows connection status', () => {
    const { rerender } = render(<ChatPanel {...mockProps} />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
    
    rerender(<ChatPanel {...mockProps} isConnected={false} />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('can collapse and expand chat', async () => {
    render(<ChatPanel {...mockProps} />);
    
    const toggleButton = screen.getByTestId('chat-toggle');
    
    // Initially expanded
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    
    // Collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    
    // Expand
    fireEvent.click(toggleButton);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('tracks unread messages when collapsed', async () => {
    const { rerender } = render(<ChatPanel {...mockProps} />);
    
    // Collapse chat
    fireEvent.click(screen.getByTestId('chat-toggle'));
    
    // Add new message
    const newMessages = [...mockMessages, {
      id: '3',
      username: 'Charlie',
      userId: 'user3',
      message: 'New message!',
      timestamp: new Date(),
      isSystem: false
    }];
    
    rerender(<ChatPanel {...mockProps} messages={newMessages} />);
    
    // Should show unread indicator
    const unreadIndicator = screen.getByTestId('unread-indicator');
    expect(unreadIndicator).toHaveTextContent('1');
  });

  it('sends regular messages', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');
    
    await user.type(input, 'Test message');
    await user.click(sendButton);
    
    expect(mockProps.onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('handles chat commands', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');
    
    await user.type(input, '/fold');
    await user.click(sendButton);
    
    expect(mockProps.onCommand).toHaveBeenCalledWith({
      command: 'fold',
      args: []
    });
  });

  it('shows command suggestions', async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    
    // Should show command suggestions
    expect(screen.getByTestId('suggestion-/fold')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-/check')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-/bet')).toBeInTheDocument();
  });

  it('disables input when not connected', () => {
    render(<ChatPanel {...mockProps} isConnected={false} />);
    
    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');
    
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});