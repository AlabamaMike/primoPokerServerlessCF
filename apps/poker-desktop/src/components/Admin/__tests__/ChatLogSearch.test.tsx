import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ChatLogSearch } from '../ChatLogSearch'
import { useAdminApi } from '../../../hooks/useAdminApi'
import userEvent from '@testing-library/user-event'

// Mock dependencies
jest.mock('../../../hooks/useAdminApi')

const mockUseAdminApi = useAdminApi as jest.MockedFunction<typeof useAdminApi>

describe('ChatLogSearch', () => {
  const mockSearchChatLogs = jest.fn()
  const mockChatLogs = [
    {
      id: '1',
      playerId: 'player123',
      username: 'testuser',
      message: 'Hello world',
      timestamp: Date.now() - 1000 * 60 * 5,
      tableId: 'table1',
      flagged: false,
    },
    {
      id: '2',
      playerId: 'player456',
      username: 'baduser',
      message: 'Inappropriate content here',
      timestamp: Date.now() - 1000 * 60 * 10,
      tableId: 'table2',
      flagged: true,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAdminApi.mockReturnValue({
      getStats: jest.fn(),
      searchChatLogs: mockSearchChatLogs,
      getReports: jest.fn(),
      processReport: jest.fn(),
      applyAction: jest.fn(),
      bulkApplyActions: jest.fn(),
    })
  })

  describe('Search Interface', () => {
    it('should render search form with all fields', () => {
      render(<ChatLogSearch />)

      expect(screen.getByPlaceholderText('Search messages...')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Player ID')).toBeInTheDocument()
      expect(screen.getByLabelText('From Date')).toBeInTheDocument()
      expect(screen.getByLabelText('To Date')).toBeInTheDocument()
      expect(screen.getByText('Search')).toBeInTheDocument()
      expect(screen.getByText('Clear')).toBeInTheDocument()
    })

    it('should perform search with keyword', async () => {
      const user = userEvent.setup()
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchInput = screen.getByPlaceholderText('Search messages...')
      await user.type(searchInput, 'hello')

      const searchButton = screen.getByText('Search')
      await user.click(searchButton)

      await waitFor(() => {
        expect(mockSearchChatLogs).toHaveBeenCalledWith({
          keyword: 'hello',
          limit: 50,
          offset: 0,
        })
      })
    })

    it('should perform search with player ID', async () => {
      const user = userEvent.setup()
      mockSearchChatLogs.mockResolvedValue([mockChatLogs[0]])

      render(<ChatLogSearch />)

      const playerInput = screen.getByPlaceholderText('Player ID')
      await user.type(playerInput, 'player123')

      const searchButton = screen.getByText('Search')
      await user.click(searchButton)

      await waitFor(() => {
        expect(mockSearchChatLogs).toHaveBeenCalledWith({
          playerId: 'player123',
          limit: 50,
          offset: 0,
        })
      })
    })

    it('should perform search with date range', async () => {
      const user = userEvent.setup()
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const fromDate = screen.getByLabelText('From Date')
      const toDate = screen.getByLabelText('To Date')

      await user.type(fromDate, '2023-01-01T00:00')
      await user.type(toDate, '2023-12-31T23:59')

      const searchButton = screen.getByText('Search')
      await user.click(searchButton)

      await waitFor(() => {
        expect(mockSearchChatLogs).toHaveBeenCalledWith({
          startTime: new Date('2023-01-01T00:00').getTime(),
          endTime: new Date('2023-12-31T23:59').getTime(),
          limit: 50,
          offset: 0,
        })
      })
    })

    it('should clear search form', async () => {
      const user = userEvent.setup()

      render(<ChatLogSearch />)

      const searchInput = screen.getByPlaceholderText('Search messages...')
      await user.type(searchInput, 'test search')

      const clearButton = screen.getByText('Clear')
      await user.click(clearButton)

      expect(searchInput).toHaveValue('')
    })
  })

  describe('Search Results', () => {
    it('should display search results', async () => {
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('testuser')).toBeInTheDocument()
        expect(screen.getByText('Hello world')).toBeInTheDocument()
        expect(screen.getByText('baduser')).toBeInTheDocument()
        expect(screen.getByText('Inappropriate content here')).toBeInTheDocument()
      })
    })

    it('should highlight flagged messages', async () => {
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        const flaggedMessage = screen.getByText('Inappropriate content here').closest('.chat-log-item')
        expect(flaggedMessage).toHaveClass('flagged')
      })
    })

    it('should show loading state during search', async () => {
      mockSearchChatLogs.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockChatLogs), 100)))

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      expect(screen.getByRole('button', { name: 'Searching...' })).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Searching...' })).not.toBeInTheDocument()
      })
    })

    it('should show no results message', async () => {
      mockSearchChatLogs.mockResolvedValue([])

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('No chat logs found')).toBeInTheDocument()
      })
    })

    it('should handle search errors', async () => {
      mockSearchChatLogs.mockRejectedValue(new Error('Search failed'))

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to search chat logs')).toBeInTheDocument()
      })
    })
  })

  describe('Pagination', () => {
    it('should load more results when scrolling', async () => {
      const initialResults = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        playerId: `player${i}`,
        username: `user${i}`,
        message: `Message ${i}`,
        timestamp: Date.now() - i * 1000,
        tableId: `table${i}`,
        flagged: false,
      }))

      mockSearchChatLogs.mockResolvedValueOnce(initialResults)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Message 0')).toBeInTheDocument()
      })

      // Simulate scroll to bottom
      const resultsContainer = screen.getByTestId('chat-logs-container')
      fireEvent.scroll(resultsContainer, { target: { scrollTop: 1000 } })

      await waitFor(() => {
        expect(mockSearchChatLogs).toHaveBeenCalledTimes(2)
        expect(mockSearchChatLogs).toHaveBeenLastCalledWith({
          limit: 50,
          offset: 50,
        })
      })
    })

    it('should show loading indicator when loading more', async () => {
      const initialResults = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        playerId: `player${i}`,
        username: `user${i}`,
        message: `Message ${i}`,
        timestamp: Date.now() - i * 1000,
        tableId: `table${i}`,
        flagged: false,
      }))

      mockSearchChatLogs
        .mockResolvedValueOnce(initialResults)
        .mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 100)))

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Message 0')).toBeInTheDocument()
      })

      const resultsContainer = screen.getByTestId('chat-logs-container')
      fireEvent.scroll(resultsContainer, { target: { scrollTop: 1000 } })

      await waitFor(() => {
        expect(screen.getByText('Loading more...')).toBeInTheDocument()
      })
    })
  })

  describe('Actions', () => {
    it('should allow reporting a message', async () => {
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument()
      })

      const reportButtons = screen.getAllByText('Report')
      fireEvent.click(reportButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Report Message')).toBeInTheDocument()
      })
    })

    it('should allow applying moderation action', async () => {
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument()
      })

      const actionButtons = screen.getAllByText('Actions')
      fireEvent.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getAllByText('Warn')[0]).toBeInTheDocument()
        expect(screen.getAllByText('Mute')[0]).toBeInTheDocument()
        expect(screen.getAllByText('Ban')[0]).toBeInTheDocument()
      })
    })

    it('should export search results', async () => {
      mockSearchChatLogs.mockResolvedValue(mockChatLogs)

      render(<ChatLogSearch />)

      const searchButton = screen.getByText('Search')
      fireEvent.click(searchButton)

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument()
      })

      const exportButton = screen.getByText('Export Results')
      fireEvent.click(exportButton)

      // Check that download was triggered
      await waitFor(() => {
        expect(screen.getByText('Results exported')).toBeInTheDocument()
      })
    })
  })
})