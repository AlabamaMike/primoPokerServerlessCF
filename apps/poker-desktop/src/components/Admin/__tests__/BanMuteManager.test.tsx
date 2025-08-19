import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BanMuteManager } from '../BanMuteManager'
import { useAdminApi } from '../../../hooks/useAdminApi'

jest.mock('../../../hooks/useAdminApi')

const mockUseAdminApi = useAdminApi as jest.MockedFunction<typeof useAdminApi>

describe('BanMuteManager', () => {
  const mockGetActiveActions = jest.fn()
  const mockGetPlayerActionHistory = jest.fn()
  const mockUpdateAction = jest.fn()
  const mockRevokeAction = jest.fn()

  const mockActiveActions = [
    {
      id: 'action1',
      type: 'MUTE',
      playerId: 'player1',
      username: 'TestUser1',
      reason: 'Spamming',
      appliedBy: 'admin1',
      appliedAt: Date.now() - 3600000,
      expiresAt: Date.now() + 3600000,
      isActive: true,
    },
    {
      id: 'action2',
      type: 'BAN',
      playerId: 'player2',
      username: 'TestUser2',
      reason: 'Cheating',
      appliedBy: 'admin1',
      appliedAt: Date.now() - 7200000,
      isActive: true,
    },
  ]

  const mockPlayerHistory = [
    {
      playerId: 'player1',
      username: 'TestUser1',
      totalActions: 5,
      warnings: 2,
      mutes: 2,
      shadowBans: 0,
      bans: 1,
      lastActionAt: Date.now() - 3600000,
    },
    {
      playerId: 'player2',
      username: 'TestUser2',
      totalActions: 3,
      warnings: 1,
      mutes: 1,
      shadowBans: 0,
      bans: 1,
      lastActionAt: Date.now() - 7200000,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAdminApi.mockReturnValue({
      getStats: jest.fn(),
      searchChatLogs: jest.fn(),
      getReports: jest.fn(),
      processReport: jest.fn(),
      applyAction: jest.fn(),
      bulkApplyActions: jest.fn(),
      getActiveActions: mockGetActiveActions,
      getPlayerActionHistory: mockGetPlayerActionHistory,
      updateAction: mockUpdateAction,
      revokeAction: mockRevokeAction,
    })

    mockGetActiveActions.mockResolvedValue(mockActiveActions)
    mockGetPlayerActionHistory.mockResolvedValue(mockPlayerHistory)
  })

  it('renders loading state initially', () => {
    render(<BanMuteManager />)
    expect(screen.getByText('Loading ban/mute data...')).toBeInTheDocument()
  })

  it('displays active actions after loading', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
      expect(screen.getByText('TestUser2')).toBeInTheDocument()
      expect(screen.getByText('Spamming')).toBeInTheDocument()
      expect(screen.getByText('Cheating')).toBeInTheDocument()
    })
  })

  it('filters actions by search term', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search by player name, ID, or reason...')
    fireEvent.change(searchInput, { target: { value: 'Spam' } })

    expect(screen.getByText('TestUser1')).toBeInTheDocument()
    expect(screen.queryByText('TestUser2')).not.toBeInTheDocument()
  })

  it('filters actions by type', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    const filterSelect = screen.getByRole('combobox')
    fireEvent.change(filterSelect, { target: { value: 'BAN' } })

    expect(screen.queryByText('TestUser1')).not.toBeInTheDocument()
    expect(screen.getByText('TestUser2')).toBeInTheDocument()
  })

  it('opens edit modal when Edit is clicked', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])

    expect(screen.getByText('Edit Action')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Spamming')).toBeInTheDocument()
  })

  it('saves edited action', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0])

    const reasonTextarea = screen.getByDisplayValue('Spamming')
    fireEvent.change(reasonTextarea, { target: { value: 'Updated reason' } })

    const saveButton = screen.getByText('Save Changes')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateAction).toHaveBeenCalledWith({
        actionId: 'action1',
        reason: 'Updated reason',
        expiresAt: expect.any(Number),
      })
    })
  })

  it('revokes action when Revoke is clicked', async () => {
    window.confirm = jest.fn(() => true)
    
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByText('Revoke')
    fireEvent.click(revokeButtons[0])

    await waitFor(() => {
      expect(mockRevokeAction).toHaveBeenCalledWith('action1')
    })
  })

  it('shows player history when username is clicked', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('TestUser1'))

    await waitFor(() => {
      expect(screen.getByText('Player History')).toBeInTheDocument()
      expect(screen.getByText('Total Actions: 5')).toBeInTheDocument()
      expect(screen.getByText('2', { selector: '.text-2xl.text-yellow-800' })).toBeInTheDocument() // Warnings
      expect(screen.getByText('2', { selector: '.text-2xl.text-orange-800' })).toBeInTheDocument() // Mutes
    })
  })

  it('handles errors gracefully', async () => {
    mockGetActiveActions.mockRejectedValue(new Error('API Error'))

    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load ban/mute data')).toBeInTheDocument()
    })
  })

  it('refreshes data when Refresh button is clicked', async () => {
    render(<BanMuteManager />)

    await waitFor(() => {
      expect(screen.getByText('TestUser1')).toBeInTheDocument()
    })

    mockGetActiveActions.mockClear()
    mockGetPlayerActionHistory.mockClear()

    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(mockGetActiveActions).toHaveBeenCalled()
      expect(mockGetPlayerActionHistory).toHaveBeenCalled()
    })
  })
})