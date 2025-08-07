import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AdminAuth } from '../AdminAuth'
import { useAuthStore } from '../../../stores/auth-store'
import { useNavigate } from 'react-router-dom'

// Mock dependencies
jest.mock('../../../stores/auth-store')
jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
}))

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>
const mockUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>

describe('AdminAuth', () => {
  const mockNavigate = jest.fn()
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseNavigate.mockReturnValue(mockNavigate)
  })

  describe('Authentication', () => {
    it('should redirect non-authenticated users to login', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: false,
        user: null,
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      render(<AdminAuth />)
      
      expect(mockNavigate).toHaveBeenCalledWith('/login', { 
        state: { from: '/admin' } 
      })
    })

    it('should redirect non-admin users to home', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'player123',
          username: 'regularuser',
          email: 'user@example.com',
          roles: ['player'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      render(<AdminAuth />)
      
      expect(mockNavigate).toHaveBeenCalledWith('/', { 
        state: { error: 'Access denied. Admin privileges required.' } 
      })
    })

    it('should allow moderators to access admin area', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'mod123',
          username: 'moderator',
          email: 'mod@example.com',
          roles: ['moderator'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      const { container } = render(<AdminAuth />)
      
      expect(mockNavigate).not.toHaveBeenCalled()
      expect(container.querySelector('.admin-container')).toBeInTheDocument()
    })

    it('should allow admins to access admin area', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'admin123',
          username: 'administrator',
          email: 'admin@example.com',
          roles: ['admin'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      const { container } = render(<AdminAuth />)
      
      expect(mockNavigate).not.toHaveBeenCalled()
      expect(container.querySelector('.admin-container')).toBeInTheDocument()
    })
  })

  describe('Role-based Feature Access', () => {
    it('should show all features for admins', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'admin123',
          username: 'administrator',
          email: 'admin@example.com',
          roles: ['admin'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      render(<AdminAuth />)
      
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Chat Logs')).toBeInTheDocument()
      expect(screen.getByText('Reports')).toBeInTheDocument()
      expect(screen.getByText('Ban Management')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should show limited features for moderators', () => {
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'mod123',
          username: 'moderator',
          email: 'mod@example.com',
          roles: ['moderator'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
      })

      render(<AdminAuth />)
      
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Chat Logs')).toBeInTheDocument()
      expect(screen.getByText('Reports')).toBeInTheDocument()
      expect(screen.getByText('Ban Management')).toBeInTheDocument()
      expect(screen.queryByText('Settings')).not.toBeInTheDocument()
    })
  })

  describe('Session Management', () => {
    it('should handle logout correctly', async () => {
      const mockLogout = jest.fn()
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'admin123',
          username: 'administrator',
          email: 'admin@example.com',
          roles: ['admin'],
        },
        login: jest.fn(),
        logout: mockLogout,
        setUser: jest.fn(),
      })

      render(<AdminAuth />)
      
      const logoutButton = screen.getByText('Logout')
      fireEvent.click(logoutButton)
      
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith('/login')
      })
    })

    it('should refresh auth token periodically', async () => {
      jest.useFakeTimers()
      
      const mockRefreshToken = jest.fn().mockResolvedValue(undefined)
      mockUseAuthStore.mockReturnValue({
        isAuthenticated: true,
        user: {
          playerId: 'admin123',
          username: 'administrator',
          email: 'admin@example.com',
          roles: ['admin'],
        },
        login: jest.fn(),
        logout: jest.fn(),
        setUser: jest.fn(),
        refreshToken: mockRefreshToken,
      })

      render(<AdminAuth />)
      
      // Fast-forward 30 minutes
      jest.advanceTimersByTime(30 * 60 * 1000)
      
      await waitFor(() => {
        expect(mockRefreshToken).toHaveBeenCalled()
      })
      
      jest.useRealTimers()
    })
  })
})