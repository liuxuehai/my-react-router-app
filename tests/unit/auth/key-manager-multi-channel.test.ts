import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManagerImpl, createKeyManager } from '../../../app/api/auth/key-manager.js';
import { MemoryStorageProvider } from '../../../app/api/auth/storage/memory-storage.js';
import { EnvStorageProvider } from '../../../app/api/auth/storage/env-storage.js';
import { KeyManagerError, type AppConfig, type KeyPair, type AccessControlConfig } from '../../../app/api/auth/types.js';

describe('KeyManager Multi-Channel Support', () => {
  let keyManager: KeyManagerImpl;
  let storage: MemoryStorageProvider;

  const sampleKeyPair1: KeyPair = {
    keyId: 'key1',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    algorithm: 'RS256',
    createdAt: new Date('2024-01-01'),
    enabled: true
  };

  const sampleKeyPair2: KeyPair = {
    keyId: 'key2',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    algorithm: 'RS512',
    createdAt: new Date('2024-01-02'),
    enabled: true,
    expiresAt: new Date('2025-01-01')
  };

  const sampleAppConfig: AppConfig = {
    appId: 'test-app',
    name: 'Test Application',
    keyPairs: [sampleKeyPair1, sampleKeyPair2],
    enabled: true,
    permissions: ['read', 'write'],
    createdAt: new Date('2024-01-01'),
    description: 'Test application for multi-channel support',
    tags: ['test', 'development'],
    accessControl: {
      allowedPaths: ['/api/test/*', '/api/public/*'],
      deniedPaths: ['/api/admin/*'],
      allowedIPs: ['192.168.1.1', '10.0.0.1'],
      rateLimit: {
        requestsPerMinute: 100,
        burstLimit: 20
      },
      customTimeWindow: 600
    }
  };

  beforeEach(() => {
    storage = new MemoryStorageProvider();
    keyManager = new KeyManagerImpl({
      storageType: 'memory',
      cacheExpiry: 300,
      enableCache: true,
      debug: false
    });
    // @ts-ignore - accessing private property for testing
    keyManager.storage = storage;
  });

  describe('Multi-App Management', () => {
    it('should list all applications', async () => {
      await storage.saveAppConfig(sampleAppConfig);
      await storage.saveAppConfig({
        ...sampleAppConfig,
        appId: 'test-app-2',
        name: 'Test Application 2'
      });

      const appIds = await keyManager.listApps();
      expect(appIds).toContain('test-app');
      expect(appIds).toContain('test-app-2');
      expect(appIds).toHaveLength(2);
    });

    it('should get multiple app configurations', async () => {
      const app1 = { ...sampleAppConfig, appId: 'app1' };
      const app2 = { ...sampleAppConfig, appId: 'app2' };
      
      await storage.saveAppConfig(app1);
      await storage.saveAppConfig(app2);

      const configs = await keyManager.getMultipleAppConfigs(['app1', 'app2', 'nonexistent']);
      
      expect(configs.size).toBe(2);
      expect(configs.get('app1')?.appId).toBe('app1');
      expect(configs.get('app2')?.appId).toBe('app2');
      expect(configs.has('nonexistent')).toBe(false);
    });

    it('should enable/disable applications', async () => {
      await storage.saveAppConfig(sampleAppConfig);

      await keyManager.setAppEnabled('test-app', false);
      
      const config = await keyManager.getAppConfig('test-app');
      expect(config?.enabled).toBe(false);
      expect(config?.updatedAt).toBeDefined();

      await keyManager.setAppEnabled('test-app', true);
      
      const updatedConfig = await keyManager.getAppConfig('test-app');
      expect(updatedConfig?.enabled).toBe(true);
    });

    it('should throw error when enabling non-existent app', async () => {
      await expect(keyManager.setAppEnabled('nonexistent', true))
        .rejects.toThrow(KeyManagerError);
    });
  });

  describe('Multi-Key Management', () => {
    beforeEach(async () => {
      await storage.saveAppConfig(sampleAppConfig);
    });

    it('should add new key pair to existing app', async () => {
      const newKeyPair: KeyPair = {
        keyId: 'key3',
        publicKey: '-----BEGIN PUBLIC KEY-----\nNEWKEY...\n-----END PUBLIC KEY-----',
        algorithm: 'ES256',
        createdAt: new Date(),
        enabled: true
      };

      await keyManager.addKeyPair('test-app', newKeyPair);

      const config = await keyManager.getAppConfig('test-app');
      expect(config?.keyPairs).toHaveLength(3);
      expect(config?.keyPairs.find(kp => kp.keyId === 'key3')).toBeDefined();
    });

    it('should prevent adding duplicate key IDs', async () => {
      const duplicateKeyPair: KeyPair = {
        keyId: 'key1', // Already exists
        publicKey: '-----BEGIN PUBLIC KEY-----\nDUPLICATE...\n-----END PUBLIC KEY-----',
        algorithm: 'ES256',
        createdAt: new Date(),
        enabled: true
      };

      await expect(keyManager.addKeyPair('test-app', duplicateKeyPair))
        .rejects.toThrow(KeyManagerError);
    });

    it('should update existing key pair', async () => {
      await keyManager.updateKeyPair('test-app', 'key1', {
        enabled: false,
        expiresAt: new Date('2025-12-31')
      });

      const config = await keyManager.getAppConfig('test-app');
      const updatedKey = config?.keyPairs.find(kp => kp.keyId === 'key1');
      
      expect(updatedKey?.enabled).toBe(false);
      expect(updatedKey?.expiresAt).toEqual(new Date('2025-12-31'));
      expect(updatedKey?.keyId).toBe('key1'); // Should not change
    });

    it('should remove key pair', async () => {
      await keyManager.removeKeyPair('test-app', 'key2');

      const config = await keyManager.getAppConfig('test-app');
      expect(config?.keyPairs).toHaveLength(1);
      expect(config?.keyPairs.find(kp => kp.keyId === 'key2')).toBeUndefined();
    });

    it('should prevent removing the last key pair', async () => {
      // Remove all but one key
      await keyManager.removeKeyPair('test-app', 'key2');

      // Try to remove the last key
      await expect(keyManager.removeKeyPair('test-app', 'key1'))
        .rejects.toThrow(KeyManagerError);
    });

    it('should enable/disable key pairs', async () => {
      await keyManager.setKeyPairEnabled('test-app', 'key1', false);

      const config = await keyManager.getAppConfig('test-app');
      const key = config?.keyPairs.find(kp => kp.keyId === 'key1');
      expect(key?.enabled).toBe(false);
    });

    it('should get valid key pairs only', async () => {
      // Disable one key and expire another
      await keyManager.updateKeyPair('test-app', 'key1', { enabled: false });
      await keyManager.updateKeyPair('test-app', 'key2', { 
        expiresAt: new Date('2020-01-01') // Expired
      });

      const validKeys = await keyManager.getValidKeyPairs('test-app');
      expect(validKeys).toHaveLength(0);

      // Add a valid key
      const validKeyPair: KeyPair = {
        keyId: 'valid-key',
        publicKey: '-----BEGIN PUBLIC KEY-----\nVALID...\n-----END PUBLIC KEY-----',
        algorithm: 'RS256',
        createdAt: new Date(),
        enabled: true
      };

      await keyManager.addKeyPair('test-app', validKeyPair);
      
      const validKeysAfter = await keyManager.getValidKeyPairs('test-app');
      expect(validKeysAfter).toHaveLength(1);
      expect(validKeysAfter[0].keyId).toBe('valid-key');
    });
  });

  describe('Access Control', () => {
    beforeEach(async () => {
      await storage.saveAppConfig(sampleAppConfig);
    });

    it('should validate allowed paths', async () => {
      const hasAccess1 = await keyManager.validateAccess('test-app', '/api/test/users', 'GET');
      const hasAccess2 = await keyManager.validateAccess('test-app', '/api/public/health', 'GET');
      
      expect(hasAccess1).toBe(true);
      expect(hasAccess2).toBe(true);
    });

    it('should deny access to denied paths', async () => {
      const hasAccess = await keyManager.validateAccess('test-app', '/api/admin/users', 'GET');
      expect(hasAccess).toBe(false);
    });

    it('should deny access to non-allowed paths when allowedPaths is set', async () => {
      const hasAccess = await keyManager.validateAccess('test-app', '/api/other/endpoint', 'GET');
      expect(hasAccess).toBe(false);
    });

    it('should validate IP whitelist', async () => {
      const hasAccess1 = await keyManager.validateAccess('test-app', '/api/test/users', 'GET', '192.168.1.1');
      const hasAccess2 = await keyManager.validateAccess('test-app', '/api/test/users', 'GET', '192.168.1.2');
      
      expect(hasAccess1).toBe(true);
      expect(hasAccess2).toBe(false);
    });

    it('should allow access when no access control is configured', async () => {
      const appWithoutAC: AppConfig = {
        ...sampleAppConfig,
        appId: 'no-ac-app',
        accessControl: undefined
      };
      
      await storage.saveAppConfig(appWithoutAC);
      
      const hasAccess = await keyManager.validateAccess('no-ac-app', '/any/path', 'GET');
      expect(hasAccess).toBe(true);
    });

    it('should deny access for disabled apps', async () => {
      await keyManager.setAppEnabled('test-app', false);
      
      const hasAccess = await keyManager.validateAccess('test-app', '/api/test/users', 'GET');
      expect(hasAccess).toBe(false);
    });
  });

  describe('Path Matching', () => {
    it('should match wildcard patterns correctly', async () => {
      const appConfig: AppConfig = {
        ...sampleAppConfig,
        appId: 'wildcard-app',
        accessControl: {
          allowedPaths: ['/api/v1/*', '/public/**', '/exact-path'],
          deniedPaths: ['/api/v1/admin/*']
        }
      };
      
      await storage.saveAppConfig(appConfig);

      // Test allowed patterns
      expect(await keyManager.validateAccess('wildcard-app', '/api/v1/users', 'GET')).toBe(true);
      expect(await keyManager.validateAccess('wildcard-app', '/public/assets/image.png', 'GET')).toBe(true);
      expect(await keyManager.validateAccess('wildcard-app', '/public/nested/deep/file.js', 'GET')).toBe(true);
      expect(await keyManager.validateAccess('wildcard-app', '/exact-path', 'GET')).toBe(true);

      // Test denied patterns (should override allowed)
      expect(await keyManager.validateAccess('wildcard-app', '/api/v1/admin/users', 'GET')).toBe(false);

      // Test non-matching patterns
      expect(await keyManager.validateAccess('wildcard-app', '/api/v2/users', 'GET')).toBe(false);
      expect(await keyManager.validateAccess('wildcard-app', '/private/file', 'GET')).toBe(false);
    });
  });
});

