import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UnreadIndicator } from '../UnreadIndicator';

describe('UnreadIndicator', () => {
  const defaultProps = {
    count: 0,
    onClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should not render when count is 0', () => {
      render(<UnreadIndicator {...defaultProps} count={0} />);
      
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });

    it('should render when count is greater than 0', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      expect(screen.getByTestId('unread-indicator')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should not render when count is negative', () => {
      render(<UnreadIndicator {...defaultProps} count={-1} />);
      
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });
  });

  describe('Display Formatting', () => {
    it('should display exact count for numbers under 100', () => {
      render(<UnreadIndicator {...defaultProps} count={42} />);
      
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should display 99+ for counts of 100 or more', () => {
      render(<UnreadIndicator {...defaultProps} count={100} />);
      
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should display 99+ for very large counts', () => {
      render(<UnreadIndicator {...defaultProps} count={1000} />);
      
      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should apply custom max count when provided', () => {
      render(<UnreadIndicator {...defaultProps} count={25} maxCount={20} />);
      
      expect(screen.getByText('20+')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should call onClick when clicked', () => {
      const onClick = jest.fn();
      render(<UnreadIndicator {...defaultProps} count={5} onClick={onClick} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      fireEvent.click(indicator);
      
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should not be clickable when onClick is not provided', () => {
      render(<UnreadIndicator count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).not.toHaveStyle({ cursor: 'pointer' });
    });

    it('should show pointer cursor when clickable', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveStyle({ cursor: 'pointer' });
    });
  });

  describe('Animation', () => {
    it('should apply pulse animation by default', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('animate-pulse');
    });

    it('should not animate when animation is disabled', () => {
      render(<UnreadIndicator {...defaultProps} count={5} animate={false} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).not.toHaveClass('animate-pulse');
    });

    it('should apply bounce animation when specified', () => {
      render(<UnreadIndicator {...defaultProps} count={5} animationType="bounce" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('animate-bounce');
    });
  });

  describe('Styling', () => {
    it('should apply default size', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('w-6', 'h-6');
    });

    it('should apply small size', () => {
      render(<UnreadIndicator {...defaultProps} count={5} size="small" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('w-4', 'h-4');
    });

    it('should apply large size', () => {
      render(<UnreadIndicator {...defaultProps} count={5} size="large" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('w-8', 'h-8');
    });

    it('should apply custom color', () => {
      render(<UnreadIndicator {...defaultProps} count={5} color="green" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('bg-green-500');
    });

    it('should apply custom className', () => {
      render(<UnreadIndicator {...defaultProps} count={5} className="custom-class" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('custom-class');
    });
  });

  describe('Position', () => {
    it('should position at top-right by default', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('top-0', 'right-0');
    });

    it('should position at top-left when specified', () => {
      render(<UnreadIndicator {...defaultProps} count={5} position="top-left" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('top-0', 'left-0');
    });

    it('should position at bottom-right when specified', () => {
      render(<UnreadIndicator {...defaultProps} count={5} position="bottom-right" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('bottom-0', 'right-0');
    });

    it('should position at bottom-left when specified', () => {
      render(<UnreadIndicator {...defaultProps} count={5} position="bottom-left" />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('bottom-0', 'left-0');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveAttribute('aria-label', '5 unread messages');
    });

    it('should have proper ARIA label for 1 message', () => {
      render(<UnreadIndicator {...defaultProps} count={1} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveAttribute('aria-label', '1 unread message');
    });

    it('should have proper ARIA label for 99+ messages', () => {
      render(<UnreadIndicator {...defaultProps} count={100} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveAttribute('aria-label', 'More than 99 unread messages');
    });

    it('should have role of status', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveAttribute('role', 'status');
    });

    it('should be focusable when clickable', () => {
      render(<UnreadIndicator {...defaultProps} count={5} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveAttribute('tabIndex', '0');
    });

    it('should handle keyboard interaction', () => {
      const onClick = jest.fn();
      render(<UnreadIndicator count={5} onClick={onClick} />);
      
      const indicator = screen.getByTestId('unread-indicator');
      fireEvent.keyDown(indicator, { key: 'Enter' });
      
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration with parent components', () => {
    it('should work with relative positioned parent', () => {
      render(
        <div style={{ position: 'relative' }}>
          <UnreadIndicator {...defaultProps} count={5} />
        </div>
      );
      
      const indicator = screen.getByTestId('unread-indicator');
      expect(indicator).toHaveClass('absolute');
    });

    it('should handle dynamic count updates', () => {
      const { rerender } = render(<UnreadIndicator {...defaultProps} count={5} />);
      
      expect(screen.getByText('5')).toBeInTheDocument();
      
      rerender(<UnreadIndicator {...defaultProps} count={10} />);
      
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should handle visibility transitions', () => {
      const { rerender } = render(<UnreadIndicator {...defaultProps} count={0} />);
      
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
      
      rerender(<UnreadIndicator {...defaultProps} count={5} />);
      
      expect(screen.getByTestId('unread-indicator')).toBeInTheDocument();
      
      rerender(<UnreadIndicator {...defaultProps} count={0} />);
      
      expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
    });
  });
});