interface QueuedAction {
  id: string;
  action: string;
  payload: any;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

interface OfflineQueueConfig {
  maxQueueSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  persistQueue?: boolean;
  storageKey?: string;
}

export class OfflineQueue {
  private queue: QueuedAction[] = [];
  private processing = false;
  private config: Required<OfflineQueueConfig>;
  private listeners: ((queue: QueuedAction[]) => void)[] = [];
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: OfflineQueueConfig = {}) {
    this.config = {
      maxQueueSize: config.maxQueueSize || 50,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      backoffMultiplier: config.backoffMultiplier || 2,
      persistQueue: config.persistQueue ?? true,
      storageKey: config.storageKey || 'offline-queue'
    };

    if (this.config.persistQueue) {
      this.loadFromStorage();
    }
  }

  /**
   * Add an action to the queue
   */
  enqueue(
    action: string,
    payload: any,
    options: {
      onSuccess?: (result: any) => void;
      onError?: (error: Error) => void;
      maxRetries?: number;
    } = {}
  ): string {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedAction: QueuedAction = {
      id,
      action,
      payload,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: options.maxRetries || this.config.maxRetries,
      onSuccess: options.onSuccess,
      onError: options.onError
    };

    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      const error = new Error(`Queue size limit (${this.config.maxQueueSize}) exceeded`);
      options.onError?.(error);
      return id;
    }

    this.queue.push(queuedAction);
    this.notifyListeners();
    
    if (this.config.persistQueue) {
      this.saveToStorage();
    }

    return id;
  }

  /**
   * Remove an action from the queue
   */
  dequeue(id: string): void {
    this.queue = this.queue.filter(item => item.id !== id);
    this.notifyListeners();
    
    if (this.config.persistQueue) {
      this.saveToStorage();
    }

    // Clear any pending retry timeout
    const timeout = this.retryTimeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(id);
    }
  }

  /**
   * Process all queued actions
   */
  async processQueue(
    actionHandler: (action: string, payload: any) => Promise<any>
  ): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    const processedIds: string[] = [];

    for (const queuedAction of [...this.queue]) {
      try {
        const result = await actionHandler(queuedAction.action, queuedAction.payload);
        
        // Success - remove from queue
        this.dequeue(queuedAction.id);
        queuedAction.onSuccess?.(result);
        processedIds.push(queuedAction.id);
      } catch (error) {
        // Handle retry logic
        queuedAction.retryCount++;
        
        if (queuedAction.retryCount >= queuedAction.maxRetries) {
          // Max retries reached - remove from queue
          this.dequeue(queuedAction.id);
          queuedAction.onError?.(error as Error);
        } else {
          // Schedule retry with exponential backoff
          const delay = this.calculateRetryDelay(queuedAction.retryCount);
          
          const timeout = setTimeout(() => {
            this.retryTimeouts.delete(queuedAction.id);
            // Trigger single retry
            this.processSingleAction(queuedAction, actionHandler);
          }, delay);
          
          this.retryTimeouts.set(queuedAction.id, timeout);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Process a single action (used for retries)
   */
  private async processSingleAction(
    queuedAction: QueuedAction,
    actionHandler: (action: string, payload: any) => Promise<any>
  ): Promise<void> {
    try {
      const result = await actionHandler(queuedAction.action, queuedAction.payload);
      this.dequeue(queuedAction.id);
      queuedAction.onSuccess?.(result);
    } catch (error) {
      queuedAction.retryCount++;
      
      if (queuedAction.retryCount >= queuedAction.maxRetries) {
        this.dequeue(queuedAction.id);
        queuedAction.onError?.(error as Error);
      } else {
        // Schedule another retry
        const delay = this.calculateRetryDelay(queuedAction.retryCount);
        
        const timeout = setTimeout(() => {
          this.retryTimeouts.delete(queuedAction.id);
          this.processSingleAction(queuedAction, actionHandler);
        }, delay);
        
        this.retryTimeouts.set(queuedAction.id, timeout);
      }
    }

    // Update storage after changes
    if (this.config.persistQueue) {
      this.saveToStorage();
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    return this.config.retryDelay * Math.pow(this.config.backoffMultiplier, retryCount - 1);
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get all queued actions
   */
  getQueue(): QueuedAction[] {
    return [...this.queue];
  }

  /**
   * Clear all queued actions
   */
  clear(): void {
    // Clear all retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
    
    this.queue = [];
    this.notifyListeners();
    
    if (this.config.persistQueue) {
      this.removeFromStorage();
    }
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: (queue: QueuedAction[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of queue changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.getQueue()));
  }

  /**
   * Load queue from storage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.queue = parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load offline queue from storage:', error);
    }
  }

  /**
   * Save queue to storage
   */
  private saveToStorage(): void {
    try {
      // Only save essential data (not callbacks)
      const toStore = this.queue.map(({ id, action, payload, timestamp, retryCount, maxRetries }) => ({
        id,
        action,
        payload,
        timestamp,
        retryCount,
        maxRetries
      }));
      localStorage.setItem(this.config.storageKey, JSON.stringify(toStore));
    } catch (error) {
      console.error('Failed to save offline queue to storage:', error);
    }
  }

  /**
   * Remove queue from storage
   */
  private removeFromStorage(): void {
    try {
      localStorage.removeItem(this.config.storageKey);
    } catch (error) {
      console.error('Failed to remove offline queue from storage:', error);
    }
  }
}

// Create a singleton instance for the application
export const offlineQueue = new OfflineQueue({
  maxQueueSize: 100,
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 2,
  persistQueue: true,
  storageKey: 'poker-offline-queue'
});