import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SpectatorIndicator from './SpectatorIndicator';

describe('SpectatorIndicator', () => {
  it('should render spectator badge', () => {
    render(<SpectatorIndicator />);
    const badge = screen.getByTestId('spectator-indicator');
    expect(badge).toBeInTheDocument();
  });

  it('should display SPECTATOR text', () => {
    render(<SpectatorIndicator />);
    expect(screen.getByText('SPECTATOR')).toBeInTheDocument();
  });

  it('should have appropriate styling for visibility', () => {
    render(<SpectatorIndicator />);
    const badge = screen.getByTestId('spectator-indicator');
    expect(badge).toHaveClass('spectator-badge');
  });

  it('should apply additional className when provided', () => {
    render(<SpectatorIndicator className="custom-class" />);
    const badge = screen.getByTestId('spectator-indicator');
    expect(badge).toHaveClass('custom-class');
  });

  it('should support different sizes', () => {
    const { rerender } = render(<SpectatorIndicator size="small" />);
    let badge = screen.getByTestId('spectator-indicator');
    expect(badge).toHaveClass('text-xs');

    rerender(<SpectatorIndicator size="medium" />);
    badge = screen.getByTestId('spectator-indicator');
    expect(badge).toHaveClass('text-sm');

    rerender(<SpectatorIndicator size="large" />);
    badge = screen.getByTestId('spectator-indicator');
    expect(badge).toHaveClass('text-base');
  });

  it('should include eye icon', () => {
    render(<SpectatorIndicator />);
    const icon = screen.getByTestId('spectator-icon');
    expect(icon).toBeInTheDocument();
  });
});