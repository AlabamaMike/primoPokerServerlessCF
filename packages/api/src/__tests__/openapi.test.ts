import { describe, it, expect } from '@jest/globals';
import { OpenAPIGenerator, createApiResponseSchema, createPaginatedResponseSchema } from '../openapi/generator';
import { generateOpenAPISpec } from '../openapi/api-spec';
import { z } from 'zod';

describe('OpenAPI Generator', () => {
  describe('OpenAPIGenerator', () => {
    it('should create a valid OpenAPI document', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test API',
        version: '1.0.0'
      });

      const doc = generator.generate();
      expect(doc.openapi).toBe('3.0.3');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');
      expect(doc.paths).toEqual({});
    });

    it('should register schemas correctly', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test API',
        version: '1.0.0'
      });

      const UserSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email()
      });

      generator.registerSchema('User', UserSchema);
      const doc = generator.generate();

      expect(doc.components?.schemas?.User).toBeDefined();
      expect(doc.components?.schemas?.User).toEqual({
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' }
        },
        required: ['id', 'name', 'email']
      });
    });

    it('should add endpoints with proper structure', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test API',
        version: '1.0.0'
      });

      generator.addEndpoint('/api/users', 'get', {
        operationId: 'getUsers',
        summary: 'Get all users',
        tags: ['Users'],
        responses: {
          '200': {
            description: 'List of users',
            schema: z.array(z.object({
              id: z.string(),
              name: z.string()
            }))
          }
        }
      });

      const doc = generator.generate();
      expect(doc.paths['/api/users']).toBeDefined();
      expect(doc.paths['/api/users'].get).toBeDefined();
      expect(doc.paths['/api/users'].get?.operationId).toBe('getUsers');
      expect(doc.paths['/api/users'].get?.summary).toBe('Get all users');
    });

    it('should handle authentication settings', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test API',
        version: '1.0.0'
      });

      generator.addEndpoint('/api/public', 'get', {
        operationId: 'publicEndpoint',
        summary: 'Public endpoint',
        security: false,
        responses: {
          '200': { description: 'Success' }
        }
      });

      generator.addEndpoint('/api/private', 'get', {
        operationId: 'privateEndpoint',
        summary: 'Private endpoint',
        responses: {
          '200': { description: 'Success' }
        }
      });

      const doc = generator.generate();
      expect(doc.paths['/api/public'].get?.security).toEqual([]);
      expect(doc.paths['/api/private'].get?.security).toEqual([{ bearerAuth: [] }]);
    });
  });

  describe('Schema Conversion', () => {
    it('should convert string schemas', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test',
        version: '1.0.0'
      });

      const schema = z.string().min(3).max(10);
      generator.registerSchema('TestString', schema);
      
      const doc = generator.generate();
      expect(doc.components?.schemas?.TestString).toEqual({
        type: 'string',
        minLength: 3,
        maxLength: 10
      });
    });

    it('should convert number schemas', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test',
        version: '1.0.0'
      });

      const schema = z.number();
      generator.registerSchema('TestNumber', schema);
      
      const doc = generator.generate();
      expect(doc.components?.schemas?.TestNumber).toEqual({
        type: 'number'
      });
    });

    it('should convert enum schemas', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test',
        version: '1.0.0'
      });

      const schema = z.enum(['active', 'inactive', 'pending']);
      generator.registerSchema('TestEnum', schema);
      
      const doc = generator.generate();
      expect(doc.components?.schemas?.TestEnum).toEqual({
        type: 'string',
        enum: ['active', 'inactive', 'pending']
      });
    });

    it('should convert array schemas', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test',
        version: '1.0.0'
      });

      const schema = z.array(z.string());
      generator.registerSchema('TestArray', schema);
      
      const doc = generator.generate();
      expect(doc.components?.schemas?.TestArray).toEqual({
        type: 'array',
        items: { type: 'string' }
      });
    });

    it('should convert optional fields', () => {
      const generator = new OpenAPIGenerator({
        title: 'Test',
        version: '1.0.0'
      });

      const schema = z.object({
        required: z.string(),
        optional: z.string().optional()
      });
      generator.registerSchema('TestOptional', schema);
      
      const doc = generator.generate();
      expect(doc.components?.schemas?.TestOptional).toEqual({
        type: 'object',
        properties: {
          required: { type: 'string' },
          optional: { type: 'string' }
        },
        required: ['required']
      });
    });
  });

  describe('Helper Functions', () => {
    it('should create standard API response schema', () => {
      const dataSchema = z.object({ id: z.string() });
      const responseSchema = createApiResponseSchema(dataSchema);
      
      const result = responseSchema.parse({
        success: true,
        data: { id: '123' },
        timestamp: '2024-01-01T00:00:00Z'
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '123' });
    });

    it('should create paginated response schema', () => {
      const itemSchema = z.object({ id: z.string() });
      const paginatedSchema = createPaginatedResponseSchema(itemSchema);
      
      const result = paginatedSchema.parse({
        success: true,
        data: {
          items: [{ id: '1' }, { id: '2' }],
          total: 10,
          page: 1,
          pageSize: 2,
          hasNextPage: true,
          hasPreviousPage: false
        },
        timestamp: '2024-01-01T00:00:00Z'
      });
      
      expect(result.data.items).toHaveLength(2);
      expect(result.data.total).toBe(10);
    });
  });

  describe('Full API Specification', () => {
    it('should generate complete OpenAPI spec without errors', () => {
      const spec = generateOpenAPISpec();
      const parsed = JSON.parse(spec);
      
      expect(parsed.openapi).toBe('3.0.3');
      expect(parsed.info.title).toBe('Primo Poker API');
      expect(parsed.info.version).toBe('1.0.0');
      expect(parsed.servers).toHaveLength(2);
    });

    it('should include all major endpoints', () => {
      const spec = generateOpenAPISpec();
      const parsed = JSON.parse(spec);
      
      // Check authentication endpoints
      expect(parsed.paths['/api/auth/register']).toBeDefined();
      expect(parsed.paths['/api/auth/login']).toBeDefined();
      expect(parsed.paths['/api/auth/refresh']).toBeDefined();
      expect(parsed.paths['/api/auth/logout']).toBeDefined();
      
      // Check player endpoints
      expect(parsed.paths['/api/players/me']).toBeDefined();
      
      // Check table endpoints
      expect(parsed.paths['/api/tables']).toBeDefined();
      expect(parsed.paths['/api/tables/{tableId}']).toBeDefined();
      expect(parsed.paths['/api/tables/{tableId}/join']).toBeDefined();
      
      // Check wallet endpoints
      expect(parsed.paths['/api/wallet/balance']).toBeDefined();
      expect(parsed.paths['/api/wallet/deposit']).toBeDefined();
      
      // Check health endpoint
      expect(parsed.paths['/api/health']).toBeDefined();
    });

    it('should include security schemes', () => {
      const spec = generateOpenAPISpec();
      const parsed = JSON.parse(spec);
      
      expect(parsed.components.securitySchemes.bearerAuth).toBeDefined();
      expect(parsed.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(parsed.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    });

    it('should properly tag endpoints', () => {
      const spec = generateOpenAPISpec();
      const parsed = JSON.parse(spec);
      
      expect(parsed.paths['/api/auth/login'].post.tags).toContain('Authentication');
      expect(parsed.paths['/api/players/me'].get.tags).toContain('Players');
      expect(parsed.paths['/api/tables'].get.tags).toContain('Tables');
      expect(parsed.paths['/api/wallet/balance'].get.tags).toContain('Wallet');
    });
  });
});