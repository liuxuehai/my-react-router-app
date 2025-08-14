import { describe, it, expect } from 'vitest';
import { AuthConfigManager, createKeyManagerConfigFromEnv } from '../../app/api/auth/config.js';
import { KeyManagerConfig } from '../../app/api/auth/types.js';

describe('AuthConfigManager', () => {
  describe('loadKeyManagerConfig', () => {
    it('should load config with default values when no environment variables provided', () => {
      const config = AuthConfigManager.loadKeyManagerConfig({});
      
      expect(config).toEqual({
        storageType: 'env',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      });
    });

    it('should load config from environment variables', () => {
      const env = {
        KEY_STORAGE_TYPE: 'memory',
        KEY_CACHE_EXPIRY: '600',
        KEY_ENABLE_CACHE: 'false',
        SIGNATURE_DEBUG: 'true'
      };
      
      const config = AuthConfigManager.loadKeyManagerConfig(env);
      
      expect(config).toEqual({
        storageType: 'memory',
        cacheExpiry: 600,
        enableCache: false,
        debug: true
      });
    });

    it('should handle different storage types', () => {
      const storageTypes = ['env', 'memory', 'kv'];
      
      for (const storageType of storageTypes) {
        const config = AuthConfigManager.loadKeyManagerConfig({
          KEY_STORAGE_TYPE: storageType
        });
        
        expect(config.storageType).toBe(storageType);
      }
    });

    it('should default to env for invalid storage type', () => {
      const config = AuthConfigManager.loadKeyManagerConfig({
        KEY_STORAGE_TYPE: 'invalid-type'
      });
      
      expect(config.storageType).toBe('env');
    });

    it('should handle different boolean formats', () => {
      const truthyValues = ['true', 'TRUE', '1', 'yes', 'YES'];
      const falsyValues = ['false', 'FALSE', '0', 'no', 'NO', ''];
      
      for (const value of truthyValues) {
        const config = AuthConfigManager.loadKeyManagerConfig({
          KEY_ENABLE_CACHE: value,
          SIGNATURE_DEBUG: value
        });
        
        expect(config.enableCache).toBe(true);
        expect(config.debug).toBe(true);
      }
      
      for (const value of falsyValues) {
        const config = AuthConfigManager.loadKeyManagerConfig({
          KEY_ENABLE_CACHE: value,
          SIGNATURE_DEBUG: value
        });
        
        expect(config.enableCache).toBe(false);
        expect(config.debug).toBe(false);
      }
    });

    it('should handle invalid number values', () => {
      const config = AuthConfigManager.loadKeyManagerConfig({
        KEY_CACHE_EXPIRY: 'not-a-number'
      });
      
      expect(config.cacheExpiry).toBe(300); // Default value
    });

    it('should parse valid number values', () => {
      const config = AuthConfigManager.loadKeyManagerConfig({
        KEY_CACHE_EXPIRY: '1800'
      });
      
      expect(config.cacheExpiry).toBe(1800);
    });
  });

  describe('validateKeyManagerConfig', () => {
    it('should validate valid config', () => {
      const validConfig: KeyManagerConfig = {
        storageType: 'memory',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      };
      
      expect(() => AuthConfigManager.validateKeyManagerConfig(validConfig)).not.toThrow();
      expect(AuthConfigManager.validateKeyManagerConfig(validConfig)).toBe(true);
    });

    it('should throw error for invalid storage type', () => {
      const invalidConfig: KeyManagerConfig = {
        storageType: 'invalid' as any,
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      };
      
      expect(() => AuthConfigManager.validateKeyManagerConfig(invalidConfig)).toThrow('Invalid storage type: invalid');
    });

    it('should throw error for negative cache expiry', () => {
      const invalidConfig: KeyManagerConfig = {
        storageType: 'env',
        cacheExpiry: -100,
        enableCache: true,
        debug: false
      };
      
      expect(() => AuthConfigManager.validateKeyManagerConfig(invalidConfig)).toThrow('Cache expiry must be non-negative');
    });

    it('should allow zero cache expiry', () => {
      const validConfig: KeyManagerConfig = {
        storageType: 'env',
        cacheExpiry: 0,
        enableCache: true,
        debug: false
      };
      
      expect(() => AuthConfigManager.validateKeyManagerConfig(validConfig)).not.toThrow();
    });

    it('should validate all supported storage types', () => {
      const supportedTypes: Array<'env' | 'memory' | 'kv'> = ['env', 'memory', 'kv'];
      
      for (const storageType of supportedTypes) {
        const config: KeyManagerConfig = {
          storageType,
          cacheExpiry: 300,
          enableCache: true,
          debug: false
        };
        
        expect(() => AuthConfigManager.validateKeyManagerConfig(config)).not.toThrow();
      }
    });
  });

  describe('getDefaultKeyManagerConfig', () => {
    it('should return default configuration', () => {
      const defaultConfig = AuthConfigManager.getDefaultKeyManagerConfig();
      
      expect(defaultConfig).toEqual({
        storageType: 'env',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      });
    });

    it('should return a new object each time', () => {
      const config1 = AuthConfigManager.getDefaultKeyManagerConfig();
      const config2 = AuthConfigManager.getDefaultKeyManagerConfig();
      
      expect(config1).not.toBe(config2); // Different object references
      expect(config1).toEqual(config2); // Same content
    });
  });

  describe('createKeyManagerConfigFromEnv', () => {
    it('should create and validate config from environment', () => {
      const env = {
        KEY_STORAGE_TYPE: 'memory',
        KEY_CACHE_EXPIRY: '600',
        KEY_ENABLE_CACHE: 'true',
        SIGNATURE_DEBUG: 'false'
      };
      
      const config = createKeyManagerConfigFromEnv(env);
      
      expect(config).toEqual({
        storageType: 'memory',
        cacheExpiry: 600,
        enableCache: true,
        debug: false
      });
    });

    it('should throw error for invalid config from environment', () => {
      const env = {
        KEY_STORAGE_TYPE: 'invalid-type',
        KEY_CACHE_EXPIRY: '-100'
      };
      
      expect(() => createKeyManagerConfigFromEnv(env)).toThrow();
    });

    it('should use process.env by default', () => {
      // This test assumes process.env doesn't have conflicting values
      const config = createKeyManagerConfigFromEnv();
      
      expect(config).toBeDefined();
      expect(config.storageType).toBe('env'); // Default value
    });

    it('should handle empty environment', () => {
      const config = createKeyManagerConfigFromEnv({});
      
      expect(config).toEqual({
        storageType: 'env',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      });
    });
  });

  describe('edge cases', () => {
    it('should handle undefined environment values', () => {
      const env = {
        KEY_STORAGE_TYPE: undefined,
        KEY_CACHE_EXPIRY: undefined,
        KEY_ENABLE_CACHE: undefined,
        SIGNATURE_DEBUG: undefined
      };
      
      const config = AuthConfigManager.loadKeyManagerConfig(env);
      
      expect(config).toEqual({
        storageType: 'env',
        cacheExpiry: 300,
        enableCache: true,
        debug: false
      });
    });

    it('should handle empty string values', () => {
      const env = {
        KEY_STORAGE_TYPE: '',
        KEY_CACHE_EXPIRY: '',
        KEY_ENABLE_CACHE: '',
        SIGNATURE_DEBUG: ''
      };
      
      const config = AuthConfigManager.loadKeyManagerConfig(env);
      
      expect(config).toEqual({
        storageType: 'env', // Default for empty string
        cacheExpiry: 300, // Default for invalid number
        enableCache: false, // Empty string is falsy
        debug: false // Empty string is falsy
      });
    });

    it('should handle case sensitivity in storage type', () => {
      const testCases = [
        { input: 'ENV', expected: 'env' },
        { input: 'Memory', expected: 'memory' },
        { input: 'KV', expected: 'kv' },
        { input: 'MEMORY', expected: 'memory' }
      ];
      
      for (const testCase of testCases) {
        const config = AuthConfigManager.loadKeyManagerConfig({
          KEY_STORAGE_TYPE: testCase.input
        });
        
        expect(config.storageType).toBe(testCase.expected);
      }
    });
  });
});