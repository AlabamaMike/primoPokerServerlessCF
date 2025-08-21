import { useState, useCallback, useRef, useEffect } from 'react'
import { BaseError, ErrorCode, isRetryableError } from '@primo-poker/shared'

export interface UseApiOptions {
  retry?: boolean
  retryCount?: number
  retryDelay?: number
  onError?: (error: BaseError) => void
  onSuccess?: (data: unknown) => void
}

export interface UseApiResult<TData = unknown, TError = BaseError> {
  data: TData | null
  error: TError | null
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  execute: (...args: unknown[]) => Promise<TData>
  reset: () => void
}

export function useApi<TData = unknown, TArgs extends unknown[] = unknown[]>(
  apiFunction: (...args: TArgs) => Promise<TData>,
  options: UseApiOptions = {}
): UseApiResult<TData, BaseError> {
  const [data, setData] = useState<TData | null>(null)
  const [error, setError] = useState<BaseError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    retry = true,
    retryCount = 3,
    retryDelay = 1000,
    onError,
    onSuccess
  } = options

  const execute = useCallback(async (...args: TArgs): Promise<TData> => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    let lastError: BaseError | null = null
    let attempts = 0

    while (attempts <= (retry ? retryCount : 0)) {
      try {
        const result = await apiFunction(...args)
        
        // Check if request was aborted
        if (abortController.signal.aborted) {
          throw new Error('Request aborted')
        }

        setData(result)
        setError(null)
        
        if (onSuccess) {
          onSuccess(result)
        }
        
        return result
      } catch (err) {
        // If aborted, don't update state
        if (abortController.signal.aborted) {
          throw err
        }

        const apiError = err instanceof BaseError 
          ? err 
          : new BaseError({
              code: ErrorCode.UNKNOWN_ERROR,
              message: err instanceof Error ? err.message : 'Unknown error',
              httpStatus: 500
            })

        lastError = apiError

        // Check if we should retry
        if (
          retry && 
          attempts < retryCount && 
          isRetryableError(apiError)
        ) {
          attempts++
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempts))
          continue
        }

        // No more retries
        setError(apiError)
        
        if (onError) {
          onError(apiError)
        }
        
        throw apiError
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Failed after all retries')
  }, [apiFunction, retry, retryCount, retryDelay, onError, onSuccess])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    data,
    error,
    isLoading,
    isError: error !== null,
    isSuccess: data !== null && error === null,
    execute,
    reset
  }
}

// Mutation hook for POST/PUT/DELETE operations
export function useApiMutation<TData = unknown, TArgs extends unknown[] = unknown[]>(
  apiFunction: (...args: TArgs) => Promise<TData>,
  options: UseApiOptions = {}
): UseApiResult<TData, BaseError> & { mutate: (...args: TArgs) => Promise<TData> } {
  const result = useApi(apiFunction, options)
  
  return {
    ...result,
    mutate: result.execute
  }
}

// Query hook with automatic execution
export function useApiQuery<TData = unknown, TArgs extends unknown[] = unknown[]>(
  apiFunction: (...args: TArgs) => Promise<TData>,
  args: TArgs,
  options: UseApiOptions & { 
    enabled?: boolean
    refetchInterval?: number
    refetchOnWindowFocus?: boolean
  } = {}
): UseApiResult<TData, BaseError> & { refetch: () => Promise<TData> } {
  const { 
    enabled = true, 
    refetchInterval,
    refetchOnWindowFocus = true,
    ...apiOptions 
  } = options
  
  const result = useApi(apiFunction, apiOptions)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Initial fetch
  useEffect(() => {
    if (enabled && !result.data && !result.isLoading) {
      result.execute(...args).catch(() => {
        // Error is handled by the hook
      })
    }
  }, [enabled, args, result])

  // Refetch on interval
  useEffect(() => {
    if (refetchInterval && enabled) {
      intervalRef.current = setInterval(() => {
        result.execute(...args).catch(() => {
          // Error is handled by the hook
        })
      }, refetchInterval)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [refetchInterval, enabled, args, result])

  // Refetch on window focus
  useEffect(() => {
    if (refetchOnWindowFocus && enabled) {
      const handleFocus = () => {
        result.execute(...args).catch(() => {
          // Error is handled by the hook
        })
      }

      window.addEventListener('focus', handleFocus)
      return () => window.removeEventListener('focus', handleFocus)
    }
  }, [refetchOnWindowFocus, enabled, args, result])

  return {
    ...result,
    refetch: () => result.execute(...args)
  }
}

// Optimistic update hook
export function useOptimisticMutation<TData = unknown, TArgs extends unknown[] = unknown[]>(
  apiFunction: (...args: TArgs) => Promise<TData>,
  options: UseApiOptions & {
    optimisticUpdate?: (args: TArgs) => TData
    rollbackOnError?: boolean
  } = {}
): UseApiResult<TData, BaseError> & { 
  mutate: (...args: TArgs) => Promise<TData>
  optimisticData: TData | null
} {
  const { optimisticUpdate, rollbackOnError = true, ...apiOptions } = options
  const [optimisticData, setOptimisticData] = useState<TData | null>(null)
  const previousDataRef = useRef<TData | null>(null)
  
  const result = useApi(apiFunction, {
    ...apiOptions,
    onSuccess: (data) => {
      setOptimisticData(null)
      if (apiOptions.onSuccess) {
        apiOptions.onSuccess(data)
      }
    },
    onError: (error) => {
      if (rollbackOnError && previousDataRef.current !== null) {
        setOptimisticData(previousDataRef.current)
      } else {
        setOptimisticData(null)
      }
      if (apiOptions.onError) {
        apiOptions.onError(error)
      }
    }
  })

  const mutate = useCallback(async (...args: TArgs): Promise<TData> => {
    if (optimisticUpdate) {
      previousDataRef.current = result.data
      const optimistic = optimisticUpdate(args)
      setOptimisticData(optimistic)
    }
    
    return result.execute(...args)
  }, [optimisticUpdate, result])

  return {
    ...result,
    data: optimisticData ?? result.data,
    mutate,
    optimisticData
  }
}