import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../Modal';

describe('Modal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('should render with title', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Test Modal').id).toBe('modal-title');
  });

  it('should call onClose when clicking backdrop', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    const backdrop = screen.getByRole('dialog').parentElement;
    fireEvent.click(backdrop!);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not call onClose when clicking modal content', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    fireEvent.click(screen.getByText('Modal Content'));
    
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should call onClose when clicking close button', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} showCloseButton={true}>
        <div>Modal Content</div>
      </Modal>
    );
    
    const closeButton = screen.getByLabelText('Close modal');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not show close button when showCloseButton is false', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} showCloseButton={false}>
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
  });

  it('should call onClose when Escape key is pressed', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should apply correct size classes', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={mockOnClose} size="sm">
        <div>Modal Content</div>
      </Modal>
    );
    
    let modalContent = screen.getByText('Modal Content').parentElement;
    expect(modalContent?.className).toContain('max-w-sm');
    
    rerender(
      <Modal isOpen={true} onClose={mockOnClose} size="lg">
        <div>Modal Content</div>
      </Modal>
    );
    
    modalContent = screen.getByText('Modal Content').parentElement;
    expect(modalContent?.className).toContain('max-w-lg');
  });

  it('should apply custom className', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} className="custom-class">
        <div>Modal Content</div>
      </Modal>
    );
    
    const modalContent = screen.getByText('Modal Content').parentElement;
    expect(modalContent?.className).toContain('custom-class');
  });

  it('should set body overflow to hidden when open', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('should restore body overflow when closed', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    rerender(
      <Modal isOpen={false} onClose={mockOnClose}>
        <div>Modal Content</div>
      </Modal>
    );
    
    expect(document.body.style.overflow).toBe('unset');
  });

  it('should have proper ARIA attributes', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose} title="Test Modal">
        <div>Modal Content</div>
      </Modal>
    );
    
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it('should handle Tab key for focus trap', () => {
    render(
      <Modal isOpen={true} onClose={mockOnClose}>
        <button>First Button</button>
        <button>Second Button</button>
        <button>Third Button</button>
      </Modal>
    );
    
    const buttons = screen.getAllByRole('button');
    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    
    // Focus last button and press Tab
    lastButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    
    // Should wrap to first button
    expect(document.activeElement).toBe(firstButton);
    
    // Focus first button and press Shift+Tab
    firstButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    
    // Should wrap to last button
    expect(document.activeElement).toBe(lastButton);
  });
});