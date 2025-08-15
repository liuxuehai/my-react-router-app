import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createKeyManager } from '../../app/api/auth/key-manager.js';
import { signatureAuth } from '../../app/api/middleware/signature-auth.js';
import type { AppConfig, KeyPair } from '../../app/api/auth/types.js';

describe('Multi-Channel Workflow Integration', () => {
  let app: Hono;
  let keyManager: ReturnType<typeof createKeyManager>;

  // Sample key pairs for different channels
  const partnerAKeys: KeyPair[] = [
    {
      keyId: 'primary',
      publicKey: '-----BEGIN PUBLIC KEY-----\nPARTNERA_PRIMARY...\n-----END PUBLIC KEY-----',
      algorithm: 'RS256',
      createdAt: new Date('2024-01-01'),
      enabled: true
    },
    {
      keyId: 'backup',
      publicKey: '-----BEGIN PUBLIC KEY-----\nPARTNERA_BACKUP...\n-----END PUBLIC KEY-----',
      algorithm: 'RS512',
      createdAt: new Date('2024-01-02'),
      enabled: true,
      expiresAt: new Date('2025-12-31')
    }
  ];

  const partnerBKeys: KeyPair[] = [
    {
      keyId: 'main',
      publicKey: '-----BEGIN PUBLIC KEY-----\nPARTNERB_MAIN...\n-----END PUBLIC KEY-----',
      algorithm: 'ES256',
      createdAt: new Date('2024-01-01'),
      enabled: true
    }
  ];

  const internalAppKeys: KeyPair[] = [
    {
      keyId: 'service',
      publicKey: '-----BEGIN PUBLIC KEY-----\nINTERNAL_SERVICE...\n-----END PUBLIC KEY-----',
      algorithm: 'RS256',
      createdAt: new Date('2024-01-01'),
      enabled: true
    }
  ];

  // Channel configurations
  const partnerAConfig: AppConfig = {
    appId: 'partner-a',
    name: 'Partner A Integration',
    keyPairs: partnerAKeys,
    enabled: true,
    permissions: ['read', 'write', 'partner-api'],
    createdAt: new Date('2024-01-01'),
    description: 'External partner with full API access',
    tags: ['partner', 'external', 'production'],
    accessControl: {
      allowedPaths: ['/api/v1/partner/*', '/api/v1/public/*'],
      deniedPaths: ['/api/v1/internal/*', '/api/v1/admin/*'],
      allowedIPs: ['203.0.113.10', '203.0.113.11'], // Partner A IPs
      rateLimit: {
        requestsPerMinute: 1000,
        burstLimit: 100
      },
      customTimeWindow: 300 // 5 minutes
    }
  };

  const partnerBConfig: AppConfig = {
    appId: 'partner-b',
    name: 'Partner B Limited Access',
    keyPairs: partnerBKeys,
    enabled: true,
    permissions: ['read'],
    createdAt: new Date('2024-01-01'),
    description: 'External partner with limited read-only access',
    tags: ['partner', 'external', 'limited'],
    accessControl: {
      allowedPaths: ['/api/v1/public/*', '/api/v1/readonly/*'],
      deniedPaths: ['/api/v1/partner/*', '/api/v1/internal/*', '/api/v1/admin/*'],
      allowedIPs: ['198.51.100.20'], // Partner B IP
      rateLimit: {
        requestsPerMinute: 100,
        burstLimit: 20
      },
      customTimeWindow: 180 // 3 minutes
    }
  };

  const internalAppConfig: AppConfig = {
    appId: 'internal-service',
    name: 'Internal Microservice',
    keyPairs: internalAppKeys,
    enabled: true,
    permissions: ['read', 'write', 'admin', 'internal'],
    createdAt: new Date('2024-01-01'),
    description: 'Internal service with full access',
    tags: ['internal', 'microservice'],
    accessControl: {
      allowedPaths: ['/api/v1/**'], // Full access
      allowedIPs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], // Internal networks
      rateLimit: {
        requestsPerMinute: 5000,
        burstLimit: 500
      },
      customTimeWindow: 60 // 1 minute
    }
  };

  beforeEach(async () => {
    app = new Hono();
    keyManager = createKeyManager({
      storageType: 'memory',
      cacheExpiry: 300,
      enableCache: true,
      debug: false
    });

    // Setup channel configurations
    await keyManager.addApp(partnerAConfig);
    await keyManager.addApp(partnerBConfig);
    await keyManager.addApp(internalAppConfig);

    // Setup middleware
    app.use('*', signatureAuth({
      keyManager,
      timeWindowSeconds: 300,
      debug: false
    }));

    // Setup API routes
    app.get('/api/v1/public/health', (c) => c.json({ status: 'healthy' }));
    app.get('/api/v1/readonly/data', (c) => c.json({ data: 'public-data' }));
    app.get('/api/v1/partner/orders', (c) => c.json({ orders: [] }));
    app.post('/api/v1/partner/orders', (c) => c.json({ created: true }));
    app.get('/api/v1/internal/metrics', (c) => c.json({ metrics: {} }));
    app.get('/api/v1/admin/users', (c) => c.json({ users: [] }));
  });

  describe('Partner A - Full Access Channel', () => {
    const createPartnerARequest = (path: string, method: string = 'GET', keyId: string = 'primary') => ({
      method,
      headers: {
        'X-Signature': 'partner-a-signature',
        'X-Timestamp': new Date().toISOString(),
        'X-App-Id': 'partner-a',
        'X-Key-Id': keyId,
        'CF-Connecting-IP': '203.0.113.10'
      }
    });

    it('should access public endpoints', async () => {
      const response = await app.request('/api/v1/public/health', createPartnerARequest('/api/v1/public/health'));
      expect(response.status).toBe(200);
    });

    it('should access partner-specific endpoints', async () => {
      const getResponse = await app.request('/api/v1/partner/orders', createPartnerARequest('/api/v1/partner/orders'));
      expect(getResponse.status).toBe(200);

      const postResponse = await app.request('/api/v1/partner/orders', createPartnerARequest('/api/v1/partner/orders', 'POST'));
      expect(postResponse.status).toBe(200);
    });

    it('should be denied access to internal endpoints', async () => {
      const response = await app.request('/api/v1/internal/metrics', createPartnerARequest('/api/v1/internal/metrics'));
      expect(response.status).toBe(403);
    });

    it('should be denied access to admin endpoints', async () => {
      const response = await app.request('/api/v1/admin/users', createPartnerARequest('/api/v1/admin/users'));
      expect(response.status).toBe(403);
    });

    it('should work with backup key', async () => {
      const response = await app.request('/api/v1/partner/orders', createPartnerARequest('/api/v1/partner/orders', 'GET', 'backup'));
      expect(response.status).toBe(200);
    });

    it('should be denied from non-whitelisted IP', async () => {
      const response = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-a-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-a',
          'X-Key-Id': 'primary',
          'CF-Connecting-IP': '192.168.1.1' // Not in whitelist
        }
      });
      expect(response.status).toBe(403);
    });
  });

  describe('Partner B - Limited Access Channel', () => {
    const createPartnerBRequest = (path: string, method: string = 'GET') => ({
      method,
      headers: {
        'X-Signature': 'partner-b-signature',
        'X-Timestamp': new Date().toISOString(),
        'X-App-Id': 'partner-b',
        'X-Key-Id': 'main',
        'CF-Connecting-IP': '198.51.100.20'
      }
    });

    it('should access public endpoints', async () => {
      const response = await app.request('/api/v1/public/health', createPartnerBRequest('/api/v1/public/health'));
      expect(response.status).toBe(200);
    });

    it('should access readonly endpoints', async () => {
      const response = await app.request('/api/v1/readonly/data', createPartnerBRequest('/api/v1/readonly/data'));
      expect(response.status).toBe(200);
    });

    it('should be denied access to partner endpoints', async () => {
      const response = await app.request('/api/v1/partner/orders', createPartnerBRequest('/api/v1/partner/orders'));
      expect(response.status).toBe(403);
    });

    it('should be denied access to internal endpoints', async () => {
      const response = await app.request('/api/v1/internal/metrics', createPartnerBRequest('/api/v1/internal/metrics'));
      expect(response.status).toBe(403);
    });

    it('should be denied access to admin endpoints', async () => {
      const response = await app.request('/api/v1/admin/users', createPartnerBRequest('/api/v1/admin/users'));
      expect(response.status).toBe(403);
    });
  });

  describe('Internal Service - Full Access Channel', () => {
    const createInternalRequest = (path: string, method: string = 'GET') => ({
      method,
      headers: {
        'X-Signature': 'internal-signature',
        'X-Timestamp': new Date().toISOString(),
        'X-App-Id': 'internal-service',
        'X-Key-Id': 'service',
        'CF-Connecting-IP': '10.0.1.100'
      }
    });

    it('should access all endpoints', async () => {
      const endpoints = [
        '/api/v1/public/health',
        '/api/v1/readonly/data',
        '/api/v1/partner/orders',
        '/api/v1/internal/metrics',
        '/api/v1/admin/users'
      ];

      for (const endpoint of endpoints) {
        const response = await app.request(endpoint, createInternalRequest(endpoint));
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Channel Management Operations', () => {
    it('should disable and re-enable channels', async () => {
      // Disable Partner B
      await keyManager.setAppEnabled('partner-b', false);

      const response1 = await app.request('/api/v1/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-b-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-b',
          'X-Key-Id': 'main',
          'CF-Connecting-IP': '198.51.100.20'
        }
      });
      expect(response1.status).toBe(403);

      // Re-enable Partner B
      await keyManager.setAppEnabled('partner-b', true);

      const response2 = await app.request('/api/v1/public/health', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-b-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-b',
          'X-Key-Id': 'main',
          'CF-Connecting-IP': '198.51.100.20'
        }
      });
      expect(response2.status).toBe(200);
    });

    it('should add new key to existing channel', async () => {
      const newKey: KeyPair = {
        keyId: 'emergency',
        publicKey: '-----BEGIN PUBLIC KEY-----\nEMERGENCY_KEY...\n-----END PUBLIC KEY-----',
        algorithm: 'ES512',
        createdAt: new Date(),
        enabled: true
      };

      await keyManager.addKeyPair('partner-a', newKey);

      const response = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-a-emergency-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-a',
          'X-Key-Id': 'emergency',
          'CF-Connecting-IP': '203.0.113.10'
        }
      });
      expect(response.status).toBe(200);
    });

    it('should disable specific keys', async () => {
      // Disable Partner A's backup key
      await keyManager.setKeyPairEnabled('partner-a', 'backup', false);

      const response = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-a-backup-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-a',
          'X-Key-Id': 'backup',
          'CF-Connecting-IP': '203.0.113.10'
        }
      });
      expect(response.status).toBe(403);

      // Primary key should still work
      const response2 = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-a-primary-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-a',
          'X-Key-Id': 'primary',
          'CF-Connecting-IP': '203.0.113.10'
        }
      });
      expect(response2.status).toBe(200);
    });

    it('should update access control dynamically', async () => {
      // Initially Partner B cannot access partner endpoints
      const response1 = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-b-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-b',
          'X-Key-Id': 'main',
          'CF-Connecting-IP': '198.51.100.20'
        }
      });
      expect(response1.status).toBe(403);

      // Update Partner B's access control to allow partner endpoints
      await keyManager.updateApp('partner-b', {
        accessControl: {
          ...partnerBConfig.accessControl!,
          allowedPaths: ['/api/v1/public/*', '/api/v1/readonly/*', '/api/v1/partner/*']
        }
      });

      // Now Partner B should be able to access partner endpoints
      const response2 = await app.request('/api/v1/partner/orders', {
        method: 'GET',
        headers: {
          'X-Signature': 'partner-b-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'partner-b',
          'X-Key-Id': 'main',
          'CF-Connecting-IP': '198.51.100.20'
        }
      });
      expect(response2.status).toBe(200);
    });
  });

  describe('Multi-Channel Statistics', () => {
    it('should provide channel overview', async () => {
      const apps = await keyManager.listApps();
      expect(apps).toContain('partner-a');
      expect(apps).toContain('partner-b');
      expect(apps).toContain('internal-service');

      const configs = await keyManager.getMultipleAppConfigs(apps);
      expect(configs.size).toBe(3);

      // Verify each channel has correct configuration
      const partnerA = configs.get('partner-a');
      expect(partnerA?.keyPairs).toHaveLength(2);
      expect(partnerA?.accessControl?.allowedPaths).toContain('/api/v1/partner/*');

      const partnerB = configs.get('partner-b');
      expect(partnerB?.keyPairs).toHaveLength(1);
      expect(partnerB?.accessControl?.rateLimit?.requestsPerMinute).toBe(100);

      const internal = configs.get('internal-service');
      expect(internal?.keyPairs).toHaveLength(1);
      expect(internal?.permissions).toContain('admin');
    });

    it('should show valid keys per channel', async () => {
      const partnerAKeys = await keyManager.getValidKeyPairs('partner-a');
      expect(partnerAKeys).toHaveLength(2);
      expect(partnerAKeys.map(k => k.keyId)).toEqual(['primary', 'backup']);

      const partnerBKeys = await keyManager.getValidKeyPairs('partner-b');
      expect(partnerBKeys).toHaveLength(1);
      expect(partnerBKeys[0].keyId).toBe('main');

      const internalKeys = await keyManager.getValidKeyPairs('internal-service');
      expect(internalKeys).toHaveLength(1);
      expect(internalKeys[0].keyId).toBe('service');
    });
  });
});