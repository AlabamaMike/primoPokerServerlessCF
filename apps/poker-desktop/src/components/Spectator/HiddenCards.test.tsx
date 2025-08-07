import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HiddenCards from './HiddenCards';

describe('HiddenCards', () => {
  it('should render the correct number of hidden cards', () => {
    render(<HiddenCards count={2} />);
    const cards = screen.getAllByTestId('hidden-card');
    expect(cards).toHaveLength(2);
  });

  it('should render default 2 cards when no count provided', () => {
    render(<HiddenCards />);
    const cards = screen.getAllByTestId('hidden-card');
    expect(cards).toHaveLength(2);
  });

  it('should apply additional className', () => {
    render(<HiddenCards count={2} className="custom-class" />);
    const container = screen.getByTestId('hidden-cards-container');
    expect(container).toHaveClass('custom-class');
  });

  it('should display card back pattern on each card', () => {
    render(<HiddenCards count={1} />);
    const card = screen.getByTestId('hidden-card');
    expect(card).toHaveClass('card-back');
  });

  it('should handle different card counts', () => {
    const { rerender } = render(<HiddenCards count={4} />);
    let cards = screen.getAllByTestId('hidden-card');
    expect(cards).toHaveLength(4);

    rerender(<HiddenCards count={1} />);
    cards = screen.getAllByTestId('hidden-card');
    expect(cards).toHaveLength(1);
  });
});