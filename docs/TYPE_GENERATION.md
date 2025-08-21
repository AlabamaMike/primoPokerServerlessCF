# Type Generation from Zod Schemas

This document describes the automated type generation system that creates TypeScript types from Zod schemas throughout the codebase.

## Overview

The type generation system automatically scans the codebase for Zod schema definitions and generates:
1. TypeScript type definitions using `z.infer<>`
2. A centralized schema registry
3. Type-safe validation utilities
4. A unified type export for easy importing

## How It Works

### 1. Schema Discovery
The `generate-types-from-zod.ts` script scans all TypeScript files in the `packages/` directory looking for exported Zod schemas (variables ending with `Schema` that use Zod methods).

### 2. Type Generation
For each discovered schema, the script:
- Generates a corresponding TypeScript type using `z.infer<typeof Schema>`
- Creates a centralized registry organizing schemas by package
- Generates validation helper functions

### 3. Output Structure
Generated files are placed in `packages/shared/src/generated/`:
- `types.ts` - Type definitions and schema registry
- `validation.ts` - Type-safe validation utilities
- `index.ts` - Re-exports for convenience

## Usage

### Running Type Generation

```bash
# Generate types manually
npm run generate:types

# Types are also generated automatically before build
npm run build
```

### Using Generated Types

```typescript
import { 
  SchemaRegistry, 
  validateWithSchema, 
  safeValidateWithSchema,
  validateBatch 
} from '@primo-poker/shared/generated';

// Access schemas through the registry
const playerSchema = SchemaRegistry.shared.PlayerSchema;

// Type-safe validation
const player = validateWithSchema('shared', 'PlayerSchema', unknownData);

// Safe validation (doesn't throw)
const result = safeValidateWithSchema('shared', 'PlayerSchema', unknownData);
if (result.success) {
  // result.data is typed as Player
}

// Batch validation
const players = validateBatch('shared', 'PlayerSchema', arrayOfUnknownData);
```

### Generated Type Names

Types that don't already have explicit exports are prefixed with `Generated`:
- `PlayerSchema` → `GeneratedPlayer`
- `DepositRequestSchema` → `GeneratedDepositRequest`

## Benefits

1. **Single Source of Truth**: Types are always in sync with validation schemas
2. **Type Safety**: Compile-time checking for schema names and data shapes
3. **Reduced Boilerplate**: No need to manually define types for schemas
4. **API Contract Enforcement**: Frontend and backend share identical types
5. **Better Developer Experience**: Auto-completion for all schemas and types
6. **Runtime Validation**: Same schemas used for both typing and validation

## Adding New Schemas

1. Create your Zod schema with a name ending in `Schema`:
   ```typescript
   export const MyNewSchema = z.object({
     id: z.string(),
     name: z.string(),
     value: z.number()
   });
   ```

2. Run type generation:
   ```bash
   npm run generate:types
   ```

3. Use the generated types:
   ```typescript
   import { GeneratedMyNew } from '@primo-poker/shared/generated';
   
   const data: GeneratedMyNew = {
     id: '123',
     name: 'test',
     value: 42
   };
   ```

## Best Practices

1. **Naming Convention**: Always end Zod schema names with `Schema`
2. **Export Schemas**: Only exported schemas are included in generation
3. **Avoid Circular Dependencies**: Keep schemas in appropriate packages
4. **Document Complex Schemas**: Add JSDoc comments to schemas for better IDE support
5. **Use Validation Helpers**: Prefer the type-safe helpers over direct schema usage

## Troubleshooting

### Types Not Generated
- Ensure your schema is exported
- Check that the schema name ends with `Schema`
- Verify the file is in a `packages/*/src` directory

### Build Errors
- Run `npm install` to ensure dependencies are installed
- Delete `packages/shared/src/generated` and regenerate
- Check for TypeScript errors in schema definitions

### Import Errors
- Use `@primo-poker/shared/generated` for imports
- Ensure the shared package is built first