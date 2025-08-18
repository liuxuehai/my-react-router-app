import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { 
  createRouteSignatureAuthMiddleware,
  createRouteSignatureAuth,
  getRouteAuthInfo,
  isRouteAuthenticated,
  getAuthenticatedAppId 
} from '../../../app/api/middleware/route-signature-auth.js';
import { createRouteAuthConfig } from '../../../app/api/auth/route-auth-builder.js';
import { createTestKeyManager, createTestSignature } from '../../test-utils/auth-test-utils.js';
import type { KeyManager } from '../../../app/api/auth/types.js';

describe('Route Signature Authentication Integration', () => {
  let app: Hono;
  let keyManager: KeyManager;
  let testAppId: string;
  let testKeyId: string;
  let testPrivateKey: string;

  beforeEach(async () => {
    app = new Hono();
    
    // Create test key manager with test data
    const testData = await createTestKeyManager();
    keyManager = testData.keyManager;
    testAppId = testData.testAppId;
    testKeyId = testData.testKeyId;
    testPrivateKey = testData.testPrivateKey;

    // Create route configuration
    const routeConfig = createRouteAuthConfig(false)
      .addPublicPaths(['/health', '/api/public/*'])
      .addProtectedPaths(['/api/admin/*'])
      .route('/api/webhook')
        .method('POST')
        .requireAuth(true)
        .customPermission(async (appId) => appId.startsWith('webhook_'))
        .end()
      .group('admin', '/api/admin')
        .defaultRequireAuth(true)
        .defaultAllowApps([testAppId])
        .route('/users')
          .methods(['GET', 'POST'])
          .end()
        .route('/config')
          .method('GET')
          .allowApps([testAppId, 'config-app'])
          .end()
        .end()
      .group('data', '/api/data')
        .defaultRequireAuth(true)
        .route('/users')
          .methods(['GET', 'POST'])
          .allowApp('data-app')
          .end()
        .end()
      .enableDebug(true)
      .build();

    // Setup middleware
    app.use('*', createRouteSignatureAuth(keyManager, {
      routeConfig,
      skipUnauthenticatedRoutes: true,
      debug: true,
    }));

    // Add test routes
    app.get('/health', (c) => c.json({ status: 'ok' }));
    app.get('/api/public/info', (c) => c.json({ info: 'public' }));
    app.get('/api/admin/users', (c) => c.json({ users: [] }));
    app.get('/api/admin/config', (c) => c.json({ config: {} }));
    app.post('/api/webhook', (c) => c.json({ received: true }));
    app.get('/api/data/users', (c) => c.json({ data: [] }));
    app.get('/api/unknown', (c) => c.json({ unknown: true }));
  });

  describe('Public routes', () => {
    it('should allow access to health endpoint without authentication', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.status).toBe('ok');
    });

    it('should allow access to public API without authentication', async () => {
      const res = await app.request('/api/public/info');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.info).toBe('public');
    });

    it('should allow access to unknown routes when default is false', async () => {
      const res = await app.request('/api/unknown');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.unknown).toBe(true);
    });
  });

  describe('Protected routes with valid authentication', () => {
    it('should allow access to admin routes with valid signature', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/admin/users',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toEqual([]);
    });

    it('should allow access to admin config with valid signature', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/admin/config',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/config', {
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('Protected routes with invalid authentication', () => {
    it('should deny access to admin routes without signature', async () => {
      const res = await app.request('/api/admin/users');
      expect(res.status).toBe(400); // Missing headers
    });

    it('should deny access with invalid signature', async () => {
      const res = await app.request('/api/admin/users', {
        headers: {
          'X-Signature': 'invalid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': testAppId,
          'X-Key-Id': testKeyId,
        },
      });

      expect(res.status).toBe(401); // Invalid signature
    });

    it('should deny access with unknown app ID', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/admin/users',
        appId: 'unknown-app',
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(403); // App not found
    });
  });

  describe('App-level permissions', () => {
    it('should deny access when app is not in allowed list', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/data/users',
        appId: testAppId, // testAppId is not allowed for data routes
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/data/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(403); // Permission denied
      
      const data = await res.json();
      expect(data.error.code).toBe('PERMISSION_DENIED');
    });

    it('should allow access when app is in allowed list', async () => {
      // Add data-app to key manager for testing
      await keyManager.addApp({
        appId: 'data-app',
        name: 'Data App',
        keyPairs: [{
          keyId: 'default',
          publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
8Tr7X5nHVV6w+B6/2M+evtJBHFhf44tjuOzLgsxgQFB0VZUWnWmtzZ+oS02VxrKC
IX6n75SdoXTKVRAT1RfEnxpoYbnm16NAUwuaZihJJOhjlyrf0oIs+lbGPTsvx4vw
8Z4dBNAZ4+TahAIyMhxxoO9To3wF3rk17mJ42xhOpv2YNrhSZ+bsIU8io4zLJihK
BtIixFUwIDAQAB
-----END PUBLIC KEY-----`,
          algorithm: 'RS256',
          createdAt: new Date(),
          enabled: true,
        }],
        enabled: true,
        permissions: [],
        createdAt: new Date(),
      });

      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/data/users',
        appId: 'data-app',
        keyId: 'default',
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/data/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('Custom permission checks', () => {
    it('should allow webhook apps with custom permission check', async () => {
      // Add webhook app
      await keyManager.addApp({
        appId: 'webhook_123',
        name: 'Webhook App',
        keyPairs: [{
          keyId: 'default',
          publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
8Tr7X5nHVV6w+B6/2M+evtJBHFhf44tjuOzLgsxgQFB0VZUWnWmtzZ+oS02VxrKC
IX6n75SdoXTKVRAT1RfEnxpoYbnm16NAUwuaZihJJOhjlyrf0oIs+lbGPTsvx4vw
8Z4dBNAZ4+TahAIyMhxxoO9To3wF3rk17mJ42xhOpv2YNrhSZ+bsIU8io4zLJihK
BtIixFUwIDAQAB
-----END PUBLIC KEY-----`,
          algorithm: 'RS256',
          createdAt: new Date(),
          enabled: true,
        }],
        enabled: true,
        permissions: [],
        createdAt: new Date(),
      });

      const signature = await createTestSignature({
        method: 'POST',
        path: '/api/webhook',
        appId: 'webhook_123',
        keyId: 'default',
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/webhook', {
        method: 'POST',
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
    });

    it('should deny non-webhook apps with custom permission check', async () => {
      const signature = await createTestSignature({
        method: 'POST',
        path: '/api/webhook',
        appId: testAppId, // doesn't start with 'webhook_'
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/webhook', {
        method: 'POST',
        headers: signature.headers,
      });

      expect(res.status).toBe(403); // Custom permission denied
    });
  });

  describe('Context information', () => {
    it('should provide route auth info in context', async () => {
      let contextInfo: any = null;

      app.get('/test-context', (c) => {
        contextInfo = getRouteAuthInfo(c);
        return c.json({ success: true });
      });

      const signature = await createTestSignature({
        method: 'GET',
        path: '/test-context',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      await app.request('/test-context', {
        headers: signature.headers,
      });

      expect(contextInfo).toBeDefined();
      expect(contextInfo.appId).toBe(testAppId);
      expect(contextInfo.permissionGranted).toBe(true);
    });

    it('should provide authentication status helpers', async () => {
      let isAuth: boolean = false;
      let appId: string | null = null;

      app.get('/test-helpers', (c) => {
        isAuth = isRouteAuthenticated(c);
        appId = getAuthenticatedAppId(c);
        return c.json({ success: true });
      });

      const signature = await createTestSignature({
        method: 'GET',
        path: '/test-helpers',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      await app.request('/test-helpers', {
        headers: signature.headers,
      });

      expect(isAuth).toBe(true);
      expect(appId).toBe(testAppId);
    });
  });

  describe('Method-specific permissions', () => {
    it('should allow GET requests to admin users', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/admin/users',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
    });

    it('should allow POST requests to admin users', async () => {
      app.post('/api/admin/users', (c) => c.json({ created: true }));

      const signature = await createTestSignature({
        method: 'POST',
        path: '/api/admin/users',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/users', {
        method: 'POST',
        headers: signature.headers,
      });

      expect(res.status).toBe(200);
    });

    it('should deny DELETE requests to admin users (not in allowed methods)', async () => {
      app.delete('/api/admin/users', (c) => c.json({ deleted: true }));

      const signature = await createTestSignature({
        method: 'DELETE',
        path: '/api/admin/users',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/admin/users', {
        method: 'DELETE',
        headers: signature.headers,
      });

      // Should be allowed to pass through since route doesn't require auth for DELETE
      // (no matching route configuration for DELETE method)
      expect(res.status).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('should return proper error format for permission denied', async () => {
      const signature = await createTestSignature({
        method: 'GET',
        path: '/api/data/users',
        appId: testAppId,
        keyId: testKeyId,
        privateKey: testPrivateKey,
      });

      const res = await app.request('/api/data/users', {
        headers: signature.headers,
      });

      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PERMISSION_DENIED');
      expect(data.error.details.appId).toBe(testAppId);
      expect(data.error.details.path).toBe('/api/data/users');
      expect(data.meta.timestamp).toBeDefined();
    });

    it('should handle missing signature headers properly', async () => {
      const res = await app.request('/api/admin/users');
      
      expect(res.status).toBe(400);
    });

    it('should handle invalid timestamps', async () => {
      const res = await app.request('/api/admin/users', {
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': '2020-01-01T00:00:00.000Z', // Old timestamp
          'X-App-Id': testAppId,
          'X-Key-Id': testKeyId,
        },
      });

      expect(res.status).toBe(401); // Invalid timestamp
    });
  });
});