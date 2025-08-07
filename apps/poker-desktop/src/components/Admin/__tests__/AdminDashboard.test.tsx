import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AdminDashboard } from '../AdminDashboard'
import { useAdminApi } from '../../../hooks/useAdminApi'

// Mock dependencies
jest.mock('../../../hooks/useAdminApi')

const mockUseAdminApi = useAdminApi as jest.MockedFunction<typeof useAdminApi>

describe('AdminDashboard', () => {
  const mockStats = {
    actions: {
      total_warnings: 45,
      total_mutes: 23,
      total_shadow_bans: 5,
      total_bans: 2,
      active_actions: 12,
      affected_players: 65,
    },
    reports: {
      total_reports: 156,
      pending_reports: 8,
      approved_reports: 120,
      rejected_reports: 28,
    },
    recentActivity: [
      {
        id: '1',
        type: 'WARNING',
        playerId: 'player123',
        username: 'testuser',
        reason: 'Inappropriate language',
        appliedBy: 'mod456',
        appliedAt: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      },
      {
        id: '2',
        type: 'MUTE',
        playerId: 'player789',
        username: 'spammer',
        reason: 'Spamming chat',
        appliedBy: 'admin123',
        appliedAt: Date.now() - 1000 * 60 * 30, // 30 minutes ago
        expiresAt: Date.now() + 1000 * 60 * 30, // expires in 30 minutes
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Statistics Display', () => {
    it('should display moderation statistics', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Moderation Statistics')).toBeInTheDocument()
        expect(screen.getByText('45')).toBeInTheDocument() // warnings
        expect(screen.getByText('Warnings')).toBeInTheDocument()
        expect(screen.getByText('23')).toBeInTheDocument() // mutes
        expect(screen.getByText('Mutes')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument() // shadow bans
        expect(screen.getByText('Shadow Bans')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument() // bans
        expect(screen.getByText('Bans')).toBeInTheDocument()
      })
    })

    it('should display report statistics', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Report Statistics')).toBeInTheDocument()
        expect(screen.getByText('8')).toBeInTheDocument() // pending
        expect(screen.getByText('Pending')).toBeInTheDocument()
        expect(screen.getByText('156')).toBeInTheDocument() // total
        expect(screen.getByText('Total Reports')).toBeInTheDocument()
      })
    })

    it('should handle loading state', () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockReturnValue(new Promise(() => {})), // Never resolves
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      expect(screen.getByText('Loading statistics...')).toBeInTheDocument()
    })

    it('should handle error state', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockRejectedValue(new Error('Failed to load stats')),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load statistics')).toBeInTheDocument()
      })
    })
  })

  describe('Recent Activity', () => {
    it('should display recent moderation activity', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument()
        expect(screen.getByText('testuser')).toBeInTheDocument()
        expect(screen.getByText('Inappropriate language')).toBeInTheDocument()
        expect(screen.getByText('spammer')).toBeInTheDocument()
        expect(screen.getByText('Spamming chat')).toBeInTheDocument()
      })
    })

    it('should show relative time for actions', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('5 minutes ago')).toBeInTheDocument()
        expect(screen.getByText('30 minutes ago')).toBeInTheDocument()
      })
    })

    it('should show expiration time for temporary actions', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText(/expires in/i)).toBeInTheDocument()
      })
    })
  })

  describe('Quick Actions', () => {
    it('should display quick action buttons', async () => {
      mockUseAdminApi.mockReturnValue({
        getStats: jest.fn().mockResolvedValue(mockStats),
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(screen.getByText('View Pending Reports')).toBeInTheDocument()
        expect(screen.getByText('Search Chat Logs')).toBeInTheDocument()
        expect(screen.getByText('Manage Bans')).toBeInTheDocument()
      })
    })
  })

  describe('Auto-refresh', () => {
    it('should refresh statistics periodically', async () => {
      jest.useFakeTimers()
      
      const mockGetStats = jest.fn().mockResolvedValue(mockStats)
      mockUseAdminApi.mockReturnValue({
        getStats: mockGetStats,
        searchChatLogs: jest.fn(),
        getReports: jest.fn(),
        processReport: jest.fn(),
        applyAction: jest.fn(),
        bulkApplyActions: jest.fn(),
      })

      render(<AdminDashboard />)

      await waitFor(() => {
        expect(mockGetStats).toHaveBeenCalledTimes(1)
      })

      // Fast-forward 30 seconds
      jest.advanceTimersByTime(30 * 1000)

      await waitFor(() => {
        expect(mockGetStats).toHaveBeenCalledTimes(2)
      })

      jest.useRealTimers()
    })
  })
})