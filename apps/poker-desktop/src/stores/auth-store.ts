import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { testSafeInvoke } from '../utils/test-utils';

interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
}

interface AuthToken {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (apiUrl: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (apiUrl: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await testSafeInvoke<{
        user: User;
        tokens: {
          accessToken: string;
          refreshToken: string;
        };
        message: string;
      }>('login', { apiUrl, email, password });
      
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error as string,
      });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    
    try {
      await testSafeInvoke('logout');
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, clear local state
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true });
    
    try {
      const token = await testSafeInvoke<AuthToken | null>('get_auth_token');
      
      if (token) {
        // TODO: Fetch user details with token
        // For now, just mark as authenticated
        set({
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Auth check error:', error);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));