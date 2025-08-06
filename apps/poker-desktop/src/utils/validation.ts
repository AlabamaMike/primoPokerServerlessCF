export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ValidationRule<T> {
  validate: (value: T) => ValidationResult;
  message?: string;
}

// Common validation functions
export const validators = {
  required: (message = 'This field is required'): ValidationRule<any> => ({
    validate: (value) => ({
      isValid: value !== null && value !== undefined && value !== '',
      error: message
    })
  }),

  email: (message = 'Invalid email address'): ValidationRule<string> => ({
    validate: (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return {
        isValid: emailRegex.test(value),
        error: message
      };
    }
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value) => ({
      isValid: value.length >= min,
      error: message || `Must be at least ${min} characters`
    })
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value) => ({
      isValid: value.length <= max,
      error: message || `Must be no more than ${max} characters`
    })
  }),

  pattern: (regex: RegExp, message = 'Invalid format'): ValidationRule<string> => ({
    validate: (value) => ({
      isValid: regex.test(value),
      error: message
    })
  }),

  numeric: (message = 'Must be a number'): ValidationRule<string> => ({
    validate: (value) => ({
      isValid: !isNaN(Number(value)) && value.trim() !== '',
      error: message
    })
  }),

  min: (min: number, message?: string): ValidationRule<number> => ({
    validate: (value) => ({
      isValid: value >= min,
      error: message || `Must be at least ${min}`
    })
  }),

  max: (max: number, message?: string): ValidationRule<number> => ({
    validate: (value) => ({
      isValid: value <= max,
      error: message || `Must be no more than ${max}`
    })
  }),

  password: (message = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'): ValidationRule<string> => ({
    validate: (value) => {
      const hasUpperCase = /[A-Z]/.test(value);
      const hasLowerCase = /[a-z]/.test(value);
      const hasNumber = /\d/.test(value);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
      const isLongEnough = value.length >= 8;

      return {
        isValid: hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar && isLongEnough,
        error: message
      };
    }
  }),

  username: (message = 'Username must be 3-20 characters and contain only letters, numbers, and underscores'): ValidationRule<string> => ({
    validate: (value) => {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      return {
        isValid: usernameRegex.test(value),
        error: message
      };
    }
  }),

  amount: (minAmount = 0, maxAmount = Number.MAX_SAFE_INTEGER): ValidationRule<number> => ({
    validate: (value) => {
      if (isNaN(value)) {
        return { isValid: false, error: 'Must be a valid number' };
      }
      if (value < minAmount) {
        return { isValid: false, error: `Amount must be at least ${minAmount}` };
      }
      if (value > maxAmount) {
        return { isValid: false, error: `Amount must be no more than ${maxAmount}` };
      }
      return { isValid: true };
    }
  }),

  tableId: (message = 'Invalid table ID format'): ValidationRule<string> => ({
    validate: (value) => {
      // Assuming table IDs are UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return {
        isValid: uuidRegex.test(value),
        error: message
      };
    }
  }),

  url: (message = 'Invalid URL'): ValidationRule<string> => ({
    validate: (value) => {
      try {
        new URL(value);
        return { isValid: true };
      } catch {
        return { isValid: false, error: message };
      }
    }
  })
};

// Validation composer for multiple rules
export function validate<T>(value: T, ...rules: ValidationRule<T>[]): ValidationResult {
  for (const rule of rules) {
    const result = rule.validate(value);
    if (!result.isValid) {
      return result;
    }
  }
  return { isValid: true };
}

// Form validation helper
export interface FormErrors {
  [key: string]: string | undefined;
}

export function validateForm<T extends Record<string, any>>(
  values: T,
  rules: { [K in keyof T]?: ValidationRule<T[K]>[] }
): { isValid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};
  let isValid = true;

  for (const [field, fieldRules] of Object.entries(rules)) {
    if (fieldRules && fieldRules.length > 0) {
      const value = values[field as keyof T];
      for (const rule of fieldRules) {
        const result = rule.validate(value);
        if (!result.isValid) {
          errors[field] = result.error;
          isValid = false;
          break;
        }
      }
    }
  }

  return { isValid, errors };
}

// React hook for form validation
import { useState, useCallback } from 'react';

export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: { [K in keyof T]?: ValidationRule<T[K]>[] }
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = useCallback((field: keyof T, value: T[keyof T]) => {
    const rules = validationRules[field];
    if (!rules || rules.length === 0) return '';

    for (const rule of rules) {
      const result = rule.validate(value);
      if (!result.isValid) {
        return result.error || '';
      }
    }
    return '';
  }, [validationRules]);

  const handleChange = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    if (touched[field as string]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  }, [touched, validateField]);

  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [values, validateField]);

  const validateAll = useCallback(() => {
    const { isValid, errors: formErrors } = validateForm(values, validationRules);
    setErrors(formErrors);
    setTouched(Object.keys(values).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    return isValid;
  }, [values, validationRules]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll,
    reset,
    isValid: Object.keys(errors).length === 0
  };
}