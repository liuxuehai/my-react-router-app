import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageProvider } from '../../app/api/auth/storage/memory-storage.js';
import { EnvStorageProvider } from '../../app/api/auth/storage/env-storage.js';
import { AppConfig, KeyPair, KeyManagerError } from '../../app/api/auth/types.js';

describe('Storage Providers', () => {
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

  describe('MemoryStorageProvider', () => {
    let storage: MemoryStorageProvider;

    beforeEach(() => {
      storage = new MemoryStorageProvider();
    });

    describe('basic operations', () => {
      it('should return null for non-existent app', async () => {
        const result = await storage.getAppConfig('non-existent');
        expect(result).toBeNull();
      });

      it('should save and retrieve app config', async () => {
        await storage.saveAppConfig(testAppConfig);
        
        const retrieved = await storage.getAppConfig('test-app');
        expect(retrieved).toEqual(testAppConfig);
      });

      it('should delete app config', async () => {
        await storage.saveAppConfig(testAppConfig);
        await storage.deleteAppConfig('test-app');
        
        const retrieved = await storage.getAppConfig('test-app');
        expect(retrieved).toBeNull();
      });

      it('should list app IDs', async () => {
        const config1 = { ...testAppConfig, appId: 'app1' };
        const config2 = { ...testAppConfig, appId: 'app2' };
        
        await storage.saveAppConfig(config1);
        await storage.saveAppConfig(config2);
        
        const appIds = await storage.listAppIds();
        expect(appIds).toEqual(['app1', 'app2']);
      });

      it('should return correct size', async () => {
        expect(storage.size()).toBe(0);
        
        await storage.saveAppConfig(testAppConfig);
        expect(storage.size()).toBe(1);
      });

      it('should clear all data', async () => {
        await storage.saveAppConfig(testAppConfig);
        expect(storage.size()).toBe(1);
        
        storage.clear();
        expect(storage.size()).toBe(0);
      });
    });

    describe('validation', () => {
      it('should throw error for invalid app ID', async () => {
        const invalidConfig = { ...testAppConfig, appId: '' };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Invalid app ID');
      });

      it('should throw error for invalid app name', async () => {
        const invalidConfig = { ...testAppConfig, name: '' };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Invalid app name');
      });

      it('should throw error for empty key pairs', async () => {
        const invalidConfig = { ...testAppConfig, keyPairs: [] };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('App must have at least one key pair');
      });

      it('should throw error for invalid key ID', async () => {
        const invalidKeyPair = { ...testKeyPair, keyId: '' };
        const invalidConfig = { ...testAppConfig, keyPairs: [invalidKeyPair] };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Invalid key ID');
      });

      it('should throw error for invalid public key', async () => {
        const invalidKeyPair = { ...testKeyPair, publicKey: '' };
        const invalidConfig = { ...testAppConfig, keyPairs: [invalidKeyPair] };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Invalid public key');
      });

      it('should throw error for unsupported algorithm', async () => {
        const invalidKeyPair = { ...testKeyPair, algorithm: 'INVALID' as any };
        const invalidConfig = { ...testAppConfig, keyPairs: [invalidKeyPair] };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Unsupported algorithm INVALID');
      });

      it('should throw error for invalid public key format', async () => {
        const invalidKeyPair = { ...testKeyPair, publicKey: 'invalid-format' };
        const invalidConfig = { ...testAppConfig, keyPairs: [invalidKeyPair] };
        
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(invalidConfig)).rejects.toThrow('Invalid public key format');
      });

      it('should throw error when deleting non-existent app', async () => {
        await expect(storage.deleteAppConfig('non-existent')).rejects.toThrow(KeyManagerError);
        await expect(storage.deleteAppConfig('non-existent')).rejects.toThrow('App non-existent not found');
      });
    });

    describe('data isolation', () => {
      it('should not allow external modification of stored data', async () => {
        const originalConfig = { ...testAppConfig };
        await storage.saveAppConfig(originalConfig);
        
        // Modify the original config
        originalConfig.name = 'Modified Name';
        originalConfig.keyPairs[0].enabled = false;
        
        // Retrieved config should not be affected
        const retrieved = await storage.getAppConfig('test-app');
        expect(retrieved?.name).toBe('Test Application');
        expect(retrieved?.keyPairs[0].enabled).toBe(true);
      });
    });
  });

  describe('EnvStorageProvider', () => {
    describe('loading from environment', () => {
      it('should load complete app config from environment variables', async () => {
        const env = {
          'APP_TESTAPP_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
          'APP_TESTAPP_ALGORITHM': 'RS256',
          'APP_TESTAPP_ENABLED': 'true',
          'APP_TESTAPP_NAME': 'Test Application',
          'APP_TESTAPP_PERMISSIONS': 'read,write,admin'
        };
        
        const storage = new EnvStorageProvider(env);
        const config = await storage.getAppConfig('testapp');
        
        expect(config).not.toBeNull();
        expect(config?.appId).toBe('testapp');
        expect(config?.name).toBe('Test Application');
        expect(config?.enabled).toBe(true);
        expect(config?.permissions).toEqual(['read', 'write', 'admin']);
        expect(config?.keyPairs).toHaveLength(1);
        
        const keyPair = config?.keyPairs[0];
        expect(keyPair?.keyId).toBe('default');
        expect(keyPair?.algorithm).toBe('RS256');
        expect(keyPair?.enabled).toBe(true);
        expect(keyPair?.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      });

      it('should use default values for optional fields', async () => {
        const env = {
          'APP_MINIMAL_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----'
        };
        
        const storage = new EnvStorageProvider(env);
        const config = await storage.getAppConfig('minimal');
        
        expect(config).not.toBeNull();
        expect(config?.name).toBe('minimal'); // Default to appId
        expect(config?.enabled).toBe(true); // Default enabled
        expect(config?.permissions).toEqual([]); // Default empty permissions
        expect(config?.keyPairs[0].algorithm).toBe('RS256'); // Default algorithm
      });

      it('should handle disabled app', async () => {
        const env = {
          'APP_DISABLED_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
          'APP_DISABLED_ENABLED': 'false'
        };
        
        const storage = new EnvStorageProvider(env);
        const config = await storage.getAppConfig('disabled');
        
        expect(config?.enabled).toBe(false);
      });

      it('should handle different algorithms', async () => {
        const algorithms = ['RS256', 'RS512', 'ES256', 'ES512'];
        
        for (const algorithm of algorithms) {
          const env = {
            [`APP_TEST${algorithm}_PUBLIC_KEY`]: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
            [`APP_TEST${algorithm}_ALGORITHM`]: algorithm
          };
          
          const storage = new EnvStorageProvider(env);
          const config = await storage.getAppConfig(`test${algorithm.toLowerCase()}`);
          
          expect(config?.keyPairs[0].algorithm).toBe(algorithm);
        }
      });

      it('should return null for app without public key', async () => {
        const env = {
          'APP_NOKEY_NAME': 'No Key App'
        };
        
        const storage = new EnvStorageProvider(env);
        const config = await storage.getAppConfig('nokey');
        
        expect(config).toBeNull();
      });
    });

    describe('validation', () => {
      it('should throw error for invalid public key format', async () => {
        const env = {
          'APP_INVALID_PUBLIC_KEY': 'not-a-valid-pem-key'
        };
        
        const storage = new EnvStorageProvider(env);
        
        await expect(storage.getAppConfig('invalid')).rejects.toThrow(KeyManagerError);
        await expect(storage.getAppConfig('invalid')).rejects.toThrow('Invalid public key format');
      });

      it('should throw error for unsupported algorithm', async () => {
        const env = {
          'APP_BADALGO_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
          'APP_BADALGO_ALGORITHM': 'MD5'
        };
        
        const storage = new EnvStorageProvider(env);
        
        await expect(storage.getAppConfig('badalgo')).rejects.toThrow(KeyManagerError);
        await expect(storage.getAppConfig('badalgo')).rejects.toThrow('Unsupported algorithm MD5');
      });

      it('should validate different PEM key formats', async () => {
        const validKeys = [
          '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
          '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEA...\n-----END RSA PUBLIC KEY-----',
          '-----BEGIN EC PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END EC PUBLIC KEY-----'
        ];
        
        for (let i = 0; i < validKeys.length; i++) {
          const env = {
            [`APP_VALID${i}_PUBLIC_KEY`]: validKeys[i]
          };
          
          const storage = new EnvStorageProvider(env);
          const config = await storage.getAppConfig(`valid${i}`);
          
          expect(config).not.toBeNull();
          expect(config?.keyPairs[0].publicKey).toBe(validKeys[i]);
        }
      });
    });

    describe('listing apps', () => {
      it('should list all apps from environment variables', async () => {
        const env = {
          'APP_APP1_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\ntest1\n-----END PUBLIC KEY-----',
          'APP_APP2_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\ntest2\n-----END PUBLIC KEY-----',
          'APP_APP3_PUBLIC_KEY': '-----BEGIN PUBLIC KEY-----\ntest3\n-----END PUBLIC KEY-----',
          'OTHER_VAR': 'should-be-ignored',
          'APP_INCOMPLETE_NAME': 'incomplete-without-key'
        };
        
        const storage = new EnvStorageProvider(env);
        const appIds = await storage.listAppIds();
        
        expect(appIds.sort()).toEqual(['app1', 'app2', 'app3']);
      });

      it('should return empty array when no apps configured', async () => {
        const storage = new EnvStorageProvider({});
        const appIds = await storage.listAppIds();
        
        expect(appIds).toEqual([]);
      });
    });

    describe('read-only operations', () => {
      let storage: EnvStorageProvider;

      beforeEach(() => {
        storage = new EnvStorageProvider({});
      });

      it('should throw error when trying to save', async () => {
        await expect(storage.saveAppConfig(testAppConfig)).rejects.toThrow(KeyManagerError);
        await expect(storage.saveAppConfig(testAppConfig)).rejects.toThrow('Environment storage provider is read-only');
      });

      it('should throw error when trying to delete', async () => {
        await expect(storage.deleteAppConfig('test-app')).rejects.toThrow(KeyManagerError);
        await expect(storage.deleteAppConfig('test-app')).rejects.toThrow('Environment storage provider is read-only');
      });
    });
  });
});