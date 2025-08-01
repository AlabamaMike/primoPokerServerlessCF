// Configuration file with static values
// This ensures the URLs are always available regardless of build environment
export const API_CONFIG = {
  BASE_URL: 'https://primo-poker-server.alabamamike.workers.dev',
  WS_URL: 'wss://primo-poker-server.alabamamike.workers.dev',
  ENVIRONMENT: 'production'
} as const

// Fallback for process.env access
export function getApiUrl(): string {
  // Try environment variable first, then fallback to static config
  const envUrl = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_API_URL : undefined
  const configUrl = API_CONFIG.BASE_URL
  
  const url = envUrl || configUrl
  console.log('API URL resolved:', { envUrl, configUrl, final: url })
  return url
}

export function getWebSocketUrl(): string {
  // Try environment variable first, then fallback to static config
  const envUrl = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_WS_URL : undefined
  const configUrl = API_CONFIG.WS_URL
  
  const url = envUrl || configUrl
  console.log('WebSocket URL resolved:', { envUrl, configUrl, final: url })
  return url
}
