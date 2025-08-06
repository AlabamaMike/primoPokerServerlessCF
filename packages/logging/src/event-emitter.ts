import { LoggingEventEmitter, LoggingEventListener, LoggingEvent } from './types';

export class SimpleEventEmitter implements LoggingEventEmitter {
  private listeners: Set<LoggingEventListener> = new Set();

  on(listener: LoggingEventListener): void {
    this.listeners.add(listener);
  }

  off(listener: LoggingEventListener): void {
    this.listeners.delete(listener);
  }

  emit(event: LoggingEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // Prevent listener errors from affecting other listeners
        console.error('Error in logging event listener:', error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}