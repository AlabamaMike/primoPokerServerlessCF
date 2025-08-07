/**
 * Path validation utilities for JSON Patch operations
 */

// Valid path segment pattern: alphanumeric, underscore, hyphen
const VALID_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/

// Known safe paths for table operations
const ALLOWED_PATH_PREFIXES = [
  '/tables/',
  '/stats/'
]

// Known safe field names for table updates
const ALLOWED_TABLE_FIELDS = new Set([
  'name',
  'status',
  'currentPlayers',
  'maxPlayers',
  'avgPot',
  'handsPerHour',
  'playerIds',
  'currency'
])

export class PathValidationError extends Error {
  constructor(message: string, public path: string) {
    super(message)
    this.name = 'PathValidationError'
  }
}

/**
 * Validate a JSON Patch path
 * @throws {PathValidationError} if path is invalid
 */
export function validatePath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new PathValidationError('Path must be a non-empty string', path)
  }
  
  // Must start with /
  if (!path.startsWith('/')) {
    throw new PathValidationError('Path must start with /', path)
  }
  
  // Check against allowed prefixes
  const hasAllowedPrefix = ALLOWED_PATH_PREFIXES.some(prefix => 
    path.startsWith(prefix)
  )
  
  if (!hasAllowedPrefix) {
    throw new PathValidationError('Path does not match allowed prefixes', path)
  }
  
  // Validate path segments
  const segments = path.split('/').filter(s => s)
  
  for (const segment of segments) {
    if (!VALID_SEGMENT_PATTERN.test(segment)) {
      throw new PathValidationError(
        `Invalid path segment: ${segment}. Only alphanumeric, underscore, and hyphen allowed`,
        path
      )
    }
  }
  
  // For table paths, validate field names
  if (path.startsWith('/tables/') && segments.length >= 3) {
    const field = segments[2]
    if (field && !ALLOWED_TABLE_FIELDS.has(field)) {
      throw new PathValidationError(
        `Invalid table field: ${field}`,
        path
      )
    }
  }
}

/**
 * Sanitize a path by removing dangerous characters
 */
export function sanitizePath(path: string): string {
  return path
    .split('/')
    .map(segment => segment.replace(/[^a-zA-Z0-9_-]/g, ''))
    .join('/')
}