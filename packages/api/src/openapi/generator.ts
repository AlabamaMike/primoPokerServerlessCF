import { z } from 'zod';
import type { OpenAPIV3 } from './types';

/**
 * OpenAPI Generator for converting Zod schemas to OpenAPI 3.0 specifications
 */

export class OpenAPIGenerator {
  private document: OpenAPIV3.Document;
  private schemas: Map<string, z.ZodSchema> = new Map();

  constructor(info: OpenAPIV3.InfoObject, servers: OpenAPIV3.ServerObject[] = []) {
    this.document = {
      openapi: '3.0.3',
      info,
      servers,
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Bearer token authentication'
          }
        }
      },
      security: [{ bearerAuth: [] }]
    };
  }

  /**
   * Register a Zod schema with a name for reuse
   */
  registerSchema(name: string, schema: z.ZodSchema): void {
    this.schemas.set(name, schema);
    const openApiSchema = this.zodToOpenAPI(schema);
    if (this.document.components?.schemas) {
      this.document.components.schemas[name] = openApiSchema;
    }
  }

  /**
   * Add an API endpoint
   */
  addEndpoint(
    path: string,
    method: OpenAPIV3.HttpMethods,
    config: {
      operationId: string;
      summary: string;
      description?: string;
      tags?: string[];
      security?: boolean;
      requestBody?: {
        schema: z.ZodSchema;
        description?: string;
        required?: boolean;
      };
      parameters?: Array<{
        name: string;
        in: 'path' | 'query' | 'header';
        schema: z.ZodSchema;
        description?: string;
        required?: boolean;
      }>;
      responses: Record<string, {
        description: string;
        schema?: z.ZodSchema;
        headers?: Record<string, OpenAPIV3.HeaderObject>;
      }>;
    }
  ): void {
    if (!this.document.paths[path]) {
      this.document.paths[path] = {};
    }

    const operation: OpenAPIV3.OperationObject = {
      operationId: config.operationId,
      summary: config.summary,
      description: config.description,
      tags: config.tags || [],
      security: config.security === false ? [] : [{ bearerAuth: [] }],
      parameters: [],
      responses: {}
    };

    // Add parameters
    if (config.parameters) {
      operation.parameters = config.parameters.map(param => ({
        name: param.name,
        in: param.in,
        description: param.description,
        required: param.required !== false,
        schema: this.zodToOpenAPI(param.schema)
      }));
    }

    // Add request body
    if (config.requestBody) {
      operation.requestBody = {
        description: config.requestBody.description,
        required: config.requestBody.required !== false,
        content: {
          'application/json': {
            schema: this.zodToOpenAPI(config.requestBody.schema)
          }
        }
      };
    }

    // Add responses
    for (const [statusCode, response] of Object.entries(config.responses)) {
      const responseObj: OpenAPIV3.ResponseObject = {
        description: response.description
      };

      if (response.schema) {
        responseObj.content = {
          'application/json': {
            schema: this.zodToOpenAPI(response.schema)
          }
        };
      }

      if (response.headers) {
        responseObj.headers = response.headers;
      }

      operation.responses[statusCode] = responseObj;
    }

    this.document.paths[path][method] = operation;
  }

  /**
   * Convert Zod schema to OpenAPI schema
   */
  private zodToOpenAPI(schema: z.ZodSchema): OpenAPIV3.SchemaObject {
    if (schema instanceof z.ZodString) {
      return {
        type: 'string',
        ...(schema.minLength ? { minLength: schema.minLength } : {}),
        ...(schema.maxLength ? { maxLength: schema.maxLength } : {})
      };
    }

    if (schema instanceof z.ZodNumber) {
      return {
        type: 'number',
        ...(schema.isInt ? { format: 'int32' } : {})
      };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToOpenAPI(schema.element)
      };
    }

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, OpenAPIV3.SchemaObject> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToOpenAPI(value as z.ZodSchema);
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema.options
      };
    }

    if (schema instanceof z.ZodUnion) {
      return {
        oneOf: schema.options.map((option: z.ZodSchema) => this.zodToOpenAPI(option))
      };
    }

    if (schema instanceof z.ZodOptional) {
      return this.zodToOpenAPI(schema.unwrap());
    }

    if (schema instanceof z.ZodNullable) {
      const innerSchema = this.zodToOpenAPI(schema.unwrap());
      return {
        ...innerSchema,
        nullable: true
      };
    }

    // Default fallback
    return { type: 'object' };
  }

  /**
   * Generate the complete OpenAPI document
   */
  generate(): OpenAPIV3.Document {
    return this.document;
  }

  /**
   * Generate OpenAPI JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.document, null, 2);
  }

  /**
   * Generate OpenAPI YAML string (basic implementation)
   */
  toYAML(): string {
    // Basic YAML generation - in production you'd use a proper YAML library
    return this.objectToYAML(this.document, 0);
  }

  private objectToYAML(obj: any, indent: number): string {
    const spaces = ' '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      yaml += `${spaces}${key}:`;

      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += '\n' + this.objectToYAML(value, indent + 2);
      } else if (Array.isArray(value)) {
        yaml += '\n';
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}- \n${this.objectToYAML(item, indent + 4)}`;
          } else {
            yaml += `${spaces}- ${item}\n`;
          }
        }
      } else {
        yaml += ` ${value}\n`;
      }
    }

    return yaml;
  }
}

/**
 * Helper function to create a standard API response schema
 */
export function createApiResponseSchema<T extends z.ZodSchema>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string()
    }).optional(),
    timestamp: z.string()
  });
}

/**
 * Helper function to create a paginated response schema
 */
export function createPaginatedResponseSchema<T extends z.ZodSchema>(itemSchema: T) {
  return z.object({
    success: z.boolean(),
    data: z.object({
      items: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean()
    }),
    timestamp: z.string()
  });
}