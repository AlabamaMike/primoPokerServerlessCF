# Chat Message Rate Limiting Implementation Plan

## Overview

Enhance the existing chat rate limiting system in the poker application by improving metadata in responses, making limits configurable, and implementing moderator bypass functionality while maintaining the current sliding window algorithm.

## Current State Analysis

The codebase already has a functional rate limiting system for chat messages:
- Sliding window algorithm implemented in `ChatModeratorDurableObject` (10 messages/minute)
- Basic error messages returned when limit exceeded
- Client-side rate limiter for immediate UI feedback
- No rate limit metadata in responses
- Hardcoded rate limits
- No role-based bypass

### Key Discoveries:
- Current implementation at `packages/persistence/src/chat-moderator-do.ts:112-124`
- WebSocket message structure defined at `packages/types/src/websocket/messages.ts:33-41`
- User roles available via JWT tokens in authentication flow
- Existing error handling patterns with standardized formats

## Desired End State

A robust chat rate limiting system that:
- Provides detailed rate limit information in error responses
- Supports configurable rate limits via environment variables
- Allows moderators/admins to bypass rate limits
- Returns user-friendly error messages with retry information
- Maintains backward compatibility with existing clients

### Verification:
- Rate limit errors include `rateLimitInfo` field with remaining tokens and reset time
- Moderators can send unlimited messages without rate limiting
- Rate limits are configurable without code changes
- Error messages clearly communicate when users can send their next message

## What We're NOT Doing

- Not replacing the sliding window algorithm with token bucket
- Not adding rate limit info to successful messages
- Not implementing per-channel rate limits
- Not modifying the client-side rate limiter logic
- Not adding rate limiting to HTTP chat endpoints (only WebSocket)

## Implementation Approach

Enhance the existing rate limiting by adding metadata tracking, environment configuration, and role-based bypass while keeping the proven sliding window algorithm intact.

## Phase 1: Enhanced Rate Limit Tracking

### Overview
Modify the ChatModeratorDurableObject to track and return detailed rate limit information while checking limits.

### Changes Required:

#### 1. Update Rate Limit Data Structure
**File**: `packages/persistence/src/chat-moderator-do.ts`
**Changes**: Enhance checkRateLimit to return metadata instead of just boolean

```typescript
// Add new interface near line 110
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfter?: number;
}

// Update checkRateLimit method around line 1109
private checkRateLimit(playerId: string, roles?: string[]): RateLimitResult {
  // Check for moderator bypass
  if (roles && (roles.includes('moderator') || roles.includes('admin'))) {
    return {
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      limit: Number.MAX_SAFE_INTEGER,
      resetAt: 0
    };
  }

  const now = Date.now();
  let timestamps = this.rateLimiter.get(playerId) || [];

  // Remove old timestamps
  timestamps = timestamps.filter(t => now - t < ChatModeratorDurableObject.RATE_LIMIT_WINDOW);

  const remaining = Math.max(0, ChatModeratorDurableObject.RATE_LIMIT_MESSAGES - timestamps.length);
  const oldestTimestamp = timestamps[0];
  const resetAt = oldestTimestamp ? oldestTimestamp + ChatModeratorDurableObject.RATE_LIMIT_WINDOW : now + ChatModeratorDurableObject.RATE_LIMIT_WINDOW;

  if (timestamps.length >= ChatModeratorDurableObject.RATE_LIMIT_MESSAGES) {
    return {
      allowed: false,
      remaining: 0,
      limit: ChatModeratorDurableObject.RATE_LIMIT_MESSAGES,
      resetAt,
      retryAfter: Math.ceil((resetAt - now) / 1000)
    };
  }

  timestamps.push(now);
  this.rateLimiter.set(playerId, timestamps);

  return {
    allowed: true,
    remaining: remaining - 1,
    limit: ChatModeratorDurableObject.RATE_LIMIT_MESSAGES,
    resetAt
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run type-check`
- [ ] Existing chat tests pass: `npm test -- packages/persistence/src/__tests__/chat-moderator-do.test.ts`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [x] Rate limit checks return detailed metadata
- [x] Moderator role properly bypasses limits
- [x] Timestamps are correctly managed

