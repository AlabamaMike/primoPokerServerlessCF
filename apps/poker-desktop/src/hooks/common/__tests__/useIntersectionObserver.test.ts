import { renderHook } from '@testing-library/react';
import { useIntersectionObserver } from '../useIntersectionObserver';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

mockIntersectionObserver.mockReturnValue({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
});

global.IntersectionObserver = mockIntersectionObserver as any;

describe('useIntersectionObserver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a ref and isIntersecting state', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    
    expect(result.current).toHaveProperty('ref');
    expect(result.current).toHaveProperty('isIntersecting');
    expect(result.current.ref.current).toBeNull();
    expect(result.current.isIntersecting).toBe(false);
  });

  it('should create IntersectionObserver with default options', () => {
    renderHook(() => useIntersectionObserver());
    
    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      {
        root: null,
        rootMargin: '0px',
        threshold: 0
      }
    );
  });

  it('should create IntersectionObserver with custom options', () => {
    const customOptions = {
      root: null,
      rootMargin: '10px',
      threshold: 0.5
    };
    
    renderHook(() => useIntersectionObserver(customOptions));
    
    expect(mockIntersectionObserver).toHaveBeenCalledWith(
      expect.any(Function),
      customOptions
    );
  });

  it('should observe element when ref is set', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    
    const element = document.createElement('div');
    result.current.ref.current = element;
    
    // Trigger effect by rerendering
    renderHook(() => useIntersectionObserver());
    
    expect(mockObserve).toHaveBeenCalledWith(element);
  });

  it('should disconnect observer on unmount', () => {
    const { unmount } = renderHook(() => useIntersectionObserver());
    
    unmount();
    
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should update isIntersecting when element intersects', () => {
    const { result } = renderHook(() => useIntersectionObserver());
    
    // Get the callback passed to IntersectionObserver
    const observerCallback = mockIntersectionObserver.mock.calls[0][0];
    
    // Simulate intersection
    observerCallback([{ isIntersecting: true }]);
    
    expect(result.current.isIntersecting).toBe(true);
    
    // Simulate no intersection
    observerCallback([{ isIntersecting: false }]);
    
    expect(result.current.isIntersecting).toBe(false);
  });

  it('should unobserve previous element when ref changes', () => {
    const { result, rerender } = renderHook(() => useIntersectionObserver());
    
    const element1 = document.createElement('div');
    const element2 = document.createElement('div');
    
    // Set first element
    result.current.ref.current = element1;
    rerender();
    
    // Set second element
    result.current.ref.current = element2;
    rerender();
    
    expect(mockUnobserve).toHaveBeenCalledWith(element1);
    expect(mockObserve).toHaveBeenCalledWith(element2);
  });

  it('should handle null ref', () => {
    const { result, rerender } = renderHook(() => useIntersectionObserver());
    
    result.current.ref.current = null;
    rerender();
    
    expect(mockObserve).not.toHaveBeenCalled();
  });
});