// Mock import.meta for Jest
declare global {
  namespace NodeJS {
    interface Global {
      importMeta: {
        env: {
          VITE_API_URL?: string
          VITE_TEST_MODE?: string
        }
      }
    }
  }
}

// Set up import.meta mock
;(global as any).importMeta = {
  env: {
    VITE_API_URL: 'https://primo-poker-server.alabamamike.workers.dev',
    VITE_TEST_MODE: 'true',
  },
}

// Also set on globalThis for modern usage
;(globalThis as any).import = {
  meta: {
    env: {
      VITE_API_URL: 'https://primo-poker-server.alabamamike.workers.dev',
      VITE_TEST_MODE: 'true',
    },
  },
}

export {}