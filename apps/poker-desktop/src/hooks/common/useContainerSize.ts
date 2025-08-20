import { useRef, useState, useEffect } from 'react';

export interface ContainerDimensions {
  width: number;
  height: number;
}

/**
 * A custom hook for tracking container element dimensions
 * @returns An object containing the ref to attach to the container and its dimensions
 */
export function useContainerSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ContainerDimensions>({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    };

    // Initial measurement
    updateDimensions();

    // ResizeObserver for responsive updates
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  return { containerRef, ...dimensions };
}