# API Response Validation Guide

This guide explains how to use the runtime validation system for API responses in the Primo Poker application.

## Overview

The response validation system ensures that all API responses conform to their defined schemas, providing:
- Runtime type safety
- Consistent API contracts
- Automatic validation of response data
- Early detection of API contract violations
- Better developer experience with type-safe responses

## Architecture

### Core Components

1. **Response Schemas** (`packages/api/src/validation/response-schemas.ts`)
   - Defines Zod schemas for all API responses
   - Provides a registry mapping endpoints to their schemas
   - Includes reusable schema builders for common patterns

2. **Response Validator** (`packages/api/src/middleware/response-validator.ts`)
   - Runtime validation middleware
   - Validates response data against schemas
   - Configurable validation options
   - Custom error handling

3. **Validated Response Helpers** (`packages/api/src/utils/validated-response-helpers.ts`)
   - Type-safe response builders
   - Simplified API for creating validated responses
   - Integration with existing response patterns

## Usage

### Basic Usage with Response Builder

```typescript
import { responseBuilder } from '@primo-poker/api';

// Create a response builder for your endpoint
const response = responseBuilder('GET /api/health');

// Success response (automatically validated)
return response.success({
  status: 'healthy',
  timestamp: new Date().toISOString(),
  // ... other health data
});

// Error response
return response.error('Service unavailable', 503, 'SERVICE_ERROR');
```

### Using Validated Response Helpers

```typescript
import { createValidatedSuccessResponse, createValidatedErrorResponse } from '@primo-poker/api';

// Success response
return createValidatedSuccessResponse('POST /api/auth/login', {
  user: { id: userId, username, email, chipCount },
  tokens: { accessToken, refreshToken, expiresIn: 3600, tokenType: 'Bearer' },
  message: 'Login successful'
});

// Error response
return createValidatedErrorResponse('Invalid credentials', 401, 'AUTH_ERROR');
```

### Wrapping Existing Handlers

```typescript
import { withResponseValidation } from '@primo-poker/api';

// Wrap an existing handler with validation
const validatedHandler = withResponseValidation(
  'GET /api/tables/:tableId/seats',
  async (request) => {
    // Your existing handler logic
    const seats = await getTableSeats(tableId);
    return new Response(JSON.stringify({
      success: true,
      data: seats,
      timestamp: new Date().toISOString()
    }));
  }
);
```

### Custom Validation Options

```typescript
import { createResponseValidator } from '@primo-poker/api';

const validator = createResponseValidator({
  stripUnknown: true,        // Remove unknown properties
  logErrors: true,           // Log validation errors
  throwOnError: false,       // Don't throw, return error response
  onError: (error, endpoint) => {
    // Custom error handling
    return new Response('Validation failed', { status: 500 });
  }
});
```

## Adding New Endpoints

1. **Define the Response Schema**
   ```typescript
   // In response-schemas.ts
   export const NewEndpointResponseSchema = SuccessResponseSchema(z.object({
     id: z.string(),
     name: z.string(),
     // ... other fields
   }));
   ```

2. **Add to Schema Registry**
   ```typescript
   export const ResponseSchemaRegistry = {
     // ... existing endpoints
     'GET /api/new-endpoint': NewEndpointResponseSchema
   };
   ```

3. **Use in Route Handler**
   ```typescript
   const response = responseBuilder('GET /api/new-endpoint');
   return response.success({ id: '123', name: 'Test' });
   ```

## Migrating Existing Routes

### Before (Without Validation)
```typescript
private async handleGetProfile(request: AuthenticatedRequest): Promise<Response> {
  const player = await playerRepo.findById(request.user.userId);
  return this.successResponse(player);
}
```

### After (With Validation)
```typescript
private response = responseBuilder('GET /api/players/me');

private async handleGetProfile(request: AuthenticatedRequest): Promise<Response> {
  const player = await playerRepo.findById(request.user.userId);
  return this.response.success(player);
}
```

## Testing

### Unit Testing Responses
```typescript
import { validateApiResponse } from '@primo-poker/api';

describe('API Response', () => {
  it('should create valid response', () => {
    const response = {
      success: true,
      data: { /* ... */ },
      timestamp: new Date().toISOString()
    };
    
    expect(validateApiResponse(response)).toBe(true);
  });
});
```

### Integration Testing
```typescript
import { ResponseSchemaRegistry } from '@primo-poker/api';

it('should return valid login response', async () => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  const schema = ResponseSchemaRegistry['POST /api/auth/login'];
  
  expect(() => schema.parse(data)).not.toThrow();
});
```

## Benefits

1. **Type Safety**: TypeScript types are automatically inferred from schemas
2. **Runtime Validation**: Catch API contract violations early
3. **Consistency**: Ensures all responses follow the same structure
4. **Documentation**: Schemas serve as API documentation
5. **Error Prevention**: Prevents sending malformed responses to clients

## Best Practices

1. **Always Use Response Builders**: Prefer response builders over manual response creation
2. **Keep Schemas Updated**: Update schemas when API contracts change
3. **Test Response Validation**: Include validation tests in your test suite
4. **Use Descriptive Error Codes**: Provide meaningful error codes for debugging
5. **Log Validation Errors**: Enable error logging in development/staging

## Common Patterns

### Paginated Responses
```typescript
import { PaginatedResponseSchema } from '@primo-poker/api';

const UserListSchema = PaginatedResponseSchema(UserSchema);
```

### Conditional Fields
```typescript
const ResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: UserSchema,
    premium: z.boolean(),
    premiumFeatures: z.object({/* ... */}).optional()
  }).refine(data => !data.premium || data.premiumFeatures, {
    message: 'Premium users must have premium features'
  })
});
```

### Union Types
```typescript
const ResponseSchema = z.union([
  SuccessResponseSchema(DataSchema),
  ErrorResponseSchema
]);
```

## Troubleshooting

### Validation Failures
- Check the console/logs for detailed validation errors
- Ensure response data matches the schema exactly
- Verify all required fields are present
- Check for type mismatches (e.g., string vs number)

### Performance Considerations
- Validation adds minimal overhead (~1-2ms per response)
- Use `stripUnknown: true` to reduce response size
- Consider disabling validation in production if needed

### Schema Mismatches
- Run type checking to catch schema/type mismatches
- Use the generated types from schemas in your code
- Keep schemas in sync with backend changes