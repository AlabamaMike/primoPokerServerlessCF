import { ChatMessage } from '../types';

const STORAGE_KEY_PREFIX = 'poker-chat-messages-';
const MAX_PERSISTED_MESSAGES = 50;

/**
 * Saves chat messages to localStorage for a specific table
 * @param tableId The table ID
 * @param messages The messages to save
 */
export function saveChatMessages(tableId: string, messages: ChatMessage[]): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    const messagesToSave = messages.slice(-MAX_PERSISTED_MESSAGES);
    localStorage.setItem(key, JSON.stringify(messagesToSave));
  } catch (error) {
    // Handle localStorage quota exceeded or other errors silently
    // Could log to monitoring service in production
  }
}

/**
 * Loads chat messages from localStorage for a specific table
 * @param tableId The table ID
 * @returns Array of chat messages
 */
export function loadChatMessages(tableId: string): ChatMessage[] {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      return [];
    }
    
    const messages = JSON.parse(stored) as ChatMessage[];
    
    // Validate and convert timestamps
    return messages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
  } catch (error) {
    // Handle parse errors silently
    return [];
  }
}

/**
 * Clears chat messages for a specific table
 * @param tableId The table ID
 */
export function clearChatMessages(tableId: string): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tableId}`;
    localStorage.removeItem(key);
  } catch (error) {
    // Handle errors silently
  }
}

/**
 * Clears all chat messages from localStorage
 */
export function clearAllChatMessages(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    // Handle errors silently
  }
}