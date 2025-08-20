import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for combining class names with proper merging of Tailwind CSS classes
 * This combines clsx for conditional classes and tailwind-merge for proper Tailwind class precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}