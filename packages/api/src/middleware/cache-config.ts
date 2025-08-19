/**
 * Cache configuration types and constants for CDN and edge caching
 */

export interface CacheTTL {
  ttl: number;        // Time to live in seconds
  edge: boolean;      // Enable edge caching
}

export interface CacheConfig {
  static: {
    assets: CacheTTL;
    images: CacheTTL; 
    scripts: CacheTTL;
  };
  api: {
    public: CacheTTL;
    authenticated: CacheTTL;
    lobby: CacheTTL;
  };
}

// Default cache configuration
export const cacheConfig: CacheConfig = {
  static: {
    assets: { ttl: 86400, edge: true },    // 24 hours
    images: { ttl: 604800, edge: true },   // 7 days
    scripts: { ttl: 3600, edge: true },    // 1 hour
  },
  api: {
    public: { ttl: 300, edge: true },      // 5 minutes
    authenticated: { ttl: 0, edge: false }, // No caching
    lobby: { ttl: 60, edge: true },        // 1 minute
  }
};

// Cache control header values
export const CacheControl = {
  NO_CACHE: 'no-cache, no-store, must-revalidate',
  PRIVATE_NO_CACHE: 'private, no-cache, no-store, must-revalidate',
  PUBLIC_IMMUTABLE: 'public, max-age=31536000, immutable',
  PUBLIC_REVALIDATE: 'public, max-age=0, must-revalidate',
} as const;

// Content types that should be cached
export const CACHEABLE_CONTENT_TYPES = [
  'application/json',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'font/woff',
  'font/woff2',
];

// API routes that should be cached
export const CACHEABLE_API_ROUTES = [
  '/api/health',
  '/api/lobby/tables',
  '/api/tables',
  '/api/leaderboards',
  '/api/tournaments',
];

// API routes that should never be cached
export const NON_CACHEABLE_API_ROUTES = [
  '/api/auth/',
  '/api/wallet/',
  '/api/players/me',
  '/api/tables/*/action',
  '/api/tables/*/join',
  '/api/tables/*/leave',
];