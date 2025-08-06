import { create } from 'zustand';
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

interface AuthError {
  message: string;
  code?: string;
  timestamp: Date;
  details?: Record<string, any>;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;
  tokenExpiry: Date | null;
  
  // Actions
  login: (apiUrl: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  tokenExpiry: null,

  login: async (apiUrl: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await testSafeInvoke<{
        user: User;
        tokens: {
          accessToken: string;
          refreshToken: string;
          expiresAt?: string;
        };
        message: string;
      }>('login', { apiUrl, email, password });
      
      const tokenExpiry = response.tokens.expiresAt 
        ? new Date(response.tokens.expiresAt)
        : new Date(Date.now() + 3600000); // Default 1 hour
      
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        tokenExpiry,
      });
    } catch (error) {
      const authError: AuthError = {
        message: typeof error === 'string' ? error : 'Login failed',
        code: 'LOGIN_ERROR',
        timestamp: new Date(),
        details: typeof error === 'object' ? error : undefined
      };
      
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: authError,
      });
      throw authError;
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
        tokenExpiry: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
      const authError: AuthError = {
        message: 'Logout failed, but clearing local session',
        code: 'LOGOUT_ERROR',
        timestamp: new Date(),
      };
      
      // Even if logout fails, clear local state
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: authError,
        tokenExpiry: null,
      });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const token = await testSafeInvoke<AuthToken | null>('get_auth_token');
      
      if (token) {
        const tokenExpiry = new Date(token.expires_at);
        const now = new Date();
        
        if (tokenExpiry < now) {
          // Token expired
          await get().refreshToken();
        } else {
          // TODO: Fetch user details with token
          // For now, just mark as authenticated
          set({
            isAuthenticated: true,
            isLoading: false,
            tokenExpiry,
          });
        }
      } else {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          tokenExpiry: null,
        });
      }
    } catch (error) {
      console.error('Auth check error:', error);
      const authError: AuthError = {
        message: 'Failed to verify authentication status',
        code: 'AUTH_CHECK_ERROR',
        timestamp: new Date(),
      };
      
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: authError,
        tokenExpiry: null,
      });
    }
  },
  
  clearError: () => {
    set({ error: null });
  },
  
  refreshToken: async () => {
    try {
      const token = await testSafeInvoke<AuthToken | null>('refresh_auth_token');
      
      if (token) {
        const tokenExpiry = new Date(token.expires_at);
        set({
          tokenExpiry,
          error: null,
        });
      } else {
        throw new Error('Failed to refresh token');
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      const authError: AuthError = {
        message: 'Session expired. Please login again.',
        code: 'TOKEN_REFRESH_ERROR',
        timestamp: new Date(),
      };
      
      set({
        user: null,
        isAuthenticated: false,
        error: authError,
        tokenExpiry: null,
      });
      
      throw authError;
    }
  },
}));