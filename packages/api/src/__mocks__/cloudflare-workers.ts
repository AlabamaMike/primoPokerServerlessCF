/**
 * Mock for cloudflare:workers module
 * Used in Jest tests to mock Cloudflare Workers built-in APIs
 */

// Mock RpcTarget for Durable Object RPC
export class RpcTarget {
  // Base class for RPC targets
}

// Mock RpcStub
export class RpcStub {
  // Mock stub for RPC communication
}

// Mock WorkerEntrypoint
export class WorkerEntrypoint {
  constructor(public ctx: any, public env: any) {}

  async fetch(request: Request): Promise<Response> {
    return new Response('Mock Worker Response')
  }
}

// Mock DurableObject
export class DurableObject {
  constructor(public ctx: any, public env: any) {}

  async fetch(request: Request): Promise<Response> {
    return new Response('Mock Durable Object Response')
  }
}

// Export default mock
export default {
  RpcTarget,
  RpcStub,
  WorkerEntrypoint,
  DurableObject,
}
