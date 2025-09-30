/**
 * Request Validation Middleware
 * Validates request data against Zod schemas
 */

import { z } from 'zod'

export interface ValidatedRequest<T = any> extends Request {
  validatedData: T
}

/**
 * Validates request body against a Zod schema
 * @param schema Zod schema to validate against
 * @returns Middleware function that adds validatedData to request
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return async (request: Request): Promise<ValidatedRequest<T>> => {
    try {
      const body = await request.json()
      const validatedData = schema.parse(body)

      return Object.assign(request, { validatedData })
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (request: Request): ValidatedRequest<T> => {
    const url = new URL(request.url)
    const params = Object.fromEntries(url.searchParams.entries())
    const validatedData = schema.parse(params)

    return Object.assign(request, { validatedData })
  }
}
