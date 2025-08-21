# OpenAPI Documentation

This guide explains how to use and maintain the OpenAPI documentation for the Primo Poker API.

## Overview

The Primo Poker API is documented using OpenAPI 3.0 specification, automatically generated from our Zod schemas. This ensures that our documentation is always in sync with the actual API implementation.

## Accessing the Documentation

### 1. Live Documentation Endpoints

When the server is running, you can access the API documentation at:

- **Swagger UI**: `https://primo-poker-server.alabamamike.workers.dev/api/docs`
- **ReDoc**: `https://primo-poker-server.alabamamike.workers.dev/api/redoc`
- **OpenAPI JSON**: `https://primo-poker-server.alabamamike.workers.dev/api/openapi.json`

### 2. Static Documentation

Generate static documentation files:

```bash
npm run generate:openapi
```

This creates:
- `docs/api/openapi.json` - The OpenAPI specification
- `docs/api/openapi-pretty.json` - Human-readable formatted version
- `docs/api/index.html` - Standalone documentation viewer

## Architecture

### Components

1. **Schema Generator** (`packages/api/src/openapi/generator.ts`)
   - Converts Zod schemas to OpenAPI schemas
   - Handles all Zod types including unions, arrays, and objects
   - Supports schema references and reuse

2. **API Specification** (`packages/api/src/openapi/api-spec.ts`)
   - Defines all API endpoints
   - Maps routes to their schemas
   - Configures authentication and security

3. **Route Handler** (`packages/api/src/routes/openapi.ts`)
   - Serves OpenAPI JSON
   - Provides Swagger UI interface
   - Provides ReDoc interface

## Adding New Endpoints

To add a new endpoint to the OpenAPI documentation:

1. **Define Zod Schemas**
   ```typescript
   // In your validation file
   export const CreateItemSchema = z.object({
     name: z.string().min(1),
     description: z.string().optional(),
     price: z.number().positive()
   });
   ```

2. **Add to API Specification**
   ```typescript
   // In packages/api/src/openapi/api-spec.ts
   generator.addEndpoint('/api/items', 'post', {
     operationId: 'createItem',
     summary: 'Create a new item',
     description: 'Creates a new item in the inventory',
     tags: ['Items'],
     requestBody: {
       schema: CreateItemSchema,
       description: 'Item creation data'
     },
     responses: {
       '201': {
         description: 'Item created successfully',
         schema: createApiResponseSchema(ItemSchema)
       },
       '400': {
         description: 'Invalid item data',
         schema: createApiResponseSchema(z.never())
       }
     }
   });
   ```

3. **Regenerate Documentation**
   ```bash
   npm run generate:openapi
   ```

## Schema Patterns

### Standard Response Format

All API responses follow a consistent format:

```typescript
{
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}
```

### Paginated Responses

For list endpoints with pagination:

```typescript
{
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  timestamp: string;
}
```

## Authentication

The API uses JWT Bearer token authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

Endpoints that don't require authentication are marked with `security: false` in the specification.

## Supported Features

- ✅ All standard OpenAPI 3.0 data types
- ✅ Request/response validation
- ✅ Authentication schemes
- ✅ Parameter validation (path, query, header)
- ✅ Schema references and reuse
- ✅ Enums and discriminated unions
- ✅ Arrays and nested objects
- ✅ Optional and nullable fields

## Testing the API

You can test API endpoints directly from the Swagger UI documentation:

1. Navigate to `/api/docs`
2. Click "Authorize" and enter your JWT token
3. Select an endpoint to expand it
4. Click "Try it out"
5. Fill in the parameters
6. Click "Execute"

## Integration with CI/CD

The OpenAPI specification can be:

1. **Generated during build**
   ```json
   // In package.json
   "build": "npm run generate:openapi && npm run build:packages"
   ```

2. **Validated in tests**
   ```typescript
   // Test that spec generates without errors
   test('OpenAPI spec generates successfully', () => {
     const spec = generateOpenAPISpec();
     const parsed = JSON.parse(spec);
     expect(parsed.openapi).toBe('3.0.3');
   });
   ```

3. **Published as artifacts**
   - Include `docs/api/openapi.json` in your deployments
   - Can be imported into API gateways
   - Can be used by client SDK generators

## Customization

### Adding Custom Schemas

For complex types not automatically handled:

```typescript
// In generator.ts
private zodToOpenAPI(schema: z.ZodSchema): OpenAPIV3.SchemaObject {
  // Add custom handling for your type
  if (schema instanceof MyCustomZodType) {
    return {
      type: 'object',
      properties: {
        // Custom properties
      }
    };
  }
  // ... existing code
}
```

### Extending Documentation

Add examples, descriptions, and additional metadata:

```typescript
generator.addEndpoint('/api/example', 'get', {
  operationId: 'getExample',
  summary: 'Example endpoint',
  description: `
    This endpoint demonstrates advanced features.
    
    ## Usage Notes
    - Supports filtering by date
    - Returns maximum 100 items
    - Results are cached for 5 minutes
  `,
  parameters: [
    {
      name: 'date',
      in: 'query',
      schema: z.string(),
      description: 'Filter by date (ISO 8601 format)',
      example: '2024-01-01'
    }
  ]
});
```

## Best Practices

1. **Keep Schemas DRY**
   - Define reusable schemas once
   - Register common schemas for reuse
   - Use schema composition

2. **Document Thoroughly**
   - Add descriptions to all endpoints
   - Include examples where helpful
   - Document error scenarios

3. **Version Your API**
   - Include version in the API path or header
   - Document breaking changes
   - Maintain backward compatibility

4. **Security First**
   - Document authentication requirements
   - Specify required permissions
   - Include rate limiting information

## Troubleshooting

### Common Issues

1. **Schema not found**
   - Ensure schema is exported
   - Check import paths
   - Verify schema registration

2. **Invalid OpenAPI output**
   - Check for circular references
   - Ensure all Zod types are supported
   - Validate against OpenAPI 3.0 spec

3. **Documentation not updating**
   - Clear browser cache
   - Regenerate with `npm run generate:openapi`
   - Restart the development server

## Future Enhancements

- [ ] Add response examples
- [ ] Generate client SDKs
- [ ] Add webhook documentation
- [ ] Include rate limiting info
- [ ] Add API versioning