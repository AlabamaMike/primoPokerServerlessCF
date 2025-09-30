/**
 * Example demonstrating how to use the generated types from Zod schemas
 * This file shows the benefits of the type generation system
 */

// Import from the generated types when available
// import { SchemaRegistry, validateWithSchema, safeValidateWithSchema } from '../generated';

// Example 1: Using generated types
// The SchemaRegistry provides centralized access to all schemas
/*
const playerData = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  username: 'johndoe',
  email: 'john@example.com',
  chipCount: 1000,
  status: 'active'
};

// Type-safe validation using the registry
const validatedPlayer = validateWithSchema('shared', 'PlayerSchema', playerData);
// validatedPlayer is now fully typed as Player

// Safe validation that doesn't throw
const result = safeValidateWithSchema('shared', 'PlayerSchema', playerData);
if (result.success) {
  console.log('Valid player:', result.data);
} else {
  console.error('Validation errors:', result.error);
}
*/

// Example 2: Using generated types in API contracts
/*
// Temporarily disabled while fixing type generation
// import { GeneratedDepositRequest, GeneratedWithdrawRequest } from '../generated';

// These types are automatically generated from DepositRequestSchema and WithdrawRequestSchema
function handleDeposit(request: GeneratedDepositRequest) {
  // Type-safe access to request.amount and request.method
  console.log(`Processing ${request.method} deposit of $${request.amount}`);
}

function handleWithdraw(request: GeneratedWithdrawRequest) {
  // Type-safe access to request.amount and request.method
  console.log(`Processing ${request.method} withdrawal of $${request.amount}`);
}
*/

// Example 3: Using validation utilities for batch operations
/*
const players = [
  { id: '1', username: 'player1', email: 'p1@example.com', chipCount: 1000, status: 'active' },
  { id: '2', username: 'player2', email: 'p2@example.com', chipCount: 2000, status: 'active' },
  { id: '3', username: 'player3', email: 'p3@example.com', chipCount: 3000, status: 'active' }
];

// Validate all players at once
const validatedPlayers = validateBatch('shared', 'PlayerSchema', players);
// validatedPlayers is Player[]
*/

// Example 4: Benefits of centralized type generation
/*
Benefits:
1. Single source of truth - Types are always in sync with Zod schemas
2. Auto-completion - IDE knows all available schemas and their shapes
3. Type safety - Compile-time checks for schema names and data shapes
4. No manual type definitions - Reduces boilerplate and potential errors
5. Runtime validation - Same schemas used for both types and validation
6. API contract enforcement - Frontend and backend share the same types
7. Easy refactoring - Change schema once, types update everywhere
*/

export {};