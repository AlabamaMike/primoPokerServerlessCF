import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SpectatorControls from './SpectatorControls';

describe('SpectatorControls', () => {
  const mockOnLeave = vi.fn();

  beforeEach(() => {
    mockOnLeave.mockClear();
  });

  it('should render spectator count', () => {
    render(<SpectatorControls spectatorCount={5} onLeave={mockOnLeave} />);
    expect(screen.getByText('5 spectators')).toBeInTheDocument();
  });

  it('should handle singular spectator count', () => {
    render(<SpectatorControls spectatorCount={1} onLeave={mockOnLeave} />);
    expect(screen.getByText('1 spectator')).toBeInTheDocument();
  });

  it('should render leave button', () => {
    render(<SpectatorControls spectatorCount={3} onLeave={mockOnLeave} />);
    const leaveButton = screen.getByRole('button', { name: /leave/i });
    expect(leaveButton).toBeInTheDocument();
  });

  it('should call onLeave when leave button clicked', () => {
    render(<SpectatorControls spectatorCount={3} onLeave={mockOnLeave} />);
    const leaveButton = screen.getByRole('button', { name: /leave/i });
    fireEvent.click(leaveButton);
    expect(mockOnLeave).toHaveBeenCalledTimes(1);
  });

  it('should apply additional className', () => {
    render(
      <SpectatorControls 
        spectatorCount={3} 
        onLeave={mockOnLeave} 
        className="custom-class" 
      />
    );
    const container = screen.getByTestId('spectator-controls');
    expect(container).toHaveClass('custom-class');
  });

  it('should display eye icon for spectator count', () => {
    render(<SpectatorControls spectatorCount={3} onLeave={mockOnLeave} />);
    const icon = screen.getByTestId('spectator-count-icon');
    expect(icon).toBeInTheDocument();
  });

  it('should disable leave button when disabled prop is true', () => {
    render(
      <SpectatorControls 
        spectatorCount={3} 
        onLeave={mockOnLeave} 
        disabled={true}
      />
    );
    const leaveButton = screen.getByRole('button', { name: /leave/i });
    expect(leaveButton).toBeDisabled();
  });

  it('should not call onLeave when button is disabled', () => {
    render(
      <SpectatorControls 
        spectatorCount={3} 
        onLeave={mockOnLeave} 
        disabled={true}
      />
    );
    const leaveButton = screen.getByRole('button', { name: /leave/i });
    fireEvent.click(leaveButton);
    expect(mockOnLeave).not.toHaveBeenCalled();
  });
});