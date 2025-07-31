import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api-client'
import { gameWebSocket, tableWebSocket } from '@/lib/websocket-client'

interface User {
  id: string
  username: string
  email: string
  chipCount: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  login: (username: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
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
            
            // Set token in API client
            apiClient.setToken(accessToken)
            
            // Set token for WebSocket connections
            gameWebSocket.setToken(accessToken)
            tableWebSocket.setToken(accessToken)
            
            set({
              user: user,
              token: accessToken,
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
            
            // Set token in API client
            apiClient.setToken(accessToken)
            
            // Set token for WebSocket connections
            gameWebSocket.setToken(accessToken)
            tableWebSocket.setToken(accessToken)
            
            // Get user profile
            const profileResponse = await apiClient.getProfile()
            
            if (profileResponse.success && profileResponse.data) {
              set({
                user: profileResponse.data,
                token: accessToken,
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
        
        // Disconnect WebSocket connections
        gameWebSocket.disconnect()
        tableWebSocket.disconnect()
        
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        })
      },

      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'auth-storage',
      // Only persist user and token, not loading states
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      // Rehydrate the API client and WebSocket on store load
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          apiClient.setToken(state.token)
          gameWebSocket.setToken(state.token)
          tableWebSocket.setToken(state.token)
        }
      }
    }
  )
)
