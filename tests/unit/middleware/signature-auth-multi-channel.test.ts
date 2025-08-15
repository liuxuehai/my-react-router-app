import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { signatureAuth, SignatureAuthError } from '../../../app/api/middleware/signature-auth.js';
import { MemoryStorageProvider } from '../../../app/api/auth/storage/memory-storage.js';
import { KeyManagerImpl } from '../../../app/api/auth/key-manager.js';
import { SignatureUtils } from '../../../app/api/auth/signature-utils.js';
import type { AppConfig, KeyPair, AccessControlConfig } from '../../../app/api/auth/types.js';

describe('SignatureAuth Multi-Channel Support', () => {
  let app: Hono;
  let storage: MemoryStorageProvider;
  let keyManager: KeyManagerImpl;

  const sampleKeyPair1: KeyPair = {
    keyId: 'default',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    algorithm: 'RS256',
    createdAt: new Date('2024-01-01'),
    enabled: true
  };

  const sampleKeyPair2: KeyPair = {
    keyId: 'backup',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    algorithm: 'RS512',
    createdAt: new Date('2024-01-02'),
    enabled: true,
    expiresAt: new Date('2025-12-31')
  };

  const restrictedAccessControl: AccessControlConfig = {
    allowedPaths: ['/api/public/*', '/api/users/*'],
    deniedPaths: ['/api/admin/*'],
    allowedIPs: ['192.168.1.100', '10.0.0.50'],
    rateLimit: {
      requestsPerMinute: 60,
      burstLimit: 10
    },
    customTimeWindow: 120 // 2 minutes
  };

  const testApp1: AppConfig = {
    appId: 'test-app-1',
    name: 'Test Application 1',
    keyPairs: [sampleKeyPair1, sampleKeyPair2],
    enabled: true,
    permissions: ['read', 'write'],
    createdAt: new Date('2024-01-01'),
    description: 'Test app with multiple keys',
    accessControl: {
      ...restrictedAccessControl,
      allowedPaths: ['/api/public/*', '/api/users/*', '/api/test/*'] // Add /api/test/* for basic tests
    }
  };

  const testApp2: AppConfig = {
    appId: 'test-app-2',
    name: 'Test Application 2',
    keyPairs: [
      {
        keyId: 'main',
        publicKey: '-----BEGIN PUBLIC KEY-----\nAPP2KEY...\n-----END PUBLIC KEY-----',
        algorithm: 'ES256',
        createdAt: new Date('2024-01-01'),
        enabled: true
      }
    ],
    enabled: true,
    permissions: ['read'],
    createdAt: new Date('2024-01-01'),
    description: 'Test app without access control'
  };

  const disabledApp: AppConfig = {
    appId: 'disabled-app',
    name: 'Disabled Application',
    keyPairs: [sampleKeyPair1],
    enabled: false,
    permissions: [],
    createdAt: new Date('2024-01-01')
  };

  beforeEach(async () => {
    app = new Hono();
    storage = new MemoryStorageProvider();
    keyManager = new KeyManagerImpl({
      storageType: 'memory',
      cacheExpiry: 300,
      enableCache: true,
      debug: false
    });
    
    // @ts-ignore - accessing private property for testing
    keyManager.storage = storage;

    // Setup test data
    await storage.saveAppConfig(testApp1);
    await storage.saveAppConfig(testApp2);
    await storage.saveAppConfig(disabledApp);

    // Mock signature verification
    vi.spyOn(SignatureUtils, 'verifySignature').mockResolvedValue(true);
    vi.spyOn(SignatureUtils, 'validateTimestamp').mockReturnValue(true);
  });

  describe('Multi-App Authentication', () => {
    it('should authenticate different apps with their respective keys', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test/endpoint', (c) => c.json({ success: true }));

      // Test app 1 with default key
      const response1 = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature-1',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Key-Id': 'default'
        }
      });

      expect(response1.status).toBe(200);

      // Test app 1 with backup key
      const response2 = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature-2',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Key-Id': 'backup'
        }
      });

      expect(response2.status).toBe(200);

      // Test app 2 with main key
      const response3 = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature-3',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-2',
          'X-Key-Id': 'main'
        }
      });

      expect(response3.status).toBe(200);
    });

    it('should reject disabled apps', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      const response = await app.request('/api/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'disabled-app',
          'X-Key-Id': 'default'
        }
      });

      expect(response.status).toBe(403);
    });

    it('should reject non-existent apps', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test/endpoint', (c) => c.json({ success: true }));

      const response = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'non-existent-app',
          'X-Key-Id': 'default'
        }
      });

      expect(response.status).toBe(403);
    });

    it('should reject non-existent keys', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test/endpoint', (c) => c.json({ success: true }));

      const response = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Key-Id': 'non-existent-key'
        }
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Access Control', () => {
    beforeEach(() => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/public/health', (c) => c.json({ status: 'ok' }));
      app.get('/api/users/profile', (c) => c.json({ user: 'test' }));
      app.get('/api/admin/settings', (c) => c.json({ settings: {} }));
      app.get('/api/private/data', (c) => c.json({ data: 'secret' }));
    });

    it('should allow access to allowed paths', async () => {
      const response1 = await app.request('/api/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      expect(response1.status).toBe(200);

      const response2 = await app.request('/api/users/profile', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      expect(response2.status).toBe(200);
    });

    it('should deny access to denied paths', async () => {
      const response = await app.request('/api/admin/settings', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      expect(response.status).toBe(403);
    });

    it('should deny access to non-allowed paths', async () => {
      const response = await app.request('/api/private/data', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      expect(response.status).toBe(403);
    });

    it('should deny access from non-whitelisted IPs', async () => {
      const response = await app.request('/api/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'CF-Connecting-IP': '192.168.1.200' // Not in whitelist
        }
      });

      expect(response.status).toBe(403);
    });

    it('should allow access for apps without access control', async () => {
      const response = await app.request('/api/admin/settings', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-2', // No access control configured
          'CF-Connecting-IP': '192.168.1.200'
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Custom Time Windows', () => {
    it('should use custom time window from app config', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300, // Default 5 minutes
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      // Mock timestamp validation to check the time window parameter
      const mockValidateTimestamp = vi.spyOn(SignatureUtils, 'validateTimestamp');
      mockValidateTimestamp.mockReturnValue(true);

      await app.request('/api/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1', // Has custom time window of 120 seconds
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      // Should use custom time window (120) instead of default (300)
      expect(mockValidateTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        120 // Custom time window from app config
      );
    });

    it('should use default time window when app has no custom setting', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test/endpoint', (c) => c.json({ success: true }));

      const mockValidateTimestamp = vi.spyOn(SignatureUtils, 'validateTimestamp');
      mockValidateTimestamp.mockReturnValue(true);

      await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-2', // No custom time window
        }
      });

      // Should use default time window
      expect(mockValidateTimestamp).toHaveBeenCalledWith(
        expect.any(String),
        300 // Default time window
      );
    });
  });

  describe('Key Expiration', () => {
    it('should reject expired keys', async () => {
      // Create an app with an expired key
      const expiredKeyApp: AppConfig = {
        appId: 'expired-key-app',
        name: 'Expired Key App',
        keyPairs: [
          {
            keyId: 'expired',
            publicKey: '-----BEGIN PUBLIC KEY-----\nEXPIRED...\n-----END PUBLIC KEY-----',
            algorithm: 'RS256',
            createdAt: new Date('2024-01-01'),
            enabled: true,
            expiresAt: new Date('2024-06-01') // Expired
          }
        ],
        enabled: true,
        permissions: [],
        createdAt: new Date('2024-01-01')
      };

      await storage.saveAppConfig(expiredKeyApp);

      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      const response = await app.request('/api/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'expired-key-app',
          'X-Key-Id': 'expired'
        }
      });

      expect(response.status).toBe(403);
    });

    it('should accept non-expired keys', async () => {
      // test-app-1 has a backup key that expires in 2025
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      const response = await app.request('/api/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Key-Id': 'backup',
          'CF-Connecting-IP': '192.168.1.100'
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Client IP Detection', () => {
    it('should detect IP from various headers', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      const headers = [
        'CF-Connecting-IP',
        'X-Forwarded-For',
        'X-Real-IP',
        'X-Client-IP'
      ];

      for (const header of headers) {
        const response = await app.request('/api/public/health', {
          method: 'GET',
          headers: {
            'X-Signature': 'test-signature',
            'X-Timestamp': new Date().toISOString(),
            'X-App-Id': 'test-app-1',
            [header]: '192.168.1.100'
          }
        });

        expect(response.status).toBe(200);
      }
    });

    it('should handle X-Forwarded-For with multiple IPs', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false
      }));

      app.get('/api/test', (c) => c.json({ success: true }));

      const response = await app.request('/api/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Forwarded-For': '192.168.1.100, 10.0.0.1, 172.16.0.1' // Should use first IP
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Error Details', () => {
    it('should provide detailed error information for debugging', async () => {
      app.use('*', signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: true,
        onError: async (error, c) => {
          return c.json({
            error: error.message,
            code: error.code,
            details: error.details
          }, error.statusCode);
        }
      }));

      app.get('/api/test/endpoint', (c) => c.json({ success: true }));

      const response = await app.request('/api/test/endpoint', {
        method: 'GET',
        headers: {
          'X-Signature': 'test-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'test-app-1',
          'X-Key-Id': 'non-existent-key'
        }
      });

      expect(response.status).toBe(403);
      
      const body = await response.json();
      expect(body.code).toBe('KEY_NOT_FOUND');
      expect(body.details).toHaveProperty('appId', 'test-app-1');
      expect(body.details).toHaveProperty('keyId', 'non-existent-key');
      expect(body.details).toHaveProperty('availableKeys');
      expect(body.details.availableKeys).toEqual(['default', 'backup']);
    });
  });
});