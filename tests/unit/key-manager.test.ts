import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagerImpl, createKeyManager } from '../../app/api/auth/key-manager.js';
import { MemoryStorageProvider } from '../../app/api/auth/storage/memory-storage.js';
import { EnvStorageProvider } from '../../app/api/auth/storage/env-storage.js';
import { KeyManagerError, AppConfig, KeyPair } from '../../app/api/auth/types.js';

describe('KeyManager', () => {
  const testKeyPair: KeyPair = {
    keyId: 'test-key',
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
    algorithm: 'RS256',
    createdAt: new Date('2024-01-01'),
    enabled: true
  };

  const testAppConfig: AppConfig = {
    appId: 'test-app',
    name: 'Test Application',
    keyPairs: [testKeyPair],
    enabled: true,
    permissions: ['read', 'write'],
    createdAt: new Date('2024-01-01')
  };

  describe('KeyManagerImpl with MemoryStorage', () => {
    let keyManager: KeyManagerImpl;
    let storage: MemoryStorageProvider;

    beforeEach(() => {
      storage = new MemoryStorageProvider();
      keyManager = new KeyManagerImpl({
        storageType: 'memory',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      });
      // 手动设置存储以便测试
      (keyManager as any).storage = storage;
    });

    describe('getAppConfig', () => {
      it('should return null for non-existent app', async () => {
        const result = await keyManager.getAppConfig('non-existent');
        expect(result).toBeNull();
      });

      it('should return app config when it exists', async () => {
        await storage.saveAppConfig(testAppConfig);
        
        const result = await keyManager.getAppConfig('test-app');
        expect(result).toEqual(testAppConfig);
      });

      it('should cache app config when cache is enabled', async () => {
        await storage.saveAppConfig(testAppConfig);
        
        // First call should load from storage
        const result1 = await keyManager.getAppConfig('test-app');
        expect(result1).toEqual(testAppConfig);
        
        // Second call should use cache
        const result2 = await keyManager.getAppConfig('test-app');
        expect(result2).toEqual(testAppConfig);
        
        const stats = keyManager.getCacheStats();
        expect(stats.size).toBe(1);
      });
    });

    describe('getPublicKey', () => {
      beforeEach(async () => {
        await storage.saveAppConfig(testAppConfig);
      });

      it('should return public key for valid app and key', async () => {
        const publicKey = await keyManager.getPublicKey('test-app', 'test-key');
        expect(publicKey).toBe(testKeyPair.publicKey);
      });

      it('should return public key using default key when keyId not specified', async () => {
        const configWithDefaultKey = {
          ...testAppConfig,
          keyPairs: [{
            ...testKeyPair,
            keyId: 'default'
          }]
        };
        await storage.saveAppConfig(configWithDefaultKey);
        
        const publicKey = await keyManager.getPublicKey('test-app');
        expect(publicKey).toBe(testKeyPair.publicKey);
      });

      it('should return null for non-existent app', async () => {
        const publicKey = await keyManager.getPublicKey('non-existent');
        expect(publicKey).toBeNull();
      });

      it('should throw error for disabled app', async () => {
        const disabledConfig = { ...testAppConfig, enabled: false };
        await storage.saveAppConfig(disabledConfig);
        
        await expect(keyManager.getPublicKey('test-app')).rejects.toThrow(KeyManagerError);
        await expect(keyManager.getPublicKey('test-app')).rejects.toThrow('App test-app is disabled');
      });

      it('should throw error for non-existent key', async () => {
        await expect(keyManager.getPublicKey('test-app', 'non-existent-key')).rejects.toThrow(KeyManagerError);
        await expect(keyManager.getPublicKey('test-app', 'non-existent-key')).rejects.toThrow('Key non-existent-key not found');
      });

      it('should throw error for disabled key', async () => {
        const configWithDisabledKey = {
          ...testAppConfig,
          keyPairs: [{
            ...testKeyPair,
            enabled: false
          }]
        };
        await storage.saveAppConfig(configWithDisabledKey);
        
        await expect(keyManager.getPublicKey('test-app', 'test-key')).rejects.toThrow(KeyManagerError);
        await expect(keyManager.getPublicKey('test-app', 'test-key')).rejects.toThrow('Key test-key is disabled');
      });

      it('should throw error for expired key', async () => {
        const expiredKey = {
          ...testKeyPair,
          expiresAt: new Date('2023-01-01') // Past date
        };
        const configWithExpiredKey = {
          ...testAppConfig,
          keyPairs: [expiredKey]
        };
        await storage.saveAppConfig(configWithExpiredKey);
        
        await expect(keyManager.getPublicKey('test-app', 'test-key')).rejects.toThrow(KeyManagerError);
        await expect(keyManager.getPublicKey('test-app', 'test-key')).rejects.toThrow('Key test-key has expired');
      });
    });

    describe('validateApp', () => {
      it('should return true for valid enabled app', async () => {
        await storage.saveAppConfig(testAppConfig);
        
        const isValid = await keyManager.validateApp('test-app');
        expect(isValid).toBe(true);
      });

      it('should return false for non-existent app', async () => {
        const isValid = await keyManager.validateApp('non-existent');
        expect(isValid).toBe(false);
      });

      it('should return false for disabled app', async () => {
        const disabledConfig = { ...testAppConfig, enabled: false };
        await storage.saveAppConfig(disabledConfig);
        
        const isValid = await keyManager.validateApp('test-app');
        expect(isValid).toBe(false);
      });
    });

    describe('addApp', () => {
      it('should add new app successfully', async () => {
        await keyManager.addApp(testAppConfig);
        
        const retrieved = await keyManager.getAppConfig('test-app');
        expect(retrieved).toEqual(testAppConfig);
      });

      it('should cache added app when cache is enabled', async () => {
        await keyManager.addApp(testAppConfig);
        
        const stats = keyManager.getCacheStats();
        expect(stats.size).toBe(1);
      });
    });

    describe('updateApp', () => {
      beforeEach(async () => {
        await storage.saveAppConfig(testAppConfig);
      });

      it('should update existing app successfully', async () => {
        const updates = {
          name: 'Updated Test Application',
          permissions: ['read']
        };
        
        await keyManager.updateApp('test-app', updates);
        
        const updated = await keyManager.getAppConfig('test-app');
        expect(updated?.name).toBe('Updated Test Application');
        expect(updated?.permissions).toEqual(['read']);
        expect(updated?.appId).toBe('test-app'); // Should not change
        expect(updated?.createdAt).toEqual(testAppConfig.createdAt); // Should not change
      });

      it('should throw error for non-existent app', async () => {
        await expect(keyManager.updateApp('non-existent', { name: 'New Name' })).rejects.toThrow(KeyManagerError);
        await expect(keyManager.updateApp('non-existent', { name: 'New Name' })).rejects.toThrow('App non-existent not found');
      });
    });

    describe('generateKeyPair', () => {
      it('should generate key pair for supported algorithm', async () => {
        const keyPair = await keyManager.generateKeyPair('RS256');
        
        expect(keyPair.algorithm).toBe('RS256');
        expect(keyPair.keyId).toMatch(/^key_\d+$/);
        expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
        expect(keyPair.enabled).toBe(true);
        expect(keyPair.createdAt).toBeInstanceOf(Date);
      });

      it('should throw error for unsupported algorithm', async () => {
        await expect(keyManager.generateKeyPair('INVALID')).rejects.toThrow(KeyManagerError);
        await expect(keyManager.generateKeyPair('INVALID')).rejects.toThrow('Unsupported algorithm INVALID');
      });
    });

    describe('cache management', () => {
      beforeEach(async () => {
        await storage.saveAppConfig(testAppConfig);
      });

      it('should clear cache successfully', async () => {
        // Load into cache
        await keyManager.getAppConfig('test-app');
        expect(keyManager.getCacheStats().size).toBe(1);
        
        // Clear cache
        keyManager.clearCache();
        expect(keyManager.getCacheStats().size).toBe(0);
      });

      it('should not use cache when cache is disabled', async () => {
        const noCacheManager = new KeyManagerImpl({
          storageType: 'memory',
          cacheExpiry: 300,
          enableCache: false,
          debug: false
        });
        (noCacheManager as any).storage = storage;
        
        await noCacheManager.getAppConfig('test-app');
        expect(noCacheManager.getCacheStats().size).toBe(0);
      });
    });
  });

  describe('EnvStorageProvider', () => {
    it('should load app config from environment variables', async () => {
      const env = {
        'APP_TESTAPP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
        'APP_TESTAPP_ALGORITHM': 'RS256',
        'APP_TESTAPP_ENABLED': 'true',
        'APP_TESTAPP_NAME': 'Test App',
        'APP_TESTAPP_PERMISSIONS': 'read,write'
      };
      
      const storage = new EnvStorageProvider(env);
      const config = await storage.getAppConfig('testapp');
      
      expect(config).not.toBeNull();
      expect(config?.appId).toBe('testapp');
      expect(config?.name).toBe('Test App');
      expect(config?.enabled).toBe(true);
      expect(config?.permissions).toEqual(['read', 'write']);
      expect(config?.keyPairs).toHaveLength(1);
      expect(config?.keyPairs[0].algorithm).toBe('RS256');
    });

    it('should return null for non-existent app', async () => {
      const storage = new EnvStorageProvider({});
      const config = await storage.getAppConfig('non-existent');
      
      expect(config).toBeNull();
    });

    it('should throw error for invalid public key format', async () => {
      const env = {
        'APP_TESTAPP_PUBLIC_KEY': 'invalid-key-format'
      };
      
      const storage = new EnvStorageProvider(env);
      
      await expect(storage.getAppConfig('testapp')).rejects.toThrow(KeyManagerError);
      await expect(storage.getAppConfig('testapp')).rejects.toThrow('Invalid public key format');
    });

    it('should throw error for unsupported algorithm', async () => {
      const env = {
        'APP_TESTAPP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
        'APP_TESTAPP_ALGORITHM': 'INVALID'
      };
      
      const storage = new EnvStorageProvider(env);
      
      await expect(storage.getAppConfig('testapp')).rejects.toThrow(KeyManagerError);
      await expect(storage.getAppConfig('testapp')).rejects.toThrow('Unsupported algorithm INVALID');
    });

    it('should list app IDs from environment variables', async () => {
      const env = {
        'APP_APP1_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\ntest1\n-----END PUBLIC KEY-----',
        'APP_APP2_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\ntest2\n-----END PUBLIC KEY-----',
        'OTHER_VAR': 'should-be-ignored'
      };
      
      const storage = new EnvStorageProvider(env);
      const appIds = await storage.listAppIds();
      
      expect(appIds).toEqual(['app1', 'app2']);
    });
  });

  describe('createKeyManager factory', () => {
    it('should create key manager with default config', () => {
      const keyManager = createKeyManager();
      expect(keyManager).toBeInstanceOf(KeyManagerImpl);
    });

    it('should create key manager with custom config', () => {
      const keyManager = createKeyManager({
        storageType: 'memory',
        debug: true
      });
      expect(keyManager).toBeInstanceOf(KeyManagerImpl);
    });

    it('should pass environment to storage provider', () => {
      const env = { 'TEST_VAR': 'test-value' };
      const keyManager = createKeyManager({ storageType: 'env' }, env);
      expect(keyManager).toBeInstanceOf(KeyManagerImpl);
    });
  });
});