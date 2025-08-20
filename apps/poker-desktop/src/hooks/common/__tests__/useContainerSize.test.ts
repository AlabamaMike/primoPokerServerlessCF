import { renderHook, act } from '@testing-library/react';
import { useContainerSize } from '../useContainerSize';

// Mock ResizeObserver
const mockResizeObserver = jest.fn();
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

mockResizeObserver.mockReturnValue({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
});

global.ResizeObserver = mockResizeObserver as any;

describe('useContainerSize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return containerRef, width, and height', () => {
    const { result } = renderHook(() => useContainerSize());
    
    expect(result.current).toHaveProperty('containerRef');
    expect(result.current).toHaveProperty('width');
    expect(result.current).toHaveProperty('height');
    expect(result.current.containerRef.current).toBeNull();
    expect(result.current.width).toBe(0);
    expect(result.current.height).toBe(0);
  });

  it('should create ResizeObserver when ref is set', () => {
    const { result } = renderHook(() => useContainerSize());
    
    const element = document.createElement('div');
    
    act(() => {
      result.current.containerRef.current = element;
    });
    
    // Force effect to run
    const { rerender } = renderHook(() => useContainerSize());
    rerender();
    
    expect(mockResizeObserver).toHaveBeenCalled();
    expect(mockObserve).toHaveBeenCalledWith(element);
  });

  it('should update dimensions when resize occurs', () => {
    const { result } = renderHook(() => useContainerSize());
    
    // Get the callback passed to ResizeObserver
    const resizeCallback = mockResizeObserver.mock.calls[0][0];
    
    // Simulate resize
    act(() => {
      resizeCallback([{
        contentRect: {
          width: 800,
          height: 600
        }
      }]);
    });
    
    expect(result.current.width).toBe(800);
    expect(result.current.height).toBe(600);
  });

  it('should disconnect observer on unmount', () => {
    const { result, unmount } = renderHook(() => useContainerSize());
    
    const element = document.createElement('div');
    result.current.containerRef.current = element;
    
    // Force effect to run
    renderHook(() => useContainerSize());
    
    unmount();
    
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should handle ref changes', () => {
    const { result, rerender } = renderHook(() => useContainerSize());
    
    const element1 = document.createElement('div');
    const element2 = document.createElement('div');
    
    // Set first element
    act(() => {
      result.current.containerRef.current = element1;
    });
    rerender();
    
    // Set second element
    act(() => {
      result.current.containerRef.current = element2;
    });
    rerender();
    
    expect(mockObserve).toHaveBeenCalledWith(element1);
    expect(mockObserve).toHaveBeenCalledWith(element2);
  });

  it('should handle null ref', () => {
    const { result, rerender } = renderHook(() => useContainerSize());
    
    act(() => {
      result.current.containerRef.current = null;
    });
    rerender();
    
    expect(mockObserve).not.toHaveBeenCalled();
  });

  it('should handle multiple resize events', () => {
    const { result } = renderHook(() => useContainerSize());
    
    const resizeCallback = mockResizeObserver.mock.calls[0][0];
    
    // First resize
    act(() => {
      resizeCallback([{
        contentRect: {
          width: 400,
          height: 300
        }
      }]);
    });
    
    expect(result.current.width).toBe(400);
    expect(result.current.height).toBe(300);
    
    // Second resize
    act(() => {
      resizeCallback([{
        contentRect: {
          width: 1200,
          height: 800
        }
      }]);
    });
    
    expect(result.current.width).toBe(1200);
    expect(result.current.height).toBe(800);
  });
});