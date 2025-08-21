import { renderHook, act, waitFor } from '@testing-library/react'
import { useApi, useApiMutation, useApiQuery, useOptimisticMutation } from '../hooks'
import { BaseError, ErrorCode, ConnectionError, isRetryableError } from '@primo-poker/shared'

// Mock API functions
const mockSuccessApi = jest.fn().mockResolvedValue({ data: 'success' })
const mockErrorApi = jest.fn().mockRejectedValue(
  new BaseError({ 
    code: ErrorCode.INTERNAL_ERROR, 
    message: 'API Error',
    httpStatus: 500,
    retryable: true
  })
)

describe('useApi', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle successful API calls', async () => {
    const { result } = renderHook(() => useApi(mockSuccessApi))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.isError).toBe(false)

    let response: any
    await act(async () => {
      response = await result.current.execute('arg1', 'arg2')
    })

    expect(response).toEqual({ data: 'success' })
    expect(result.current.data).toEqual({ data: 'success' })
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isError).toBe(false)
    expect(mockSuccessApi).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('should handle API errors', async () => {
    const { result } = renderHook(() => useApi(mockErrorApi, { retry: false }))

    await act(async () => {
      try {
        await result.current.execute()
      } catch (error) {
        // Expected error
      }
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'API Error'
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSuccess).toBe(false)
    expect(result.current.isError).toBe(true)
  })

  it('should retry on retryable errors', async () => {
    const retryableError = new ConnectionError(
      'Network error',
      ErrorCode.CONNECTION_FAILED
    )
    const mockRetryApi = jest.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce({ data: 'success after retry' })

    const { result } = renderHook(() => 
      useApi(mockRetryApi, { retryCount: 2, retryDelay: 10 })
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(mockRetryApi).toHaveBeenCalledTimes(3)
    expect(result.current.data).toEqual({ data: 'success after retry' })
    expect(result.current.error).toBeNull()
  })

  it('should not retry on non-retryable errors', async () => {
    const nonRetryableError = new BaseError({
      code: ErrorCode.AUTH_UNAUTHORIZED,
      message: 'Unauthorized',
      httpStatus: 401,
      retryable: false
    })
    const mockNonRetryApi = jest.fn().mockRejectedValue(nonRetryableError)

    const { result } = renderHook(() => 
      useApi(mockNonRetryApi, { retryCount: 3 })
    )

    await act(async () => {
      try {
        await result.current.execute()
      } catch (error) {
        // Expected error
      }
    })

    expect(mockNonRetryApi).toHaveBeenCalledTimes(1)
    expect(result.current.error).toMatchObject({
      code: ErrorCode.AUTH_UNAUTHORIZED,
      message: 'Unauthorized'
    })
  })

  it('should call onSuccess callback', async () => {
    const onSuccess = jest.fn()
    const { result } = renderHook(() => 
      useApi(mockSuccessApi, { onSuccess })
    )

    await act(async () => {
      await result.current.execute()
    })

    expect(onSuccess).toHaveBeenCalledWith({ data: 'success' })
  })

  it('should call onError callback', async () => {
    const onError = jest.fn()
    const { result } = renderHook(() => 
      useApi(mockErrorApi, { retry: false, onError })
    )

    await act(async () => {
      try {
        await result.current.execute()
      } catch (error) {
        // Expected error
      }
    })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'API Error'
    }))
  })

  it('should reset state', async () => {
    const { result } = renderHook(() => useApi(mockSuccessApi))

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.data).toEqual({ data: 'success' })

    act(() => {
      result.current.reset()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('should cancel pending requests on unmount', async () => {
    const mockSlowApi = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 1000))
    )

    const { result, unmount } = renderHook(() => useApi(mockSlowApi))

    act(() => {
      result.current.execute()
    })

    expect(result.current.isLoading).toBe(true)

    unmount()

    // Request should be cancelled and state should not update
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1100))
    })
  })
})

describe('useApiMutation', () => {
  it('should provide mutate function', async () => {
    const { result } = renderHook(() => useApiMutation(mockSuccessApi))

    expect(result.current.mutate).toBeDefined()
    expect(result.current.execute).toBeDefined()
    expect(result.current.mutate).toBe(result.current.execute)

    await act(async () => {
      await result.current.mutate('arg')
    })

    expect(mockSuccessApi).toHaveBeenCalledWith('arg')
    expect(result.current.data).toEqual({ data: 'success' })
  })
})

describe('useApiQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should fetch data automatically when enabled', async () => {
    const { result } = renderHook(() => 
      useApiQuery(mockSuccessApi, ['arg1', 'arg2'])
    )

    await waitFor(() => {
      expect(mockSuccessApi).toHaveBeenCalledWith('arg1', 'arg2')
      expect(result.current.data).toEqual({ data: 'success' })
    })
  })

  it('should not fetch when disabled', async () => {
    const { result } = renderHook(() => 
      useApiQuery(mockSuccessApi, ['arg'], { enabled: false })
    )

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
    })

    expect(mockSuccessApi).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('should refetch on interval', async () => {
    const { result } = renderHook(() => 
      useApiQuery(mockSuccessApi, ['arg'], { refetchInterval: 1000 })
    )

    await waitFor(() => {
      expect(mockSuccessApi).toHaveBeenCalledTimes(1)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(mockSuccessApi).toHaveBeenCalledTimes(2)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    await waitFor(() => {
      expect(mockSuccessApi).toHaveBeenCalledTimes(3)
    })
  })

  it('should provide refetch function', async () => {
    mockSuccessApi
      .mockResolvedValueOnce({ data: 'initial' })
      .mockResolvedValueOnce({ data: 'refetched' })

    const { result } = renderHook(() => 
      useApiQuery(mockSuccessApi, ['arg'])
    )

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: 'initial' })
    })

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.data).toEqual({ data: 'refetched' })
    expect(mockSuccessApi).toHaveBeenCalledTimes(2)
  })
})

describe('useOptimisticMutation', () => {
  it('should show optimistic data immediately', async () => {
    const mockSlowApi = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ id: '1', value: 'real' }), 100))
    )

    const { result } = renderHook(() => 
      useOptimisticMutation(mockSlowApi, {
        optimisticUpdate: ([value]) => ({ id: 'temp', value })
      })
    )

    act(() => {
      result.current.mutate('optimistic')
    })

    // Should show optimistic data immediately
    expect(result.current.data).toEqual({ id: 'temp', value: 'optimistic' })
    expect(result.current.optimisticData).toEqual({ id: 'temp', value: 'optimistic' })

    // Wait for real data
    await waitFor(() => {
      expect(result.current.data).toEqual({ id: '1', value: 'real' })
      expect(result.current.optimisticData).toBeNull()
    })
  })

  it('should rollback on error', async () => {
    const { result } = renderHook(() => 
      useOptimisticMutation(mockErrorApi, {
        optimisticUpdate: () => ({ id: 'temp', value: 'optimistic' }),
        rollbackOnError: true,
        retry: false
      })
    )

    // Set initial data
    await act(async () => {
      await mockSuccessApi()
    })

    act(() => {
      try {
        result.current.mutate()
      } catch (error) {
        // Expected error
      }
    })

    // Should show optimistic data immediately
    expect(result.current.data).toEqual({ id: 'temp', value: 'optimistic' })

    // Wait for error and rollback
    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
      expect(result.current.optimisticData).toBeNull()
    })
  })
})