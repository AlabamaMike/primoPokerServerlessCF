import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { LobbyStats } from '../services/lobby-service';
import { logger } from './middleware/logger';

export interface UIState {
  // View state
  view: 'grid' | 'list';
  isFilterSidebarOpen: boolean;
  isQuickSeatModalOpen: boolean;
  
  // Stats
  stats: LobbyStats;
  
  // Notifications
  notifications: Notification[];
  
  // Actions
  setView: (view: 'grid' | 'list') => void;
  toggleFilterSidebar: () => void;
  setFilterSidebarOpen: (isOpen: boolean) => void;
  setQuickSeatModalOpen: (isOpen: boolean) => void;
  updateStats: (stats: LobbyStats) => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
  autoClose?: boolean;
}

export const useUIStore = create<UIState>()(
  logger(
    devtools(
      subscribeWithSelector((set, get) => ({
    // Initial state
    view: 'list',
    isFilterSidebarOpen: false,
    isQuickSeatModalOpen: false,
    stats: {
      playersOnline: 0,
      activeTables: 0,
      totalPot: 0
    },
    notifications: [],

    // Actions
    setView: (view) => {
      set({ view });
      localStorage.setItem('lobbyView', view);
    },

    toggleFilterSidebar: () => {
      set((state) => ({ isFilterSidebarOpen: !state.isFilterSidebarOpen }));
    },

    setFilterSidebarOpen: (isOpen) => {
      set({ isFilterSidebarOpen: isOpen });
    },

    setQuickSeatModalOpen: (isOpen) => {
      set({ isQuickSeatModalOpen: isOpen });
    },

    updateStats: (stats) => {
      set({ stats });
    },

    addNotification: (notification) => {
      set((state) => ({
        notifications: [...state.notifications, notification]
      }));

      // Auto-remove notification after 5 seconds if autoClose is true
      if (notification.autoClose) {
        setTimeout(() => {
          get().removeNotification(notification.id);
        }, 5000);
      }
    },

    removeNotification: (id) => {
      set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }));
    },

    clearNotifications: () => {
      set({ notifications: [] });
    }
  })),
      { name: 'ui-store' }
    ),
    'UIStore'
  )
);