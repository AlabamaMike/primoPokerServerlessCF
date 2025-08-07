import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UnreadIndicator from '../UnreadIndicator';

describe('UnreadIndicator', () => {
  it('renders with count', () => {
    render(<UnreadIndicator count={5} />);
    
    const indicator = screen.getByTestId('unread-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent('5');
  });

  it('does not render when count is 0', () => {
    render(<UnreadIndicator count={0} />);
    
    expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
  });

  it('does not render when count is negative', () => {
    render(<UnreadIndicator count={-1} />);
    
    expect(screen.queryByTestId('unread-indicator')).not.toBeInTheDocument();
  });

  it('shows 99+ for counts over 99', () => {
    render(<UnreadIndicator count={100} />);
    
    expect(screen.getByTestId('unread-indicator')).toHaveTextContent('99+');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const mockOnClick = jest.fn();
    
    render(<UnreadIndicator count={5} onClick={mockOnClick} />);
    
    await user.click(screen.getByTestId('unread-indicator'));
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('has proper accessibility attributes', () => {
    render(<UnreadIndicator count={3} />);
    
    const indicator = screen.getByTestId('unread-indicator');
    expect(indicator).toHaveAttribute('aria-label', '3 unread messages');
  });

  it('applies custom className', () => {
    render(<UnreadIndicator count={1} className="custom-class" />);
    
    const indicator = screen.getByTestId('unread-indicator');
    expect(indicator).toHaveClass('custom-class');
  });

  it('has pulse animation', () => {
    render(<UnreadIndicator count={1} />);
    
    const indicator = screen.getByTestId('unread-indicator');
    expect(indicator).toHaveClass('animate-pulse');
  });
});