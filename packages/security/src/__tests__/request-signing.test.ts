import { 
  RequestSigner, 
  createSignedToken, 
  verifySignedToken 
} from '../middleware/request-signing';

describe('Request Signing', () => {
  describe('RequestSigner', () => {
    let signer: RequestSigner;
    const secretKey = 'test-secret-key-12345';

    beforeEach(() => {
      signer = new RequestSigner({
        algorithm: 'SHA-256',
        maxTimeDiff: 300
      });
    });

    describe('signRequest', () => {
      it('should add signature headers to request', async () => {
        const request = new Request('https://api.example.com/test', {
          method: 'POST',
          body: JSON.stringify({ data: 'test' }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const signedRequest = await signer.signRequest(request, secretKey);

        expect(signedRequest.headers.get('X-Signature')).toBeTruthy();
        expect(signedRequest.headers.get('X-Timestamp')).toBeTruthy();
        expect(signedRequest.headers.get('X-Nonce')).toBeTruthy();
      });

      it('should generate different signatures for different requests', async () => {
        const request1 = new Request('https://api.example.com/test1');
        const request2 = new Request('https://api.example.com/test2');

        const signed1 = await signer.signRequest(request1, secretKey);
        const signed2 = await signer.signRequest(request2, secretKey);

        const sig1 = signed1.headers.get('X-Signature');
        const sig2 = signed2.headers.get('X-Signature');

        expect(sig1).not.toBe(sig2);
      });
    });

    describe('verifyRequest', () => {
      it('should verify valid signed request', async () => {
        const request = new Request('https://api.example.com/test', {
          method: 'POST',
          body: JSON.stringify({ data: 'test' })
        });

        const signedRequest = await signer.signRequest(request, secretKey);
        
        const result = await signer.verifyRequest(
          signedRequest,
          async () => secretKey
        );

        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should reject request with invalid signature', async () => {
        const request = new Request('https://api.example.com/test', {
          headers: {
            'X-Signature': 'invalid-signature',
            'X-Timestamp': Date.now().toString()
          }
        });

        const result = await signer.verifyRequest(
          request,
          async () => secretKey
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Invalid signature');
      });

      it('should reject request with expired timestamp', async () => {
        const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
        
        const request = new Request('https://api.example.com/test', {
          headers: {
            'X-Signature': 'some-signature',
            'X-Timestamp': oldTimestamp.toString()
          }
        });

        const result = await signer.verifyRequest(
          request,
          async () => secretKey
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Request timestamp too old');
      });

      it('should reject request with missing headers', async () => {
        const request = new Request('https://api.example.com/test');

        const result = await signer.verifyRequest(
          request,
          async () => secretKey
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('Missing signature header');
      });

      it('should handle API key verification', async () => {
        const apiKey = 'test-api-key';
        const request = new Request('https://api.example.com/test', {
          headers: {
            'X-API-Key': apiKey,
            'X-Signature': 'signature',
            'X-Timestamp': Date.now().toString()
          }
        });

        const getSecretKey = jest.fn().mockResolvedValue(secretKey);
        
        await signer.verifyRequest(request, getSecretKey);

        expect(getSecretKey).toHaveBeenCalledWith(apiKey);
      });
    });

    describe('middleware', () => {
      it('should pass through valid requests', async () => {
        const request = new Request('https://api.example.com/test', {
          method: 'POST'
        });
        const signedRequest = await signer.signRequest(request, secretKey);

        const middleware = signer.middleware({
          getSecretKey: async () => secretKey
        });

        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));

        const response = await middleware(signedRequest, ctx, next);

        expect(next).toHaveBeenCalled();
        expect(response.status).toBe(200);
      });

      it('should reject invalid requests', async () => {
        const request = new Request('https://api.example.com/test', {
          method: 'POST'
        });

        const middleware = signer.middleware({
          getSecretKey: async () => secretKey
        });

        const ctx = {} as any;
        const next = jest.fn();

        const response = await middleware(request, ctx, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toBe(401);
      });

      it('should skip configured paths', async () => {
        const request = new Request('https://api.example.com/public/test', {
          method: 'POST'
        });

        const middleware = signer.middleware({
          getSecretKey: async () => secretKey,
          skipPaths: ['/public']
        });

        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));

        const response = await middleware(request, ctx, next);

        expect(next).toHaveBeenCalled();
        expect(response.status).toBe(200);
      });
    });

    describe('webhook signatures', () => {
      it('should generate and verify webhook signatures', async () => {
        const payload = JSON.stringify({ event: 'test', data: { id: 123 } });
        
        const signature = await signer.generateWebhookSignature(payload, secretKey);
        
        expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
        
        const isValid = await signer.verifyWebhookSignature(
          payload,
          signature,
          secretKey
        );
        
        expect(isValid).toBe(true);
      });

      it('should reject invalid webhook signatures', async () => {
        const payload = JSON.stringify({ event: 'test' });
        
        const isValid = await signer.verifyWebhookSignature(
          payload,
          't=123,v1=invalid',
          secretKey
        );
        
        expect(isValid).toBe(false);
      });
    });

    describe('API key management', () => {
      it('should generate secure API keys', () => {
        const key1 = RequestSigner.generateApiKey();
        const key2 = RequestSigner.generateApiKey();

        expect(key1).toHaveLength(43); // Base64 encoded 32 bytes
        expect(key1).not.toBe(key2);
        expect(key1).toMatch(/^[A-Za-z0-9_-]+$/);
      });

      it('should hash API keys consistently', async () => {
        const apiKey = 'test-api-key';
        
        const hash1 = await RequestSigner.hashApiKey(apiKey);
        const hash2 = await RequestSigner.hashApiKey(apiKey);

        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex
      });
    });
  });

  describe('Signed Token Helpers', () => {
    const secretKey = 'test-secret';

    it('should create and verify signed tokens', async () => {
      const token = await createSignedToken(
        'transfer',
        { amount: 100, to: 'user123' },
        secretKey,
        3600
      );

      expect(token).toContain('.');

      const result = await verifySignedToken(token, secretKey);

      expect(result.valid).toBe(true);
      expect(result.payload?.op).toBe('transfer');
      expect(result.payload?.data).toEqual({ amount: 100, to: 'user123' });
    });

    it('should reject expired tokens', async () => {
      const token = await createSignedToken(
        'test',
        {},
        secretKey,
        -1 // Already expired
      );

      const result = await verifySignedToken(token, secretKey);

      expect(result.valid).toBe(false);
    });

    it('should reject tampered tokens', async () => {
      const token = await createSignedToken('test', {}, secretKey);
      
      // Tamper with the token
      const parts = token.split('.');
      parts[0] = btoa(JSON.stringify({ op: 'malicious', data: {} }));
      const tamperedToken = parts.join('.');

      const result = await verifySignedToken(tamperedToken, secretKey);

      expect(result.valid).toBe(false);
    });
  });
});