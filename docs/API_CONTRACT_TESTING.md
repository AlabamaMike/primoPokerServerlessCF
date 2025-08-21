# API Contract Testing Guide

## Overview

API contract testing ensures that our API endpoints adhere to their defined contracts, providing consistency, reliability, and type safety across the application. This guide covers the contract testing infrastructure implemented for the Primo Poker API.

## Architecture

### Components

1. **Contract Test Utilities** (`contract-test-utils.ts`)
   - Mock environment creation
   - Request/response builders
   - Schema validation helpers
   - Test data factories

2. **Contract Tests** (per domain)
   - Authentication (`auth.contract.test.ts`)
   - Player management (`player.contract.test.ts`)
   - Table operations (`table.contract.test.ts`)
   - Game state (`game.contract.test.ts`)
   - Wallet transactions (`wallet.contract.test.ts`)

3. **Contract Validator Middleware** (`contract-validator.ts`)
   - Runtime validation
   - Request/response schema enforcement
   - Error handling and logging

## Writing Contract Tests

### Basic Structure

```typescript
import { z } from 'zod';
import { verifyContract, createMockRequest, expectSuccessResponse } from './contract-test-utils';

// Define schemas
const RequestSchema = z.object({
  field: z.string(),
});

const ResponseSchema = z.object({
  id: z.string().uuid(),
  field: z.string(),
});

// Write tests
describe('API Endpoint Contract', () => {
  it('should validate request and response', async () => {
    const request = createMockRequest({
      method: 'POST',
      url: '/api/endpoint',
      body: { field: 'value' },
    });

    const result = await verifyContract(
      handler,
      request,
      {
        requestSchema: RequestSchema,
        responseSchema: ResponseSchema,
        statusCode: 200,
      }
    );

    expect(result.isValid).toBe(true);
    expectSuccessResponse(result.body);
  });
});
```

### Testing Patterns

#### 1. Schema Validation

```typescript
await testSchemaValidation(
  Schema,
  validData,
  [
    { data: invalidData1, expectedError: 'error message' },
    { data: invalidData2, expectedError: 'error message' },
  ]
);
```

#### 2. Authentication Testing

```typescript
// Test unauthenticated access
const request = createMockRequest({ method: 'GET', url: '/api/protected' });
expect(response.status).toBe(401);

// Test authenticated access
const authRequest = createAuthenticatedRequest({ method: 'GET', url: '/api/protected' });
expect(response.status).toBe(200);
```

#### 3. Error Scenarios

```typescript
it('should handle not found error', async () => {
  const response = await handler(request);
  expectErrorResponse(response, '404', /Not found/);
});
```

#### 4. Edge Cases

```typescript
describe('Edge Cases', () => {
  it('should handle maximum values', async () => {
    // Test with MAX_SAFE_INTEGER, max string lengths, etc.
  });

  it('should handle empty/minimal data', async () => {
    // Test with empty arrays, zero values, etc.
  });
});
```

## Runtime Contract Validation

### Setup

```typescript
import { contractValidator, registerStandardContracts } from './middleware/contract-validator';

// Register contracts
registerStandardContracts(contractValidator);

// Apply middleware
router.use(contractValidator.validateRequest);
```

### Custom Contract Registration

```typescript
contractValidator.register('POST', '/api/custom-endpoint', {
  request: z.object({
    customField: z.string(),
  }),
  response: z.object({
    result: z.string(),
  }),
  queryParams: z.object({
    filter: z.string().optional(),
  }),
});
```

### Configuration Options

```typescript
const validator = new ContractValidator({
  enableRequestValidation: true,    // Validate incoming requests
  enableResponseValidation: true,   // Validate outgoing responses
  logValidationErrors: true,        // Log validation failures
  throwOnValidationError: false,    // Don't break production on validation errors
});
```

## Best Practices

### 1. Schema Design

- Use strict schemas with proper types
- Add meaningful error messages
- Consider optional vs required fields
- Use enums for fixed values
- Add constraints (min/max, patterns)

