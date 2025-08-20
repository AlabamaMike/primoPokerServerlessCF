import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AsyncButton } from '../AsyncButton';

describe('AsyncButton', () => {
  it('should render children when not loading', () => {
    render(
      <AsyncButton>Click me</AsyncButton>
    );
    
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should render loading state when isLoading is true', () => {
    render(
      <AsyncButton isLoading={true} loadingText="Processing...">
        Click me
      </AsyncButton>
    );
    
    expect(screen.queryByText('Click me')).not.toBeInTheDocument();
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('should render default loading text when isLoading is true and no loadingText provided', () => {
    render(
      <AsyncButton isLoading={true}>
        Click me
      </AsyncButton>
    );
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should be disabled when isLoading is true', () => {
    render(
      <AsyncButton isLoading={true}>
        Click me
      </AsyncButton>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <AsyncButton disabled={true}>
        Click me
      </AsyncButton>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should apply correct variant classes', () => {
    const { rerender } = render(
      <AsyncButton variant="primary">Click me</AsyncButton>
    );
    
    let button = screen.getByRole('button');
    expect(button.className).toContain('from-purple-600');
    
    rerender(
      <AsyncButton variant="secondary">Click me</AsyncButton>
    );
    
    button = screen.getByRole('button');
    expect(button.className).toContain('bg-slate-700');
    
    rerender(
      <AsyncButton variant="danger">Click me</AsyncButton>
    );
    
    button = screen.getByRole('button');
    expect(button.className).toContain('bg-red-600');
  });

  it('should apply correct size classes', () => {
    const { rerender } = render(
      <AsyncButton size="sm">Click me</AsyncButton>
    );
    
    let button = screen.getByRole('button');
    expect(button.className).toContain('text-xs');
    
    rerender(
      <AsyncButton size="md">Click me</AsyncButton>
    );
    
    button = screen.getByRole('button');
    expect(button.className).toContain('text-sm');
    
    rerender(
      <AsyncButton size="lg">Click me</AsyncButton>
    );
    
    button = screen.getByRole('button');
    expect(button.className).toContain('text-base');
  });

  it('should apply full width class when fullWidth is true', () => {
    render(
      <AsyncButton fullWidth={true}>Click me</AsyncButton>
    );
    
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-full');
  });

  it('should apply custom className', () => {
    render(
      <AsyncButton className="custom-class">Click me</AsyncButton>
    );
    
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('should handle click events', () => {
    const handleClick = jest.fn();
    
    render(
      <AsyncButton onClick={handleClick}>Click me</AsyncButton>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalled();
  });

  it('should not handle click events when disabled', () => {
    const handleClick = jest.fn();
    
    render(
      <AsyncButton onClick={handleClick} disabled={true}>
        Click me
      </AsyncButton>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should not handle click events when loading', () => {
    const handleClick = jest.fn();
    
    render(
      <AsyncButton onClick={handleClick} isLoading={true}>
        Click me
      </AsyncButton>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should pass through other button props', () => {
    render(
      <AsyncButton type="submit" data-testid="test-button">
        Click me
      </AsyncButton>
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('data-testid', 'test-button');
  });
});