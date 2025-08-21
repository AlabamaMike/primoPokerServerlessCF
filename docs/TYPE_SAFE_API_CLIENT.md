# Type-Safe API Client

This document describes the type-safe API client implementation for the poker desktop application.

## Overview

The type-safe API client provides:
- Full TypeScript type safety for all API calls
- Automatic request/response validation using Zod schemas
- Comprehensive error handling with typed errors
- React hooks for easy integration
- Automatic retries for transient failures
- Request cancellation and cleanup

## Architecture

### Core Components

1. **TypeSafeApiClient** (`apps/poker-desktop/src/api/type-safe-client.ts`)
   - Main client class handling HTTP requests
   - Request/response validation
   - Error mapping and creation
   - Timeout handling

2. **Typed Endpoints** (`apps/poker-desktop/src/api/endpoints.ts`)
   - Pre-defined API endpoints with schemas
   - Type-safe request/response interfaces
   - Organized by domain (auth, player, table, etc.)

3. **React Hooks** (`apps/poker-desktop/src/api/hooks.ts`)
   - `useApi` - Base hook for API calls
   - `useApiQuery` - Auto-fetching for GET requests
   - `useApiMutation` - For POST/PUT/DELETE operations
   - `useOptimisticMutation` - Optimistic UI updates

## Usage Examples

### Basic API Call

```typescript
import { api } from '@/api/endpoints'
import { useApiQuery } from '@/api/hooks'

function ProfileComponent() {
  const { data, isLoading, error, refetch } = useApiQuery(
    api.player.getProfile,
    [], // arguments array
    { refetchInterval: 30000 }
  )

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  
  return <ProfileCard profile={data} onRefresh={refetch} />
}
```

### Mutations with Error Handling

```typescript
import { api } from '@/api/endpoints'
import { useApiMutation } from '@/api/hooks'

function DepositForm() {
  const { mutate, isLoading, error } = useApiMutation(
    api.wallet.deposit,
    {
      onSuccess: (data) => {
        toast.success(`Deposited! New balance: $${data.newBalance}`)
      },
      onError: (error) => {
        if (error.code === ErrorCode.VALIDATION_FAILED) {
          // Handle validation errors
        }
      }
    }
  )

  const handleSubmit = (amount: number) => {
    mutate({ amount, method: 'credit_card' })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
    </form>
  )
}
```

### Optimistic Updates

```typescript
import { useOptimisticMutation } from '@/api/hooks'

function GameActions() {
  const { mutate, optimisticData } = useOptimisticMutation(
    api.game.performAction,
    {
      optimisticUpdate: ([action]) => ({
        // Return optimistic state
        message: `Performing ${action.action}...`,
        gameState: { /* predicted state */ }
      }),
      rollbackOnError: true
    }
  )

  // UI shows optimistic state immediately
  if (optimisticData) {
    return <div>{optimisticData.message}</div>
  }

  return <ActionButtons onAction={mutate} />
}
```

## Error Handling

The client provides typed errors from `@primo-poker/shared`:

```typescript
try {
  await api.auth.login({ email, password })
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Handle auth errors
    switch (error.code) {
      case ErrorCode.AUTH_INVALID_TOKEN:
        // Redirect to login
        break
      case ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS:
        // Show permission error
        break
    }
  } else if (error instanceof ValidationError) {
    // Show validation errors
    console.error('Validation failed:', error.details)
  }
}
```

## Creating New Endpoints

To add a new API endpoint:

1. Define the request/response schemas:

```typescript
const CreateTournamentSchema = z.object({
  name: z.string().min(1).max(100),
  buyIn: z.number().positive(),
  startTime: z.string().datetime()
})

const TournamentResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'active', 'completed'])
})
```

2. Create the endpoint:

```typescript
export const tournamentEndpoints = {
  create: apiClient.createEndpoint<
    z.infer<typeof CreateTournamentSchema>,
    z.infer<typeof TournamentResponseSchema>
  >({
    method: 'POST',
    path: '/api/tournaments',
    requestSchema: CreateTournamentSchema,
    responseSchema: TournamentResponseSchema,
    authenticated: true
  })
}
```

3. Use in components:

```typescript
const { mutate } = useApiMutation(tournamentEndpoints.create)
```

## Configuration

The client can be configured with:

```typescript
const client = createApiClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000, // 30 seconds
  getToken: () => localStorage.getItem('auth_token')
})
```

## Testing

The client includes comprehensive test utilities:

```typescript
import { createApiClient } from '@/api/type-safe-client'

describe('MyComponent', () => {
  const mockClient = createApiClient({
    baseUrl: 'http://test.local'
  })

  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('handles successful responses', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockData })
    })

    const result = await mockClient.get('/api/test')
    expect(result).toEqual(mockData)
  })
})
```

## Migration Guide

To migrate existing code:

1. Replace direct fetch calls with typed endpoints
2. Update error handling to use typed errors
3. Use the provided React hooks instead of manual state management
4. Add Zod schemas for type validation

See `apps/poker-desktop/src/api/migration-example.tsx` for detailed examples.

## Best Practices

1. **Always use typed endpoints** - Don't use the raw client methods directly
2. **Handle specific error codes** - Check `error.code` for specific handling
3. **Use optimistic updates** - For better UX in mutations
4. **Configure retry logic** - Disable retries for non-idempotent operations
5. **Cleanup on unmount** - Hooks automatically cancel pending requests

## Performance Considerations

- Requests are automatically cancelled when components unmount
- Use `refetchInterval` sparingly to avoid excessive API calls
- Enable `refetchOnWindowFocus` only when real-time data is critical
- Batch related API calls when possible

## Security

- Authentication tokens are automatically included in requests
- Never store sensitive data in optimistic updates
- Validate all user input before sending to API
- Use HTTPS in production environments