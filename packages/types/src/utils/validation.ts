import { z } from 'zod';

/**
 * Common validation schemas and utilities
 */

export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const UsernameSchema = z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/);
export const PasswordSchema = z.string().min(8).max(100);
export const CurrencySchema = z.string().length(3).toUpperCase();
export const TimestampSchema = z.date();
export const DateTimeStringSchema = z.string().datetime();

export const PositiveNumberSchema = z.number().positive();
export const NonNegativeNumberSchema = z.number().nonnegative();
export const IntegerSchema = z.number().int();
export const PercentageSchema = z.number().min(0).max(100);

export const PaginationParamsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const DateRangeValidationSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be after start date",
});

/**
 * Validation result types
 */

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Validation utilities
 */

export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ValidationError[] = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      return { success: false, errors };
    }
    throw error;
  }
}

export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  return schema.safeParse(data);
}