import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { signatureAuth, SignatureAuthError, createSignatureAuth } from '../../../../app/api/middleware/signature-auth.js';
import type { KeyManager, AppConfig, KeyPair } from '../../../../app/api/auth/types.js';
import { SignatureUtils } from '../../../../app/api/auth/signature-utils.js';

// Mock KeyManager
const createMockKeyManager = (): KeyManager => ({
  getAppConfig: vi.fn(),
  getPublicKey: vi.fn(),
  validateApp: vi.fn(),
  addApp: vi.fn(),
  updateApp: vi.fn(),
  generateKeyPair: vi.fn(),
  clearCache: vi.fn(),
  getCacheStats: vi.fn()
});

// Test data
const testKeyPair: KeyPair = {
  keyId: 'default',
  publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4f5wg5l2hKsTeNem/V41
fGnJm6gOdrj8ym3rFkEjWT2btf02uSxUyDpllVOI5g1PrlIVXeLsrEXgjdVz+hdF
jUjxiMiI6YAaNC2ws2K0+Ixd3qdnTUuGqiQbXgYQGI2P3e5Pyaf46m8wgcL/aQXx
RBxaxtP1jvQoaq30cINhw4TZuQARYiuWOVW6+iNwXkka0rM9LT9HCjOtuy8wVBZH
tNfp4wjh1A73kG3UUk6lwFBX7dtS5AjXunyAh2/2xAiHRiux3jf6uyPVkQBmA7kx
nVj2DAJjowYaYdl/Ui/o83ffGGAUAuuMbequhX4hhbcOmwDVdPfZh4bXRRQiVdaR
qwIDAQAB
-----END PUBLIC KEY-----`,
  algorithm: 'RS256',
  createdAt: new Date(),
  enabled: true
};

const testAppConfig: AppConfig = {
  appId: 'test-app',
  name: 'Test Application',
  keyPairs: [testKeyPair],
  enabled: true,
  permissions: ['read', 'write'],
  createdAt: new Date()
};

describe('SignatureAuth Middleware', () => {
  let app: Hono;
  let mockKeyManager: KeyManager;

  beforeEach(() => {
    app = new Hono();
    mockKeyManager = createMockKeyManager();
    vi.clearAllMocks();
  });

  describe('signatureAuth', () => {
    it('should pass through when path is in skipPaths', async () => {
      const middleware = signatureAuth({
        keyManager: mockKeyManager,
        skipPaths: ['/health']
      });

      app.use('*', middleware);
      app.get('/health', (c) => c.text('OK'));

      const res = await app.request('/health');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');
    });

    it('should throw error when required headers are missing', async () => {
      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test');
      expect(res.status).toBe(400);
    });

    it('should throw error when app is not found', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(false);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'invalid-app'
        }
      });

      expect(res.status).toBe(403);
      expect(mockKeyManager.validateApp).toHaveBeenCalledWith('invalid-app');
    });

    it('should throw error when app config is not found', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(null);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        }
      });

      expect(res.status).toBe(403);
    });

    it('should throw error when key is not found', async () => {
      const configWithoutKey = {
        ...testAppConfig,
        keyPairs: []
      };

      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(configWithoutKey);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        }
      });

      expect(res.status).toBe(403);
    });

    it('should throw error when timestamp is invalid', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(testAppConfig);

      const middleware = signatureAuth({
        keyManager: mockKeyManager,
        timeWindowSeconds: 300
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      // Use a timestamp from 1 hour ago
      const oldTimestamp = new Date(Date.now() - 3600 * 1000).toISOString();

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': oldTimestamp,
          'X-App-Id': 'test-app'
        }
      });

      expect(res.status).toBe(401);
    });

    it('should throw error when signature is invalid', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(testAppConfig);

      // Mock SignatureUtils.verifySignature to return false
      const originalVerifySignature = SignatureUtils.verifySignature;
      SignatureUtils.verifySignature = vi.fn().mockResolvedValue(false);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'invalid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        }
      });

      expect(res.status).toBe(401);

      // Restore original function
      SignatureUtils.verifySignature = originalVerifySignature;
    });

    it('should pass through when signature is valid', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(testAppConfig);

      // Mock SignatureUtils.verifySignature to return true
      const originalVerifySignature = SignatureUtils.verifySignature;
      SignatureUtils.verifySignature = vi.fn().mockResolvedValue(true);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => {
        const authInfo = c.get('signatureAuth');
        return c.json({ success: true, auth: authInfo });
      });

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'valid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.auth).toEqual({
        appId: 'test-app',
        keyId: 'default',
        algorithm: 'RS256',
        timestamp: expect.any(String),
        verified: true
      });

      // Restore original function
      SignatureUtils.verifySignature = originalVerifySignature;
    });

    it('should use custom keyId when provided', async () => {
      const customKeyPair: KeyPair = {
        ...testKeyPair,
        keyId: 'custom-key'
      };

      const configWithCustomKey = {
        ...testAppConfig,
        keyPairs: [testKeyPair, customKeyPair]
      };

      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(configWithCustomKey);

      // Mock SignatureUtils.verifySignature to return true
      const originalVerifySignature = SignatureUtils.verifySignature;
      SignatureUtils.verifySignature = vi.fn().mockResolvedValue(true);

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => {
        const authInfo = c.get('signatureAuth');
        return c.json({ auth: authInfo });
      });

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'valid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app',
          'X-Key-Id': 'custom-key'
        }
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.auth.keyId).toBe('custom-key');

      // Restore original function
      SignatureUtils.verifySignature = originalVerifySignature;
    });

    it('should handle POST requests with body', async () => {
      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(testAppConfig);

      // Mock SignatureUtils.verifySignature to return true
      const originalVerifySignature = SignatureUtils.verifySignature;
      const mockVerifySignature = vi.fn().mockResolvedValue(true);
      SignatureUtils.verifySignature = mockVerifySignature;

      const middleware = signatureAuth({
        keyManager: mockKeyManager
      });

      app.use('*', middleware);
      app.post('/api/test', (c) => c.text('OK'));

      const requestBody = JSON.stringify({ test: 'data' });
      const res = await app.request('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': 'valid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        },
        body: requestBody
      });

      expect(res.status).toBe(200);
      expect(mockVerifySignature).toHaveBeenCalledWith(
        expect.stringContaining(requestBody),
        'valid-signature',
        testKeyPair.publicKey,
        'RS256'
      );

      // Restore original function
      SignatureUtils.verifySignature = originalVerifySignature;
    });

    it('should use custom error handler when provided', async () => {
      const customErrorHandler = vi.fn().mockReturnValue(
        new Response('Custom Error', { status: 418 })
      );

      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(false);

      const middleware = signatureAuth({
        keyManager: mockKeyManager,
        onError: customErrorHandler
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      const res = await app.request('/api/test', {
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'invalid-app'
        }
      });

      expect(res.status).toBe(418);
      expect(await res.text()).toBe('Custom Error');
      expect(customErrorHandler).toHaveBeenCalledWith(
        expect.any(SignatureAuthError),
        expect.any(Object)
      );
    });

    it('should enable debug logging when debug option is true', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      vi.mocked(mockKeyManager.validateApp).mockResolvedValue(true);
      vi.mocked(mockKeyManager.getAppConfig).mockResolvedValue(testAppConfig);

      // Mock SignatureUtils.verifySignature to return true
      const originalVerifySignature = SignatureUtils.verifySignature;
      SignatureUtils.verifySignature = vi.fn().mockResolvedValue(true);

      const middleware = signatureAuth({
        keyManager: mockKeyManager,
        debug: true
      });

      app.use('*', middleware);
      app.get('/api/test', (c) => c.text('OK'));

      await app.request('/api/test', {
        headers: {
          'X-Signature': 'valid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app'
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SignatureAuth] Verifying signature for app: test-app')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SignatureAuth] Signature verified successfully for app: test-app')
      );

      consoleSpy.mockRestore();
      SignatureUtils.verifySignature = originalVerifySignature;
    });
  });

  describe('createSignatureAuth', () => {
    it('should create middleware with keyManager and options', () => {
      const middleware = createSignatureAuth(mockKeyManager, {
        timeWindowSeconds: 600,
        debug: true
      });

      expect(typeof middleware).toBe('function');
    });
  });

  describe('SignatureAuthError', () => {
    it('should create error with correct properties', () => {
      const error = new SignatureAuthError(
        'Test error',
        'SIGNATURE_INVALID',
        401,
        { test: 'data' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('SIGNATURE_INVALID');
      expect(error.statusCode).toBe(401);
      expect(error.details).toEqual({ test: 'data' });
      expect(error.name).toBe('SignatureAuthError');
    });

    it('should use default status code when not provided', () => {
      const error = new SignatureAuthError('Test error', 'SIGNATURE_INVALID');
      expect(error.statusCode).toBe(401);
    });
  });
});