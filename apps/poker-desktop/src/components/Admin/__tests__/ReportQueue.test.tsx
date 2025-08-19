import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReportQueue } from '../ReportQueue'
import { useAdminApi } from '../../../hooks/useAdminApi'

jest.mock('../../../hooks/useAdminApi')

const mockUseAdminApi = useAdminApi as jest.MockedFunction<typeof useAdminApi>

describe('ReportQueue', () => {
  const mockGetReports = jest.fn()
  const mockProcessReport = jest.fn()
  const mockGetReportStats = jest.fn()

  const mockReports = [
    {
      id: 'report1',
      messageId: 'msg1',
      playerId: 'player1',
      reportedBy: 'player2',
      reason: 'Harassment',
      reportedAt: Date.now() - 3600000,
      status: 'PENDING' as const,
    },
    {
      id: 'report2',
      messageId: 'msg2',
      playerId: 'player3',
      reportedBy: 'player4',
      reason: 'Spam',
      reportedAt: Date.now() - 7200000,
      status: 'PENDING' as const,
    },
  ]

  const mockStats = {
    pendingCount: 5,
    todayCount: 12,
    weekCount: 45,
    approvalRate: 0.75,
    averageResponseTime: 2.5,
    repeatOffenders: [
      { playerId: 'player5', username: 'ToxicPlayer', reportCount: 8 },
      { playerId: 'player6', username: 'Spammer123', reportCount: 5 },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAdminApi.mockReturnValue({
      getStats: jest.fn(),
      searchChatLogs: jest.fn(),
      getReports: mockGetReports,
      processReport: mockProcessReport,
      applyAction: jest.fn(),
      bulkApplyActions: jest.fn(),
      getActiveActions: jest.fn(),
      getPlayerActionHistory: jest.fn(),
      updateAction: jest.fn(),
      revokeAction: jest.fn(),
      getReportStats: mockGetReportStats,
    })

    mockGetReports.mockResolvedValue(mockReports)
    mockGetReportStats.mockResolvedValue(mockStats)
  })

  it('renders loading state initially', () => {
    render(<ReportQueue />)
    expect(screen.getByText('Loading reports...')).toBeInTheDocument()
  })

  it('displays reports and statistics after loading', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
      expect(screen.getByText('Spam')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument() // Pending count
      expect(screen.getByText('75.0%')).toBeInTheDocument() // Approval rate
    })
  })

  it('shows repeat offenders', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('ToxicPlayer')).toBeInTheDocument()
      expect(screen.getByText('(8 reports)')).toBeInTheDocument()
      expect(screen.getByText('Spammer123')).toBeInTheDocument()
      expect(screen.getByText('(5 reports)')).toBeInTheDocument()
    })
  })

  it('filters reports by status', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    const filterSelect = screen.getByRole('combobox', { name: undefined })
    fireEvent.change(filterSelect, { target: { value: 'APPROVED' } })

    await waitFor(() => {
      expect(mockGetReports).toHaveBeenCalledWith({ status: 'APPROVED' })
    })
  })

  it('handles report approval', async () => {
    window.prompt = jest.fn(() => 'WARNING')
    
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    const approveButtons = screen.getAllByText('Approve')
    fireEvent.click(approveButtons[0])

    await waitFor(() => {
      expect(mockProcessReport).toHaveBeenCalledWith({
        reportId: 'report1',
        decision: 'APPROVED',
        actionType: 'WARNING',
        notes: undefined,
      })
    })
  })

  it('handles report rejection', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    const rejectButtons = screen.getAllByText('Reject')
    fireEvent.click(rejectButtons[0])

    await waitFor(() => {
      expect(mockProcessReport).toHaveBeenCalledWith({
        reportId: 'report1',
        decision: 'REJECTED',
        actionType: undefined,
        notes: undefined,
      })
    })
  })

  it('handles bulk selection and processing', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    // Select all reports
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
    fireEvent.click(selectAllCheckbox)

    // Should show bulk action controls
    expect(screen.getByText('Process 2 Reports')).toBeInTheDocument()

    // Select bulk action
    const bulkActionSelect = screen.getByDisplayValue('Select Bulk Action')
    fireEvent.change(bulkActionSelect, { target: { value: 'APPROVED' } })

    // Select action type
    const actionTypeSelect = screen.getByDisplayValue('Select Action Type')
    fireEvent.change(actionTypeSelect, { target: { value: 'WARNING' } })

    // Process bulk
    const processButton = screen.getByText('Process 2 Reports')
    fireEvent.click(processButton)

    await waitFor(() => {
      expect(mockProcessReport).toHaveBeenCalledTimes(2)
    })
  })

  it('toggles individual report selection', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox').slice(1) // Skip select all
    fireEvent.click(checkboxes[0])

    expect(screen.getByText('Process 1 Reports')).toBeInTheDocument()
  })

  it('refreshes data when Refresh button is clicked', async () => {
    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Harassment')).toBeInTheDocument()
    })

    mockGetReports.mockClear()
    mockGetReportStats.mockClear()

    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(mockGetReports).toHaveBeenCalled()
      expect(mockGetReportStats).toHaveBeenCalled()
    })
  })

  it('handles errors gracefully', async () => {
    mockGetReports.mockRejectedValue(new Error('API Error'))

    render(<ReportQueue />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load reports')).toBeInTheDocument()
    })
  })
})