describe('EnvStorageProvider Multi-Channel Support', () => {
  it('should load multiple keys from environment variables', async () => {
    const env = {
      'APP_TESTAPP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nDEFAULT...\n-----END PUBLIC KEY-----',
      'APP_TESTAPP_ALGORITHM': 'RS256',
      'APP_TESTAPP_ENABLED': 'true',
      'APP_TESTAPP_NAME': 'Test App',
      'APP_TESTAPP_PERMISSIONS': 'read,write',
      'APP_TESTAPP_DESCRIPTION': 'Test application',
      'APP_TESTAPP_TAGS': 'test,development',
      'APP_TESTAPP_ALLOWED_PATHS': '/api/test/*,/api/public/*',
      'APP_TESTAPP_DENIED_PATHS': '/api/admin/*',
      'APP_TESTAPP_ALLOWED_IPS': '192.168.1.1,10.0.0.1',
      'APP_TESTAPP_RATE_LIMIT': '100:20',
      'APP_TESTAPP_TIME_WINDOW': '600',
      
      // Additional keys
      'APP_TESTAPP_KEY_BACKUP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nBACKUP...\n-----END PUBLIC KEY-----',
      'APP_TESTAPP_KEY_BACKUP_ALGORITHM': 'RS512',
      'APP_TESTAPP_KEY_BACKUP_ENABLED': 'true',
      'APP_TESTAPP_KEY_BACKUP_EXPIRES_AT': '2025-12-31T23:59:59.000Z',
      
      'APP_TESTAPP_KEY_LEGACY_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nLEGACY...\n-----END PUBLIC KEY-----',
      'APP_TESTAPP_KEY_LEGACY_ALGORITHM': 'ES256',
      'APP_TESTAPP_KEY_LEGACY_ENABLED': 'false'
    };

    const storage = new EnvStorageProvider(env);
    const config = await storage.getAppConfig('testapp');

    expect(config).toBeDefined();
    expect(config!.appId).toBe('testapp');
    expect(config!.name).toBe('Test App');
    expect(config!.description).toBe('Test application');
    expect(config!.tags).toEqual(['test', 'development']);
    expect(config!.keyPairs).toHaveLength(3);

    // Check default key
    const defaultKey = config!.keyPairs.find(kp => kp.keyId === 'default');
    expect(defaultKey).toBeDefined();
    expect(defaultKey!.algorithm).toBe('RS256');
    expect(defaultKey!.enabled).toBe(true);

    // Check backup key
    const backupKey = config!.keyPairs.find(kp => kp.keyId === 'backup');
    expect(backupKey).toBeDefined();
    expect(backupKey!.algorithm).toBe('RS512');
    expect(backupKey!.enabled).toBe(true);
    expect(backupKey!.expiresAt).toEqual(new Date('2025-12-31T23:59:59.000Z'));

    // Check legacy key
    const legacyKey = config!.keyPairs.find(kp => kp.keyId === 'legacy');
    expect(legacyKey).toBeDefined();
    expect(legacyKey!.algorithm).toBe('ES256');
    expect(legacyKey!.enabled).toBe(false);

    // Check access control
    expect(config!.accessControl).toBeDefined();
    expect(config!.accessControl!.allowedPaths).toEqual(['/api/test/*', '/api/public/*']);
    expect(config!.accessControl!.deniedPaths).toEqual(['/api/admin/*']);
    expect(config!.accessControl!.allowedIPs).toEqual(['192.168.1.1', '10.0.0.1']);
    expect(config!.accessControl!.rateLimit).toEqual({
      requestsPerMinute: 100,
      burstLimit: 20
    });
    expect(config!.accessControl!.customTimeWindow).toBe(600);
  });

  it('should list apps with multiple key configurations', async () => {
    const env = {
      'APP_APP1_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nAPP1...\n-----END PUBLIC KEY-----',
      'APP_APP2_KEY_MAIN_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nAPP2...\n-----END PUBLIC KEY-----',
      'APP_APP3_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nAPP3...\n-----END PUBLIC KEY-----',
      'APP_APP3_KEY_BACKUP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nAPP3BACKUP...\n-----END PUBLIC KEY-----'
    };

    const storage = new EnvStorageProvider(env);
    const appIds = await storage.listAppIds();

    expect(appIds).toContain('app1');
    expect(appIds).toContain('app2');
    expect(appIds).toContain('app3');
    expect(appIds).toHaveLength(3);
  });

  it('should handle apps with only additional keys (no default key)', async () => {
    const env = {
      'APP_KEYONLY_NAME': 'Key Only App',
      'APP_KEYONLY_ENABLED': 'true',
      'APP_KEYONLY_KEY_MAIN_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMAIN...\n-----END PUBLIC KEY-----',
      'APP_KEYONLY_KEY_MAIN_ALGORITHM': 'ES256',
      'APP_KEYONLY_KEY_MAIN_ENABLED': 'true'
    };

    const storage = new EnvStorageProvider(env);
    const config = await storage.getAppConfig('keyonly');

    expect(config).toBeDefined();
    expect(config!.keyPairs).toHaveLength(1);
    expect(config!.keyPairs[0].keyId).toBe('main');
    expect(config!.keyPairs[0].algorithm).toBe('ES256');
  });
});