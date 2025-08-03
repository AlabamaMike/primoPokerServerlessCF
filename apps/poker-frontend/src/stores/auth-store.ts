import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api-client'
import { gameWebSocket, tableWebSocket } from '@/lib/websocket-client'
import { TokenManager } from '@/lib/token-manager'

interface User {
  id: string
  username: string
  email: string
  chipCount: number
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  tokenExpiresAt: Date | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  refreshTokens: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        
        try {
          const response = await apiClient.login(username, password)
          
          if (response.success && response.data) {
            const { user, tokens } = response.data
            const accessToken = tokens.accessToken
            const refreshToken = tokens.refreshToken
            const expiresAt = new Date(tokens.expiresAt)
            
            // Set token in API client
            apiClient.setToken(accessToken)
            
            // Set token for WebSocket connections
            gameWebSocket.setToken(accessToken)
            tableWebSocket.setToken(accessToken)
            
            // Set up auto-refresh
            TokenManager.setupAutoRefresh(expiresAt, () => get().refreshTokens())
            
            set({
              user: user,
              token: accessToken,
              refreshToken: refreshToken,
              tokenExpiresAt: expiresAt,
              isAuthenticated: true,
              isLoading: false,
              error: null
            })
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false
          })
          throw error
        }
      },

      register: async (username: string, email: string, password: string) => {
        set({ isLoading: true, error: null })
        
        try {
          const response = await apiClient.register(username, email, password)
          
          if (response.success && response.data) {
            const { tokens } = response.data
            const accessToken = tokens.accessToken
            const refreshToken = tokens.refreshToken
            const expiresAt = new Date(tokens.expiresAt)
            
            // Set token in API client
            apiClient.setToken(accessToken)
            
            // Set token for WebSocket connections
            gameWebSocket.setToken(accessToken)
            tableWebSocket.setToken(accessToken)
            
            // Get user profile
            const profileResponse = await apiClient.getProfile()
            
            if (profileResponse.success && profileResponse.data) {
              // Set up auto-refresh
              TokenManager.setupAutoRefresh(expiresAt, () => get().refreshTokens())
              
              set({
                user: profileResponse.data,
                token: accessToken,
                refreshToken: refreshToken,
                tokenExpiresAt: expiresAt,
                isAuthenticated: true,
                isLoading: false,
                error: null
              })
            }
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false
          })
          throw error
        }
      },

      logout: () => {
        // Clear API client token
        apiClient.clearToken()
        
        // Clear auto-refresh
        TokenManager.clearAutoRefresh()
        
        // Disconnect WebSocket connections
        gameWebSocket.disconnect()
        tableWebSocket.disconnect()
        
        set({
          user: null,
          token: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isAuthenticated: false,
          error: null
        })
      },
      
      refreshTokens: async () => {
        const state = get()
        if (!state.refreshToken) {
          console.error('No refresh token available')
          return
        }
        
        try {
          const response = await apiClient.refreshToken(state.refreshToken)
          
          if (response.success && response.data) {
            const tokens = response.data
            const accessToken = tokens.accessToken
            const refreshToken = tokens.refreshToken
            const expiresAt = new Date(tokens.expiresAt)
            
            // Update tokens
            apiClient.setToken(accessToken)
            gameWebSocket.setToken(accessToken)
            tableWebSocket.setToken(accessToken)
            
            // Set up new auto-refresh
            TokenManager.setupAutoRefresh(expiresAt, () => get().refreshTokens())
            
            set({
              token: accessToken,
              refreshToken: refreshToken,
              tokenExpiresAt: expiresAt
            })
          } else {
            // Refresh failed, logout
            get().logout()
          }
        } catch (error) {
          console.error('Token refresh failed:', error)
          // Refresh failed, logout
          get().logout()
        }
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'auth-storage',
      // Only persist user and tokens, not loading states
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
        isAuthenticated: state.isAuthenticated
      }),
      // Rehydrate the API client and WebSocket on store load
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          apiClient.setToken(state.token)
          gameWebSocket.setToken(state.token)
          tableWebSocket.setToken(state.token)
          
          // Check if token needs refresh
          if (state.tokenExpiresAt) {
            const expiresAt = new Date(state.tokenExpiresAt)
            if (TokenManager.isTokenExpiringSoon(expiresAt)) {
              // Refresh immediately
              state.refreshTokens()
            } else {
              // Set up auto-refresh
              TokenManager.setupAutoRefresh(expiresAt, () => state.refreshTokens())
            }
          }
        }
      }
    }
  )
)