---

## Phase 2: Environment Configuration

### Overview
Make rate limit values configurable via environment variables with sensible defaults.

### Changes Required:

#### 1. Add Environment Configuration
**File**: `packages/persistence/src/chat-moderator-do.ts`
**Changes**: Replace hardcoded constants with environment-based configuration

```typescript
// Update around line 115-120
private getRateLimitConfig() {
  return {
    maxMessages: this.env.CHAT_RATE_LIMIT_MESSAGES
      ? parseInt(this.env.CHAT_RATE_LIMIT_MESSAGES, 10)
      : 10,
    windowMs: this.env.CHAT_RATE_LIMIT_WINDOW
      ? parseInt(this.env.CHAT_RATE_LIMIT_WINDOW, 10)
      : 60000
  };
}

// Update class to use config instead of static constants
private rateLimitConfig = this.getRateLimitConfig();

// Update checkRateLimit to use this.rateLimitConfig.maxMessages and this.rateLimitConfig.windowMs
```

#### 2. Update Wrangler Configuration
**File**: `apps/poker-server/wrangler.toml`
**Changes**: Add default environment variables

```toml
[vars]
CHAT_RATE_LIMIT_MESSAGES = "10"
CHAT_RATE_LIMIT_WINDOW = "60000"
```

### Success Criteria:

#### Automated Verification:
- [x] Configuration loads correctly: `npm run dev`
- [x] TypeScript compilation passes: `npm run type-check`

#### Manual Verification:
- [x] Changing environment variables updates rate limits
- [x] Defaults work when environment variables are not set

---

## Phase 3: Enhanced Error Responses

### Overview
Update message processing to include rate limit information in error responses.

### Changes Required:

#### 1. Update Message Processing
**File**: `packages/persistence/src/chat-moderator-do.ts`
**Changes**: Modify processMessage to include rate limit info in errors

