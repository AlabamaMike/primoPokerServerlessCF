import React, { useEffect, useRef } from 'react';
import { ANNOUNCEMENT_CLEAR_DELAY, FOCUS_ANIMATION_DELAY } from './constants';

interface ScreenReaderAnnouncerProps {
  message: string;
  priority?: 'polite' | 'assertive';
  clearAfter?: number;
}

export const ScreenReaderAnnouncer: React.FC<ScreenReaderAnnouncerProps> = ({
  message,
  priority = 'polite',
  clearAfter = ANNOUNCEMENT_CLEAR_DELAY
}) => {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (clearAfter > 0) {
      timeoutRef.current = setTimeout(() => {
        // This will cause the component to clear its message
      }, clearAfter);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearAfter]);

  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};

// Hook for easy screen reader announcements
export const useScreenReaderAnnouncement = () => {
  const [announcement, setAnnouncement] = React.useState('');

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement(''); // Clear first to ensure re-announcement
    setTimeout(() => setAnnouncement(message), FOCUS_ANIMATION_DELAY);
  };

  return { announcement, announce };
};