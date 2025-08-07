import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { PlayerActions } from '../PlayerActions';

describe('PlayerActions', () => {
  const mockOnMute = jest.fn();
  const mockOnBlock = jest.fn();
  const mockOnReport = jest.fn();

  const defaultProps = {
    playerId: 'player123',
    playerName: 'Bob',
    onMute: mockOnMute,
    onBlock: mockOnBlock,
    onReport: mockOnReport,
    isMuted: false,
    isBlocked: false,
    position: { x: 100, y: 100 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render all action buttons', () => {
      render(<PlayerActions {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: 'Mute player' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Block player' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Report player' })).toBeInTheDocument();
    });

    it('should position menu at specified coordinates', () => {
      render(<PlayerActions {...defaultProps} />);
      
      const menu = screen.getByTestId('player-actions-menu');
      expect(menu).toHaveStyle({
        left: '100px',
        top: '100px',
      });
    });

    it('should show player name in header', () => {
      render(<PlayerActions {...defaultProps} />);
      
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  describe('Mute Functionality', () => {
    it('should call onMute when mute button is clicked', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const muteButton = screen.getByRole('button', { name: 'Mute player' });
      await user.click(muteButton);
      
      expect(mockOnMute).toHaveBeenCalledWith('player123');
    });

    it('should show unmute button when player is muted', () => {
      render(<PlayerActions {...defaultProps} isMuted={true} />);
      
      expect(screen.getByRole('button', { name: 'Unmute player' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mute player' })).not.toBeInTheDocument();
    });

    it('should toggle mute state', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<PlayerActions {...defaultProps} />);
      
      // Mute
      const muteButton = screen.getByRole('button', { name: 'Mute player' });
      await user.click(muteButton);
      
      expect(mockOnMute).toHaveBeenCalledWith('player123');
      
      // Simulate state update
      rerender(<PlayerActions {...defaultProps} isMuted={true} />);
      
      // Unmute
      const unmuteButton = screen.getByRole('button', { name: 'Unmute player' });
      await user.click(unmuteButton);
      
      expect(mockOnMute).toHaveBeenCalledTimes(2);
    });

    it('should show mute duration options', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} showMuteDuration />);
      
      const muteButton = screen.getByRole('button', { name: 'Mute player' });
      await user.click(muteButton);
      
      expect(screen.getByText('15 minutes')).toBeInTheDocument();
      expect(screen.getByText('1 hour')).toBeInTheDocument();
      expect(screen.getByText('Until end of session')).toBeInTheDocument();
    });
  });

  describe('Block Functionality', () => {
    it('should call onBlock when block button is clicked', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const blockButton = screen.getByRole('button', { name: 'Block player' });
      await user.click(blockButton);
      
      expect(mockOnBlock).toHaveBeenCalledWith('player123');
    });

    it('should show unblock button when player is blocked', () => {
      render(<PlayerActions {...defaultProps} isBlocked={true} />);
      
      expect(screen.getByRole('button', { name: 'Unblock player' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Block player' })).not.toBeInTheDocument();
    });

    it('should show confirmation dialog before blocking', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} confirmBeforeBlock />);
      
      const blockButton = screen.getByRole('button', { name: 'Block player' });
      await user.click(blockButton);
      
      expect(screen.getByText('Are you sure you want to block Bob?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should block after confirmation', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} confirmBeforeBlock />);
      
      const blockButton = screen.getByRole('button', { name: 'Block player' });
      await user.click(blockButton);
      
      const confirmButton = screen.getByRole('button', { name: 'Confirm' });
      await user.click(confirmButton);
      
      expect(mockOnBlock).toHaveBeenCalledWith('player123');
    });
  });

  describe('Report Functionality', () => {
    it('should show report dialog when report button is clicked', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const reportButton = screen.getByRole('button', { name: 'Report player' });
      await user.click(reportButton);
      
      expect(screen.getByText('Report Bob')).toBeInTheDocument();
      expect(screen.getByText('Select a reason:')).toBeInTheDocument();
    });

    it('should show report reason options', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const reportButton = screen.getByRole('button', { name: 'Report player' });
      await user.click(reportButton);
      
      expect(screen.getByLabelText('Inappropriate language')).toBeInTheDocument();
      expect(screen.getByLabelText('Cheating')).toBeInTheDocument();
      expect(screen.getByLabelText('Harassment')).toBeInTheDocument();
      expect(screen.getByLabelText('Spam')).toBeInTheDocument();
      expect(screen.getByLabelText('Other')).toBeInTheDocument();
    });

    it('should require reason selection before submitting', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const reportButton = screen.getByRole('button', { name: 'Report player' });
      await user.click(reportButton);
      
      const submitButton = screen.getByRole('button', { name: 'Submit report' });
      expect(submitButton).toBeDisabled();
      
      // Select a reason
      const harassmentOption = screen.getByLabelText('Harassment');
      await user.click(harassmentOption);
      
      expect(submitButton).not.toBeDisabled();
    });

    it('should call onReport with reason and details', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const reportButton = screen.getByRole('button', { name: 'Report player' });
      await user.click(reportButton);
      
      const harassmentOption = screen.getByLabelText('Harassment');
      await user.click(harassmentOption);
      
      const detailsInput = screen.getByPlaceholderText('Additional details (optional)');
      await user.type(detailsInput, 'Repeated offensive messages');
      
      const submitButton = screen.getByRole('button', { name: 'Submit report' });
      await user.click(submitButton);
      
      expect(mockOnReport).toHaveBeenCalledWith('player123', {
        reason: 'harassment',
        details: 'Repeated offensive messages',
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should close menu on Escape key', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<PlayerActions {...defaultProps} onClose={onClose} />);
      
      await user.keyboard('{Escape}');
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should navigate actions with arrow keys', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', { name: 'Mute player' })).toHaveFocus();
      
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', { name: 'Block player' })).toHaveFocus();
      
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('button', { name: 'Report player' })).toHaveFocus();
    });
  });

  describe('Visual States', () => {
    it('should show muted indicator', () => {
      render(<PlayerActions {...defaultProps} isMuted={true} />);
      
      expect(screen.getByTestId('muted-indicator')).toBeInTheDocument();
    });

    it('should show blocked indicator', () => {
      render(<PlayerActions {...defaultProps} isBlocked={true} />);
      
      expect(screen.getByTestId('blocked-indicator')).toBeInTheDocument();
    });

    it('should disable other actions when player is blocked', () => {
      render(<PlayerActions {...defaultProps} isBlocked={true} />);
      
      expect(screen.queryByRole('button', { name: 'Mute player' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Report player' })).not.toBeInTheDocument();
    });
  });

  describe('Click Outside', () => {
    it('should close menu when clicking outside', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      
      render(
        <div>
          <div data-testid="outside">Outside element</div>
          <PlayerActions {...defaultProps} onClose={onClose} />
        </div>
      );
      
      const outside = screen.getByTestId('outside');
      await user.click(outside);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking inside menu', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<PlayerActions {...defaultProps} onClose={onClose} />);
      
      const menu = screen.getByTestId('player-actions-menu');
      await user.click(menu);
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<PlayerActions {...defaultProps} />);
      
      const menu = screen.getByRole('menu', { name: 'Player actions' });
      expect(menu).toBeInTheDocument();
      
      const muteButton = screen.getByRole('menuitem', { name: 'Mute player' });
      expect(muteButton).toBeInTheDocument();
    });

    it('should manage focus correctly', async () => {
      render(<PlayerActions {...defaultProps} />);
      
      // First button should have focus
      expect(screen.getByRole('button', { name: 'Mute player' })).toHaveFocus();
    });

    it('should announce state changes', async () => {
      const user = userEvent.setup();
      render(<PlayerActions {...defaultProps} />);
      
      const muteButton = screen.getByRole('button', { name: 'Mute player' });
      await user.click(muteButton);
      
      await waitFor(() => {
        const announcement = screen.getByRole('status');
        expect(announcement).toHaveTextContent('Bob has been muted');
      });
    });
  });
});