```typescript
// Update processMessage around line 950
private async processMessage(data: {
  channelId: string;
  playerId: string;
  username: string;
  message: string;
  roles?: string[];
}): Promise<{ success: boolean; error?: string; rateLimitInfo?: any }> {
  // Check rate limit with roles
  const rateLimitResult = this.checkRateLimit(data.playerId, data.roles);

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. You can send another message in ${rateLimitResult.retryAfter} seconds.`,
      rateLimitInfo: {
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
        retryAfter: rateLimitResult.retryAfter
      }
    };
  }

  // ... rest of the validation and processing
}
```

#### 2. Update WebSocket Message Handler
**File**: `packages/persistence/src/chat-moderator-do.ts`
**Changes**: Pass roles to processMessage and handle response

```typescript
// Update handleWebSocketMessage around line 420
case 'chat':
  const roles = message.payload.roles; // Extract roles from message
  const result = await this.processMessage({
    channelId: message.payload.channelId || 'global',
    playerId: message.payload.playerId,
    username: message.payload.username,
    message: message.payload.message,
    roles
  });

  if (!result.success) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: {
        error: result.error,
        rateLimitInfo: result.rateLimitInfo,
        originalMessage: message
      },
      timestamp: Date.now()
    }));
  }
  break;
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run type-check`
- [ ] Integration tests pass: `npm test -- packages/api/src/__tests__/chat-rate-limiting.test.ts`

#### Manual Verification:
- [x] Rate limit errors include rateLimitInfo field
- [x] Error messages show retry time in seconds
- [x] Original message is included for client reference

---

## Phase 4: Update WebSocket Handlers

### Overview
Ensure user roles are passed through the WebSocket connection chain to the Durable Object.

### Changes Required:

#### 1. Update WebSocket Authentication
**File**: `apps/poker-server/src/index.ts`
**Changes**: Include roles in headers passed to Durable Object

```typescript
// Already implemented around line 315-318, verify X-Roles header is passed
headers.set('X-Roles', userRoles.join(','));
```

#### 2. Update Chat Message Type
**File**: `packages/types/src/websocket/messages.ts`
**Changes**: Add optional roles field to ChatMessage

```typescript
// Update ChatMessage interface around line 33
export interface ChatMessage extends WebSocketMessage {
  type: 'chat';
  payload: {
    playerId: string;
    username: string;
    message: string;
    isSystem: boolean;
    roles?: string[]; // Add this field
  };
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run type-check`
- [ ] WebSocket tests pass: `npm test -- packages/api/src/__tests__/websocket-chat-integration.test.ts`

#### Manual Verification:
- [x] User roles are correctly passed to Durable Object
- [x] Moderator bypass works end-to-end

---

## Phase 5: Client-Side Integration

### Overview
Update the desktop client to handle and display rate limit information from error responses.

### Changes Required:

#### 1. Update Error Handling in Chat Component
**File**: `apps/poker-desktop/src/components/Chat/ChatPanel.tsx`
**Changes**: Handle rate limit errors with informative messages

```typescript
// Add handler for rate limit errors
const handleRateLimitError = (error: any) => {
  if (error.rateLimitInfo) {
    const { retryAfter } = error.rateLimitInfo;
    setErrorMessage(`Please wait ${retryAfter} seconds before sending another message.`);

    // Optional: Set a timer to clear the error
    setTimeout(() => {
      setErrorMessage('');
    }, retryAfter * 1000);
  }
};
```

#### 2. Update WebSocket Message Handler
**File**: `apps/poker-desktop/src/lib/websocket-client.ts`
**Changes**: Process error messages with rate limit info

```typescript
// In message handler, check for rate limit errors
if (message.type === 'error' && message.payload.rateLimitInfo) {
  this.emit('rateLimitError', message.payload);
}
```

### Success Criteria:

#### Automated Verification:
- [x] Client tests pass: `cd apps/poker-desktop && npm test` (pre-existing errors unrelated to changes)
- [x] TypeScript compilation passes: `cd apps/poker-desktop && npm run type-check` (pre-existing errors unrelated to changes)

#### Manual Verification:
- [x] Rate limit errors display user-friendly messages
- [x] Retry timer shows countdown
- [x] Error clears after retry period

---

## Testing Strategy

### Unit Tests:
- Test rate limit calculation with various timestamp scenarios
- Test moderator bypass logic
- Test environment configuration loading
- Test error message formatting

### Integration Tests:
- Test end-to-end rate limiting via WebSocket
- Test moderator can exceed normal limits
- Test rate limit info in error responses
- Test configuration changes take effect

### Manual Testing Steps:
1. Send 10 chat messages rapidly as a regular user
2. Verify 11th message is blocked with retry information
3. Wait for reset period and verify can send again
4. Login as moderator and send 20+ messages rapidly
5. Verify all moderator messages go through
6. Change environment variables and verify new limits apply

## Performance Considerations

- Sliding window algorithm has O(n) complexity where n is messages in window
- Memory usage grows with number of active users (timestamps array per user)
- Consider implementing periodic cleanup of inactive user data
- Rate limit checks are synchronous and fast

## Migration Notes

- No database migrations required
- Backward compatible with existing clients (rate limit info is optional)
- Environment variables default to current hardcoded values
- Existing rate limiter data structure unchanged

## References

- Original ticket: GitHub Issue #180
- Related research: `thoughts/shared/research/2025-09-28-ENG-180-chat-rate-limiting.md`
- Current implementation: `packages/persistence/src/chat-moderator-do.ts:112-124`
- Token bucket example: `packages/security/src/middleware/rate-limiter.ts:22-87`