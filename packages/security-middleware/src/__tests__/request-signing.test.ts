import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  RequestSigner, 
  APIKeyManager, 
  WebhookSigner,
  SensitiveOperationToken 
} from '../signing/request-signer';

// Mock KVNamespace
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  getWithMetadata(): never {
    throw new Error('Not implemented');
  }
  
  list(): never {
    throw new Error('Not implemented');
  }
}

describe('Request Signer', () => {
  let signer: RequestSigner;

  beforeEach(() => {
    signer = new RequestSigner('test-secret-key');
  });

  it('should sign request with headers', async () => {
    const request = new Request('https://api.example.com/users/123?filter=active', {
      method: 'GET',
    });
    
    const signedRequest = await signer.signRequest(request);
    
    expect(signedRequest.headers.get('X-Signature')).toBeTruthy();
    expect(signedRequest.headers.get('X-Timestamp')).toBeTruthy();
    expect(signedRequest.headers.get('X-Nonce')).toBeTruthy();
  });

  it('should verify correctly signed request', async () => {
    const request = new Request('https://api.example.com/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User' }),
    });
    
    const signedRequest = await signer.signRequest(request);
    const isValid = await signer.verifyRequest(signedRequest);
    
    expect(isValid).toBe(true);
  });

  it('should reject request with invalid signature', async () => {
    const request = new Request('https://api.example.com/users', {
      method: 'POST',
      headers: {
        'X-Signature': 'invalid-signature',
        'X-Timestamp': String(Math.floor(Date.now() / 1000)),
        'X-Nonce': 'test-nonce',
      },
    });
    
    const isValid = await signer.verifyRequest(request);
    expect(isValid).toBe(false);
  });

  it('should reject request with old timestamp', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes old
    
    const request = new Request('https://api.example.com/users', {
      headers: {
        'X-Signature': 'some-signature',
        'X-Timestamp': String(oldTimestamp),
        'X-Nonce': 'test-nonce',
      },
    });
    
    const isValid = await signer.verifyRequest(request);
    expect(isValid).toBe(false);
  });

  it('should prevent replay attacks with nonce store', async () => {
    const nonceStore = new MockKVNamespace();
    const request = new Request('https://api.example.com/action', {
      method: 'POST',
    });
    
    const signedRequest = await signer.signRequest(request);
    
    // First verification should succeed
    const isValid1 = await signer.verifyRequest(signedRequest, nonceStore);
    expect(isValid1).toBe(true);
    
    // Second verification with same nonce should fail
    const isValid2 = await signer.verifyRequest(signedRequest, nonceStore);
    expect(isValid2).toBe(false);
  });

  it('should include body hash in signature when configured', async () => {
    const signerWithBody = new RequestSigner('secret', { includeBody: true });
    
    const request = new Request('https://api.example.com/data', {
      method: 'POST',
      body: JSON.stringify({ data: 'important' }),
    });
    
    const signedRequest = await signerWithBody.signRequest(request);
    const isValid = await signerWithBody.verifyRequest(signedRequest);
    
    expect(isValid).toBe(true);
    
    // Modify body and verify it fails
    const tamperedRequest = new Request(signedRequest.url, {
      method: signedRequest.method,
      headers: signedRequest.headers,
      body: JSON.stringify({ data: 'tampered' }),
    });
    
    const isValidTampered = await signerWithBody.verifyRequest(tamperedRequest);
    expect(isValidTampered).toBe(false);
  });
});

