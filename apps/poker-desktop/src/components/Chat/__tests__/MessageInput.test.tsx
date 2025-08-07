import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../MessageInput';

// Mock emoji picker
jest.mock('@emoji-mart/react', () => ({
  Picker: ({ onEmojiSelect }: { onEmojiSelect: (emoji: { native: string }) => void }) => (
    <div data-testid="emoji-picker">
      <button onClick={() => onEmojiSelect({ native: '😀' })}>😀</button>
      <button onClick={() => onEmojiSelect({ native: '👍' })}>👍</button>
    </div>
  ),
}));

describe('MessageInput', () => {
  const mockOnSendMessage = jest.fn();
  const mockOnCommand = jest.fn();

  const defaultProps = {
    onSendMessage: mockOnSendMessage,
    onCommand: mockOnCommand,
    isConnected: true,
    maxLength: 500,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Input Functionality', () => {
    it('should render input with send button', () => {
      render(<MessageInput {...defaultProps} />);
      
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
      expect(screen.getByTestId('emoji-button')).toBeInTheDocument();
    });

    it('should update input value on typing', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello world');
      
      expect(input).toHaveValue('Hello world');
    });

    it('should clear input after sending message', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test message');
      
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
      expect(input).toHaveValue('');
    });

    it('should not send empty messages', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('should trim whitespace from messages', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '  Hello world  ');
      
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Hello world');
    });
  });

  describe('Character Limit', () => {
    it('should show character count', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Hello');
      
      expect(screen.getByText('5 / 500')).toBeInTheDocument();
    });

    it('should prevent typing beyond max length', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} maxLength={10} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'This is a very long message');
      
      expect(input).toHaveValue('This is a ');
      expect(screen.getByText('10 / 10')).toBeInTheDocument();
    });

    it('should show warning when approaching limit', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} maxLength={50} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'This is a message that is getting close to limit');
      
      const charCount = screen.getByTestId('char-count');
      expect(charCount).toHaveClass('warning');
    });
  });

  describe('Emoji Picker', () => {
    it('should toggle emoji picker on button click', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const emojiButton = screen.getByTestId('emoji-button');
      
      // Initially hidden
      expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
      
      // Click to show
      await user.click(emojiButton);
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
      
      // Click to hide
      await user.click(emojiButton);
      expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
    });

    it('should insert emoji at cursor position', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
      await user.type(input, 'Hello world');
      
      // Move cursor to position 5 (after "Hello")
      input.setSelectionRange(5, 5);
      
      // Open emoji picker and select emoji
      const emojiButton = screen.getByTestId('emoji-button');
      await user.click(emojiButton);
      
      const emojiOption = screen.getByText('😀');
      await user.click(emojiOption);
      
      expect(input).toHaveValue('Hello😀 world');
    });

    it('should close emoji picker after selecting emoji', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const emojiButton = screen.getByTestId('emoji-button');
      await user.click(emojiButton);
      
      const emojiOption = screen.getByText('😀');
      await user.click(emojiOption);
      
      expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
    });

    it('should close emoji picker on escape key', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const emojiButton = screen.getByTestId('emoji-button');
      await user.click(emojiButton);
      
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
      
      await user.keyboard('{Escape}');
      
      expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument();
    });
  });

  describe('Command Handling', () => {
    it('should detect and handle commands starting with /', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/fold');
      
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      
      expect(mockOnCommand).toHaveBeenCalledWith('fold', undefined);
      expect(mockOnSendMessage).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('should handle commands with arguments', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/bet 100');
      
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      
      expect(mockOnCommand).toHaveBeenCalledWith('bet', '100');
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('should show command suggestions while typing', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/');
      
      await waitFor(() => {
        expect(screen.getByTestId('command-suggestions')).toBeInTheDocument();
        expect(screen.getByText('fold')).toBeInTheDocument();
        expect(screen.getByText('check')).toBeInTheDocument();
        expect(screen.getByText('all-in')).toBeInTheDocument();
      });
    });

    it('should filter command suggestions based on input', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/fo');
      
      await waitFor(() => {
        expect(screen.getByText('fold')).toBeInTheDocument();
        expect(screen.queryByText('check')).not.toBeInTheDocument();
      });
    });

    it('should select command suggestion on click', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/');
      
      const foldSuggestion = screen.getByText('fold');
      await user.click(foldSuggestion);
      
      expect(input).toHaveValue('/fold ');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should send message on Enter key', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Test message');
      await user.keyboard('{Enter}');
      
      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message');
    });

    it('should allow new line with Shift+Enter', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} multiline />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Line 1');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      await user.type(input, 'Line 2');
      
      expect(input).toHaveValue('Line 1\nLine 2');
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });

    it('should navigate command suggestions with arrow keys', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, '/');
      
      await waitFor(() => {
        expect(screen.getByTestId('command-suggestions')).toBeInTheDocument();
      });
      
      // Navigate down
      await user.keyboard('{ArrowDown}');
      let selectedItem = screen.getByRole('option', { selected: true });
      expect(selectedItem).toHaveTextContent('fold');
      
      // Navigate down again
      await user.keyboard('{ArrowDown}');
      selectedItem = screen.getByRole('option', { selected: true });
      expect(selectedItem).toHaveTextContent('check');
      
      // Select with Enter
      await user.keyboard('{Enter}');
      expect(input).toHaveValue('/check ');
    });
  });

  describe('Connection State', () => {
    it('should disable input when not connected', () => {
      render(<MessageInput {...defaultProps} isConnected={false} />);
      
      const input = screen.getByPlaceholderText('Not connected');
      const sendButton = screen.getByTestId('send-button');
      
      expect(input).toBeDisabled();
      expect(sendButton).toBeDisabled();
    });

    it('should show connection status message', () => {
      render(<MessageInput {...defaultProps} isConnected={false} />);
      
      expect(screen.getByText('Chat unavailable - not connected')).toBeInTheDocument();
    });

    it('should re-enable when connection is restored', () => {
      const { rerender } = render(<MessageInput {...defaultProps} isConnected={false} />);
      
      const input = screen.getByPlaceholderText('Not connected');
      expect(input).toBeDisabled();
      
      rerender(<MessageInput {...defaultProps} isConnected={true} />);
      
      expect(screen.getByPlaceholderText('Type a message...')).not.toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<MessageInput {...defaultProps} />);
      
      const input = screen.getByRole('textbox', { name: 'Chat message input' });
      const sendButton = screen.getByRole('button', { name: 'Send message' });
      const emojiButton = screen.getByRole('button', { name: 'Open emoji picker' });
      
      expect(input).toBeInTheDocument();
      expect(sendButton).toBeInTheDocument();
      expect(emojiButton).toBeInTheDocument();
    });

    it('should announce character limit to screen readers', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} maxLength={50} />);
      
      const input = screen.getByPlaceholderText('Type a message...');
      await user.type(input, 'Almost at the character limit here');
      
      const charCount = screen.getByTestId('char-count');
      expect(charCount).toHaveAttribute('aria-live', 'polite');
      expect(charCount).toHaveAttribute('aria-label', expect.stringContaining('characters remaining'));
    });

    it('should have keyboard navigation for emoji picker', async () => {
      const user = userEvent.setup();
      render(<MessageInput {...defaultProps} />);
      
      // Tab to emoji button
      await user.tab();
      expect(screen.getByTestId('emoji-button')).toHaveFocus();
      
      // Open with Enter
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('emoji-picker')).toBeInTheDocument();
    });
  });
});