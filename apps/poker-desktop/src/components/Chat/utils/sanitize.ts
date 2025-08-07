/**
 * Sanitizes user input to prevent XSS attacks and HTML injection
 * @param input The raw user input
 * @returns Sanitized string safe for display
 */
export function sanitizeInput(input: string): string {
  // Map of HTML entities to escape
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  // Replace dangerous characters with HTML entities
  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

/**
 * Validates message length and content
 * @param message The message to validate
 * @param maxLength Maximum allowed length
 * @returns Validation result with sanitized message
 */
export function validateMessage(
  message: string,
  maxLength: number = 500
): { isValid: boolean; sanitized: string; error?: string } {
  const trimmed = message.trim();
  
  if (!trimmed) {
    return { isValid: false, sanitized: '', error: 'Message cannot be empty' };
  }
  
  if (trimmed.length > maxLength) {
    return { 
      isValid: false, 
      sanitized: '', 
      error: `Message too long (max ${maxLength} characters)` 
    };
  }
  
  const sanitized = sanitizeInput(trimmed);
  
  return { isValid: true, sanitized };
}