```typescript
const UserSchema = z.object({
  username: z.string().min(3, 'Username too short').max(20, 'Username too long'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().positive().max(120),
  role: z.enum(['player', 'admin', 'moderator']),
  metadata: z.record(z.unknown()).optional(),
});
```

### 2. Test Organization

- Group tests by domain (auth, player, table, etc.)
- Test both success and failure paths
- Include edge cases and boundary conditions
- Test error messages and status codes
- Verify response structure completeness

### 3. Mock Data

```typescript
// Use factories for consistent test data
const createTestUser = (overrides: Partial<User> = {}) => ({
  id: 'test-id',
  username: 'testuser',
  email: 'test@example.com',
  ...overrides,
});
```

### 4. Async Testing

```typescript
// Test concurrent operations
const results = await Promise.all([
  handler(request1),
  handler(request2),
  handler(request3),
]);

// Verify all succeed or fail appropriately
```

## Running Contract Tests

```bash
# Run all contract tests
npm test -- contracts/

# Run specific domain tests
npm test -- auth.contract.test.ts

# Run with coverage
npm test -- --coverage contracts/

# Watch mode for development
npm test -- --watch contracts/
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run API Contract Tests
  run: |
    npm run test:contracts
    npm run test:contracts:coverage
  env:
    NODE_ENV: test
```

### Pre-commit Hook

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:contracts:changed"
    }
  }
}
```

## Debugging Contract Failures

### 1. Validation Errors

```typescript
// Enable detailed logging
const validator = new ContractValidator({
  logValidationErrors: true,
});

// Check logs for:
// - Field paths
// - Expected vs actual values
// - Schema constraints
```

### 2. Schema Mismatches

```typescript
// Use schema.parse() to debug
try {
  schema.parse(data);
} catch (error) {
  console.log(error.errors); // Detailed validation errors
}
```

### 3. Response Validation

```typescript
// Temporarily disable to isolate issues
const validator = new ContractValidator({
  enableResponseValidation: false,
});
```

## Maintenance

### Updating Contracts

1. Update schema definitions
2. Update contract tests
3. Update runtime validators
4. Run full test suite
5. Update documentation

### Breaking Changes

When making breaking changes:

1. Version the API endpoint
2. Maintain old contract tests
3. Add deprecation notices
4. Plan migration path
5. Update client code

### Schema Evolution

```typescript
// Support backward compatibility
const V1Schema = z.object({
  field: z.string(),
});

const V2Schema = V1Schema.extend({
  newField: z.string().optional(), // Optional for compatibility
});
```

## Common Issues and Solutions

### Issue: Tests Pass but Runtime Fails

**Cause**: Mismatch between test mocks and actual implementation

**Solution**: 
- Ensure mocks accurately reflect runtime behavior
- Add integration tests alongside contract tests
- Verify database/service responses match schemas

### Issue: Flaky Tests

**Cause**: Timing issues, non-deterministic data

**Solution**:
- Use fixed timestamps in tests
- Mock random values
- Control async operations
- Use proper test isolation

### Issue: Schema Too Strict

**Cause**: Over-constrained validation

**Solution**:
- Use `.optional()` for non-critical fields
- Consider `.passthrough()` for extensibility
- Add `.nullable()` where appropriate
- Use unions for flexibility

## Future Enhancements

1. **OpenAPI Generation**: Auto-generate OpenAPI specs from schemas
2. **Client SDK Generation**: Generate type-safe clients from contracts
3. **Contract Versioning**: Support multiple API versions
4. **Performance Testing**: Add contract-based load testing
5. **Mock Server**: Generate mock servers from contracts

## Resources

- [Zod Documentation](https://zod.dev/)
- [Contract Testing Best Practices](https://martinfowler.com/bliki/ContractTest.html)
- [API Design Guidelines](https://github.com/microsoft/api-guidelines)
- [Jest Testing Patterns](https://jestjs.io/docs/best-practices)