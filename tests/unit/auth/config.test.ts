/**
 * 签名认证配置管理测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuthConfigManager,
  SignatureAuthConfigError,
  ConfigLogger,
  createSignatureAuthConfigFromEnv,
  createKeyManagerConfigFromEnv,
  initializeAuthConfig,
  getAuthConfigManager,
  createConfigLogger,
  type SignatureAuthEnvironment,
  type SignatureAuthConfig,
} from '../../../app/api/auth/config.js';

describe('AuthConfigManager', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // 重置单例实例
    (AuthConfigManager as any).instance = null;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('loadSignatureAuthConfig', () => {
    it('should load default configuration when no environment variables are provided', () => {
      const config = AuthConfigManager.loadSignatureAuthConfig({});
      
      expect(config).toEqual({
        enabled: false,
        timeWindowSeconds: 300,
        algorithms: ['RS256', 'ES256'],
        debug: false,
        skipPaths: ['/api/health', '/api/docs'],
        keyStorageType: 'env',
        kvNamespace: undefined,
        logging: {
          level: 'info',
          verbose: false,
          logVerificationProcess: false,
          logPerformanceMetrics: false,
        },
        validation: {
          strict: true,
          validateKeyFormat: true,
          validateAlgorithmCompatibility: true,
        },
        startupCheck: {
          enabled: true,
          checkKeyConfiguration: true,
          checkStorageConnection: true,
          validateAlgorithmSupport: true,
        },
        performance: {
          enabled: false,
          thresholdMs: 100,
          logSlowOperations: true,
        },
        errorHandling: {
          reportingLevel: 'standard',
          includeStackTrace: false,
          logSensitiveData: false,
        },
      });
    });

    it('should load configuration from environment variables', () => {
      const env: SignatureAuthEnvironment = {
        SIGNATURE_AUTH_ENABLED: 'true',
        SIGNATURE_TIME_WINDOW: '600',
        SIGNATURE_ALGORITHMS: 'RS256,ES256,RS512',
        SIGNATURE_DEBUG: 'true',
        SIGNATURE_SKIP_PATHS: '/api/health,/api/docs,/api/public',
        KEY_STORAGE_TYPE: 'kv',
        SIGNATURE_KV_NAMESPACE: 'test_keys',
        SIGNATURE_LOG_LEVEL: 'debug',
        SIGNATURE_VERBOSE_LOGGING: 'true',
        SIGNATURE_PERFORMANCE_MONITORING: 'true',
        SIGNATURE_STARTUP_CHECK: 'false',
        SIGNATURE_ERROR_REPORTING: 'detailed',
      };

      const config = AuthConfigManager.loadSignatureAuthConfig(env);

      expect(config.enabled).toBe(true);
      expect(config.timeWindowSeconds).toBe(600);
      expect(config.algorithms).toEqual(['RS256', 'ES256', 'RS512']);
      expect(config.debug).toBe(true);
      expect(config.skipPaths).toEqual(['/api/health', '/api/docs', '/api/public']);
      expect(config.keyStorageType).toBe('kv');
      expect(config.kvNamespace).toBe('test_keys');
      expect(config.logging.level).toBe('debug');
      expect(config.logging.verbose).toBe(true);
      expect(config.performance.enabled).toBe(true);
      expect(config.startupCheck.enabled).toBe(false);
      expect(config.errorHandling.reportingLevel).toBe('detailed');
    });

    it('should handle invalid algorithm values gracefully', () => {
      const env: SignatureAuthEnvironment = {
        SIGNATURE_ALGORITHMS: 'RS256,INVALID_ALG,ES256,ANOTHER_INVALID',
      };

      const config = AuthConfigManager.loadSignatureAuthConfig(env);
      expect(config.algorithms).toEqual(['RS256', 'ES256']);
    });

    it('should parse boolean values correctly', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'TRUE', expected: true },
        { value: '1', expected: true },
        { value: 'yes', expected: true },
        { value: 'false', expected: false },
        { value: 'FALSE', expected: false },
        { value: '0', expected: false },
        { value: 'no', expected: false },
        { value: '', expected: false },
        { value: undefined, expected: false },
      ];

      testCases.forEach(({ value, expected }) => {
        const env: SignatureAuthEnvironment = {
          SIGNATURE_AUTH_ENABLED: value,
        };
        const config = AuthConfigManager.loadSignatureAuthConfig(env);
        expect(config.enabled).toBe(expected);
      });
    });
  });

  describe('validateSignatureAuthConfig', () => {
    it('should validate a correct configuration', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      expect(() => AuthConfigManager.validateSignatureAuthConfig(config)).not.toThrow();
    });

    it('should throw error for invalid time window', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      config.timeWindowSeconds = -1;

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Time window must be between 0 and 3600 seconds');
    });

    it('should throw error for invalid algorithms', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      (config.algorithms as any) = ['RS256', 'INVALID_ALG'];

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Invalid algorithms: INVALID_ALG');
    });

    it('should throw error for invalid storage type', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      (config.keyStorageType as any) = 'invalid';

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Invalid storage type: invalid');
    });

    it('should throw error when KV namespace is missing for KV storage', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      config.keyStorageType = 'kv';
      config.kvNamespace = undefined;

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('KV namespace is required when using KV storage');
    });

    it('should throw error for invalid log level', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      (config.logging.level as any) = 'invalid';

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Invalid log level: invalid');
    });

    it('should throw error for invalid performance threshold', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      config.performance.thresholdMs = -1;

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Performance threshold must be between 0 and 10000 milliseconds');
    });

    it('should throw error for invalid error reporting level', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      (config.errorHandling.reportingLevel as any) = 'invalid';

      expect(() => AuthConfigManager.validateSignatureAuthConfig(config))
        .toThrow('Invalid error reporting level: invalid');
    });
  });

  describe('AuthConfigManager instance', () => {
    it('should create singleton instance', () => {
      const instance1 = AuthConfigManager.getInstance();
      const instance2 = AuthConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize configuration', () => {
      const manager = AuthConfigManager.getInstance();
      const env: SignatureAuthEnvironment = {
        SIGNATURE_AUTH_ENABLED: 'true',
        SIGNATURE_TIME_WINDOW: '600',
      };

      const config = manager.initialize(env);
      expect(config.enabled).toBe(true);
      expect(config.timeWindowSeconds).toBe(600);
    });

    it('should throw error when getting config before initialization', () => {
      const manager = AuthConfigManager.getInstance();
      expect(() => manager.getConfig()).toThrow('Configuration not initialized');
    });

    it('should update configuration', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const updates = { enabled: true, timeWindowSeconds: 600 };
      manager.updateConfig(updates);

      const config = manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.timeWindowSeconds).toBe(600);
    });

    it('should validate configuration updates', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const invalidUpdates = { timeWindowSeconds: -1 };
      expect(() => manager.updateConfig(invalidUpdates)).toThrow();
    });

    it('should notify config change listeners', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const listener = vi.fn();
      manager.onConfigChange(listener);

      const updates = { enabled: true };
      manager.updateConfig(updates);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it('should remove config change listeners', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const listener = vi.fn();
      manager.onConfigChange(listener);
      manager.removeConfigChangeListener(listener);

      const updates = { enabled: true };
      manager.updateConfig(updates);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('performStartupCheck', () => {
    it('should skip startup check when disabled', async () => {
      const manager = AuthConfigManager.getInstance();
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      config.startupCheck.enabled = false;
      manager.initialize({});
      manager.updateConfig(config);

      await expect(manager.performStartupCheck()).resolves.not.toThrow();
    });

    it('should perform all startup checks when enabled', async () => {
      const manager = AuthConfigManager.getInstance();
      const env: SignatureAuthEnvironment = {
        SIGNATURE_STARTUP_CHECK: 'true',
      };
      manager.initialize(env);

      // Mock console.log to avoid output during tests
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(manager.performStartupCheck()).resolves.not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should throw error when key configuration check fails', async () => {
      const manager = AuthConfigManager.getInstance();
      const env: SignatureAuthEnvironment = {
        SIGNATURE_AUTH_ENABLED: 'true',
        SIGNATURE_STARTUP_CHECK: 'true',
      };
      manager.initialize(env);

      await expect(manager.performStartupCheck())
        .rejects.toThrow('Startup checks failed');
    });

    it('should throw error when KV namespace is missing', async () => {
      const manager = AuthConfigManager.getInstance();
      const env: SignatureAuthEnvironment = {
        KEY_STORAGE_TYPE: 'kv',
        SIGNATURE_STARTUP_CHECK: 'true',
      };
      
      // This should throw during initialization due to config validation
      await expect(() => manager.initialize(env))
        .toThrow('KV namespace is required when using KV storage');
    });
  });

  describe('getConfigSummary', () => {
    it('should return configuration summary', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const summary = manager.getConfigSummary();
      expect(summary).toHaveProperty('enabled');
      expect(summary).toHaveProperty('timeWindowSeconds');
      expect(summary).toHaveProperty('algorithms');
      expect(summary).toHaveProperty('keyStorageType');
      expect(summary).toHaveProperty('skipPathsCount');
      expect(summary).toHaveProperty('debugMode');
      expect(summary).toHaveProperty('loggingLevel');
      expect(summary).toHaveProperty('performanceMonitoring');
      expect(summary).toHaveProperty('startupCheckEnabled');
    });
  });
});

describe('ConfigLogger', () => {
  let config: SignatureAuthConfig;
  let logger: ConfigLogger;
  let consoleSpy: {
    debug: any;
    info: any;
    warn: any;
    error: any;
  };

  beforeEach(() => {
    config = AuthConfigManager.getDefaultSignatureAuthConfig();
    logger = new ConfigLogger(config);
    
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  it('should log debug messages when level is debug', () => {
    config.logging.level = 'debug';
    logger = new ConfigLogger(config);
    
    logger.debug('Test debug message');
    expect(consoleSpy.debug).toHaveBeenCalledWith('[SignatureAuth:DEBUG] Test debug message');
  });

  it('should not log debug messages when level is info', () => {
    config.logging.level = 'info';
    logger = new ConfigLogger(config);
    
    logger.debug('Test debug message');
    expect(consoleSpy.debug).not.toHaveBeenCalled();
  });

  it('should log info messages when level is info or debug', () => {
    config.logging.level = 'info';
    logger = new ConfigLogger(config);
    
    logger.info('Test info message');
    expect(consoleSpy.info).toHaveBeenCalledWith('[SignatureAuth:INFO] Test info message');
  });

  it('should not log info messages when level is warn', () => {
    config.logging.level = 'warn';
    logger = new ConfigLogger(config);
    
    logger.info('Test info message');
    expect(consoleSpy.info).not.toHaveBeenCalled();
  });

  it('should always log error messages', () => {
    config.logging.level = 'error';
    logger = new ConfigLogger(config);
    
    const error = new Error('Test error');
    logger.error('Test error message', error);
    expect(consoleSpy.error).toHaveBeenCalledWith('[SignatureAuth:ERROR] Test error message', error);
  });

  it('should log verification process when enabled', () => {
    config.logging.logVerificationProcess = true;
    config.logging.level = 'debug';
    logger = new ConfigLogger(config);
    
    logger.logVerificationProcess('signature_validation', { appId: 'test' });
    expect(consoleSpy.debug).toHaveBeenCalledWith(
      '[SignatureAuth:DEBUG] Verification step: signature_validation',
      { appId: 'test' }
    );
  });

  it('should not log verification process when disabled', () => {
    config.logging.logVerificationProcess = false;
    logger = new ConfigLogger(config);
    
    logger.logVerificationProcess('signature_validation', { appId: 'test' });
    expect(consoleSpy.debug).not.toHaveBeenCalled();
  });

  it('should log performance metrics when enabled', () => {
    config.logging.logPerformanceMetrics = true;
    config.logging.level = 'debug';
    logger = new ConfigLogger(config);
    
    logger.logPerformanceMetric('signature_verification', 50);
    expect(consoleSpy.debug).toHaveBeenCalledWith(
      '[SignatureAuth:DEBUG] Performance: signature_verification took 50ms',
      undefined
    );
  });

  it('should warn about slow operations when threshold exceeded', () => {
    config.logging.logPerformanceMetrics = true;
    config.performance.enabled = true;
    config.performance.thresholdMs = 100;
    config.logging.level = 'debug';
    logger = new ConfigLogger(config);
    
    logger.logPerformanceMetric('signature_verification', 150, { appId: 'test' });
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      '[SignatureAuth:WARN] Performance: signature_verification took 150ms (exceeded threshold of 100ms)',
      { appId: 'test' }
    );
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    // 重置单例实例
    (AuthConfigManager as any).instance = null;
  });

  describe('createSignatureAuthConfigFromEnv', () => {
    it('should create and validate configuration from environment', () => {
      const env = {
        SIGNATURE_AUTH_ENABLED: 'true',
        SIGNATURE_TIME_WINDOW: '600',
      };

      const config = createSignatureAuthConfigFromEnv(env);
      expect(config.enabled).toBe(true);
      expect(config.timeWindowSeconds).toBe(600);
    });

    it('should throw error for invalid configuration', () => {
      const env = {
        SIGNATURE_TIME_WINDOW: '-1',
      };

      expect(() => createSignatureAuthConfigFromEnv(env)).toThrow();
    });
  });

  describe('initializeAuthConfig', () => {
    it('should initialize auth config manager', () => {
      const env = {
        SIGNATURE_AUTH_ENABLED: 'true',
      };

      const config = initializeAuthConfig(env);
      expect(config.enabled).toBe(true);

      // Should be able to get the same config from manager
      const manager = getAuthConfigManager();
      expect(manager.getConfig()).toEqual(config);
    });
  });

  describe('createConfigLogger', () => {
    it('should create logger with provided config', () => {
      const config = AuthConfigManager.getDefaultSignatureAuthConfig();
      config.logging.level = 'debug';

      const logger = createConfigLogger(config);
      expect(logger).toBeInstanceOf(ConfigLogger);
    });

    it('should create logger with manager config when no config provided', () => {
      const manager = AuthConfigManager.getInstance();
      manager.initialize({});

      const logger = createConfigLogger();
      expect(logger).toBeInstanceOf(ConfigLogger);
    });
  });
});

describe('SignatureAuthConfigError', () => {
  it('should create error with message, field, and code', () => {
    const error = new SignatureAuthConfigError('Test error', 'testField', 'TEST_CODE');
    
    expect(error.message).toBe('Test error');
    expect(error.field).toBe('testField');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('SignatureAuthConfigError');
  });
});