describe('API Key Manager', () => {
  let storage: MockKVNamespace;
  let manager: APIKeyManager;

  beforeEach(() => {
    storage = new MockKVNamespace();
    manager = new APIKeyManager(storage);
  });

  it('should create API key with correct format', async () => {
    const result = await manager.createAPIKey(
      'owner123',
      'Test Key',
      ['read', 'write'],
      Date.now() + 86400000 // Expires in 1 day
    );
    
    expect(result.keyId).toBeTruthy();
    expect(result.apiKey).toMatch(/^pk_[A-Za-z0-9_-]+$/);
    expect(result.hashedKey).toBeTruthy();
    
    // Verify key was stored
    const storedData = await storage.get(`apikey:${result.keyId}`);
    expect(storedData).toBeTruthy();
  });

  it('should validate correct API key', async () => {
    const { apiKey } = await manager.createAPIKey(
      'owner456',
      'Valid Key',
      ['read']
    );
    
    const validation = await manager.validateAPIKey(apiKey);
    
    expect(validation.valid).toBe(true);
    expect(validation.permissions).toEqual(['read']);
    expect(validation.ownerId).toBe('owner456');
  });

  it('should reject invalid API key format', async () => {
    const validation = await manager.validateAPIKey('invalid-key');
    expect(validation.valid).toBe(false);
  });

  it('should reject expired API key', async () => {
    const { apiKey } = await manager.createAPIKey(
      'owner789',
      'Expired Key',
      ['read'],
      Date.now() - 1000 // Already expired
    );
    
    const validation = await manager.validateAPIKey(apiKey);
    expect(validation.valid).toBe(false);
  });

  it('should update usage statistics', async () => {
    const { keyId, apiKey } = await manager.createAPIKey(
      'owner999',
      'Stats Key',
      ['read']
    );
    
    // Validate multiple times
    await manager.validateAPIKey(apiKey);
    await manager.validateAPIKey(apiKey);
    await manager.validateAPIKey(apiKey);
    
    const storedData = await storage.get(`apikey:${keyId}`);
    const keyData = JSON.parse(storedData!);
    
    expect(keyData.usageCount).toBe(3);
    expect(keyData.lastUsed).toBeGreaterThan(keyData.createdAt);
  });

  it('should revoke API key', async () => {
    const { keyId, apiKey, hashedKey } = await manager.createAPIKey(
      'owner111',
      'Revoked Key',
      ['admin']
    );
    
    await manager.revokeAPIKey(keyId, 'admin123', 'Security breach');
    
    // Key should be deleted
    const keyData = await storage.get(`apikey:${keyId}`);
    expect(keyData).toBeNull();
    
    // Hash mapping should be deleted
    const hashMapping = await storage.get(`apikey:hash:${hashedKey}`);
    expect(hashMapping).toBeNull();
    
    // Validation should fail
    const validation = await manager.validateAPIKey(apiKey);
    expect(validation.valid).toBe(false);
  });
});

describe('Webhook Signer', () => {
  let signer: WebhookSigner;

  beforeEach(() => {
    signer = new WebhookSigner('webhook-secret');
  });

  it('should sign payload with timestamp', async () => {
    const payload = { event: 'user.created', userId: '123' };
    const signature = await signer.signPayload(payload);
    
    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
  });

  it('should verify valid signature', async () => {
    const payload = JSON.stringify({ event: 'payment.completed', amount: 100 });
    const signature = await signer.signPayload(payload);
    
    const isValid = await signer.verifySignature(payload, signature);
    expect(isValid).toBe(true);
  });

  it('should reject tampered payload', async () => {
    const originalPayload = JSON.stringify({ amount: 100 });
    const signature = await signer.signPayload(originalPayload);
    
    const tamperedPayload = JSON.stringify({ amount: 1000 });
    const isValid = await signer.verifySignature(tamperedPayload, signature);
    
    expect(isValid).toBe(false);
  });

  it('should reject old signatures', async () => {
    const payload = 'test-payload';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds old
    const signature = `t=${oldTimestamp},v1=somehash`;
    
    const isValid = await signer.verifySignature(payload, signature, 300);
    expect(isValid).toBe(false);
  });
});

describe('Sensitive Operation Token', () => {
  let tokenGenerator: SensitiveOperationToken;

  beforeEach(() => {
    tokenGenerator = new SensitiveOperationToken('operation-secret-key-32-bytes-long!!');
  });

  it('should generate encrypted token', async () => {
    const token = await tokenGenerator.generateToken(
      'user123',
      'delete-account',
      { reason: 'user request' }
    );
    
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it('should validate token for correct operation', async () => {
    const token = await tokenGenerator.generateToken(
      'user456',
      'change-email',
      { newEmail: 'new@example.com' }
    );
    
    const result = await tokenGenerator.validateToken(
      token,
      'user456',
      'change-email'
    );
    
    expect(result.valid).toBe(true);
    expect(result.metadata).toEqual({ newEmail: 'new@example.com' });
  });

  it('should reject token for wrong user', async () => {
    const token = await tokenGenerator.generateToken('user789', 'reset-password');
    
    const result = await tokenGenerator.validateToken(
      token,
      'different-user',
      'reset-password'
    );
    
    expect(result.valid).toBe(false);
  });

  it('should reject token for wrong operation', async () => {
    const token = await tokenGenerator.generateToken('user999', 'update-profile');
    
    const result = await tokenGenerator.validateToken(
      token,
      'user999',
      'delete-account' // Wrong operation
    );
    
    expect(result.valid).toBe(false);
  });

  it('should reject expired tokens', async () => {
    // Mock time to generate old token
    const originalNow = Date.now;
    Date.now = jest.fn().mockReturnValue(originalNow() - 400000); // 400 seconds ago
    
    const token = await tokenGenerator.generateToken('user111', 'critical-op');
    
    // Restore current time
    Date.now = originalNow;
    
    const result = await tokenGenerator.validateToken(
      token,
      'user111',
      'critical-op',
      300 // 5 minute max age
    );
    
    expect(result.valid).toBe(false);
  });
});