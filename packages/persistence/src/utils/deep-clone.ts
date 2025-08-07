/**
 * Deep clone utility using structured cloning when available
 * Falls back to JSON parse/stringify for compatibility
 */
export function deepClone<T>(obj: T): T {
  // Use structuredClone if available (modern environments)
  if (typeof structuredClone === 'function') {
    return structuredClone(obj)
  }
  
  // Fallback for objects that can be JSON serialized
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  // Handle Date objects
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T
  }
  
  // Handle Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T
  }
  
  // Handle Maps
  if (obj instanceof Map) {
    const cloned = new Map()
    obj.forEach((value, key) => {
      cloned.set(key, deepClone(value))
    })
    return cloned as T
  }
  
  // Handle Sets
  if (obj instanceof Set) {
    const cloned = new Set()
    obj.forEach(value => {
      cloned.add(deepClone(value))
    })
    return cloned as T
  }
  
  // Handle plain objects
  const cloned = {} as T
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key])
    }
  }
  
  return cloned
}