import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MessageInput from '../MessageInput';

describe('MessageInput', () => {
  const mockProps = {
    onSendMessage: jest.fn(),
    isConnected: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input field and buttons', () => {
    render(<MessageInput {...mockProps} />);
    
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('emoji-button')).toBeInTheDocument();
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });

  it('sends message on form submit', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');
    
    await user.type(input, 'Hello world');
    await user.click(sendButton);
    
    expect(mockProps.onSendMessage).toHaveBeenCalledWith('Hello world');
    expect(input).toHaveValue('');
  });

  it('sends message on Enter key', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, 'Test message{Enter}');
    
    expect(mockProps.onSendMessage).toHaveBeenCalledWith('Test message');
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const sendButton = screen.getByTestId('send-button');
    
    await user.click(sendButton);
    
    expect(mockProps.onSendMessage).not.toHaveBeenCalled();
  });

  it('trims whitespace from messages', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, '  Hello  {Enter}');
    
    expect(mockProps.onSendMessage).toHaveBeenCalledWith('Hello');
  });

  it('shows character count when typing', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} maxLength={100} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, 'Hello');
    
    expect(screen.getByTestId('char-count')).toHaveTextContent('95');
  });

  it('warns when approaching character limit', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} maxLength={60} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, 'This is a very long message that approaches the limit');
    
    const charCount = screen.getByTestId('char-count');
    expect(charCount).toHaveClass('text-yellow-400');
  });

  it('disables input when not connected', () => {
    render(<MessageInput {...mockProps} isConnected={false} />);
    
    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');
    const emojiButton = screen.getByTestId('emoji-button');
    
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(emojiButton).toBeDisabled();
  });

  it('shows command suggestions when typing /', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, '/');
    
    expect(screen.getByTestId('suggestion-/fold')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-/check')).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-/bet')).toBeInTheDocument();
  });

  it('filters command suggestions based on input', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, '/ch');
    
    expect(screen.getByTestId('suggestion-/check')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-/fold')).not.toBeInTheDocument();
  });

  it('completes command on Tab key', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, '/ch');
    await user.keyboard('{Tab}');
    
    expect(input).toHaveValue('/check ');
  });

  it('opens emoji picker on button click', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const emojiButton = screen.getByTestId('emoji-button');
    
    await user.click(emojiButton);
    
    expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
  });

  it('inserts emoji at cursor position', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    const emojiButton = screen.getByTestId('emoji-button');
    
    await user.type(input, 'Hello ');
    await user.click(emojiButton);
    
    const heartEmoji = screen.getByTestId('emoji-♥️');
    await user.click(heartEmoji);
    
    expect(input).toHaveValue('Hello ♥️');
  });

  it('navigates command suggestions with arrow keys', async () => {
    const user = userEvent.setup();
    render(<MessageInput {...mockProps} />);
    
    const input = screen.getByTestId('chat-input');
    
    await user.type(input, '/');
    
    // Navigate down
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    
    // Navigate up
    await user.keyboard('{ArrowUp}');
    
    // Complete with Tab
    await user.keyboard('{Tab}');
    
    // Should have selected a command
    expect(input.value).toMatch(/^\/\w+ $/);
  });

  describe('Rate Limiting', () => {
    it('disables input when rate limited', () => {
      const rateLimitedProps = {
        ...mockProps,
        isRateLimited: true,
        rateLimitRetryAfter: 15
      };

      render(<MessageInput {...rateLimitedProps} />);
      
      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');
      
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('shows rate limit message in placeholder', () => {
      const rateLimitedProps = {
        ...mockProps,
        isRateLimited: true,
        rateLimitRetryAfter: 30
      };

      render(<MessageInput {...rateLimitedProps} />);
      
      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Rate limited - try again in'));
    });

    it('disables emoji button when rate limited', () => {
      const rateLimitedProps = {
        ...mockProps,
        isRateLimited: true,
        rateLimitRetryAfter: 10
      };

      render(<MessageInput {...rateLimitedProps} />);
      
      const emojiButton = screen.getByTestId('emoji-button');
      expect(emojiButton).toBeDisabled();
    });

    it('shows correct placeholder when both disconnected and rate limited', () => {
      const bothLimitedProps = {
        ...mockProps,
        isConnected: false,
        isRateLimited: true,
        rateLimitRetryAfter: 5
      };

      render(<MessageInput {...bothLimitedProps} />);
      
      const input = screen.getByTestId('chat-input');
      // Rate limit takes priority over disconnected message
      expect(input).toHaveAttribute('placeholder', expect.stringContaining('Rate limited'));
    });

    it('prevents message submission when rate limited', async () => {
      const user = userEvent.setup();
      const rateLimitedProps = {
        ...mockProps,
        isRateLimited: true,
        rateLimitRetryAfter: 20
      };

      render(<MessageInput {...rateLimitedProps} />);
      
      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');
      
      // Try to type and send (input is disabled, but test the handler)
      await user.click(sendButton);
      
      expect(mockProps.onSendMessage).not.toHaveBeenCalled();
    });

    it('does not show character count when rate limited', () => {
      const rateLimitedProps = {
        ...mockProps,
        isRateLimited: true,
        rateLimitRetryAfter: 15,
        maxLength: 100
      };

      render(<MessageInput {...rateLimitedProps} />);
      
      expect(screen.queryByTestId('char-count')).not.toBeInTheDocument();
    });
  });
});