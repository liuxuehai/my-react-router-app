/**
 * 配置验证器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConfigValidator,
  validateAndThrow,
  validateAndWarn,
  type ValidationResult,
} from '../../../app/api/auth/config-validator.js';
import { AuthConfigManager, SignatureAuthConfigError, type SignatureAuthConfig, type KeyManagerConfig } from '../../../app/api/auth/config.js';

describe('ConfigValidator', () => {
  describe('validateSignatureAuthConfig', () => {
    let validConfig: SignatureAuthConfig;

    beforeEach(() => {
      validConfig = AuthConfigManager.getDefaultSignatureAuthConfig();
    });

    it('should validate a correct configuration', () => {
      const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    describe('basic configuration validation', () => {
      it('should reject negative time window', () => {
        validConfig.timeWindowSeconds = -1;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'timeWindowSeconds',
            code: 'NEGATIVE_TIME_WINDOW',
          })
        );
      });

      it('should reject time window exceeding 3600 seconds', () => {
        validConfig.timeWindowSeconds = 3601;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'timeWindowSeconds',
            code: 'TIME_WINDOW_TOO_LARGE',
          })
        );
      });

      it('should warn about short time window', () => {
        validConfig.timeWindowSeconds = 30;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'timeWindowSeconds',
            code: 'SHORT_TIME_WINDOW',
          })
        );
      });

      it('should reject non-array skip paths', () => {
        (validConfig.skipPaths as any) = 'not-an-array';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'skipPaths',
            code: 'INVALID_SKIP_PATHS_TYPE',
          })
        );
      });

      it('should reject non-string skip path items', () => {
        (validConfig.skipPaths as any) = ['/api/health', 123, '/api/docs'];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'skipPaths[1]',
            code: 'INVALID_SKIP_PATH_TYPE',
          })
        );
      });

      it('should warn about skip paths not starting with /', () => {
        validConfig.skipPaths = ['/api/health', 'api/docs'];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'skipPaths[1]',
            code: 'SKIP_PATH_FORMAT',
          })
        );
      });
    });

    describe('algorithm configuration validation', () => {
      it('should reject non-array algorithms', () => {
        (validConfig.algorithms as any) = 'RS256';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'algorithms',
            code: 'INVALID_ALGORITHMS_TYPE',
          })
        );
      });

      it('should reject empty algorithms array', () => {
        validConfig.algorithms = [];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'algorithms',
            code: 'NO_ALGORITHMS',
          })
        );
      });

      it('should reject invalid algorithms', () => {
        (validConfig.algorithms as any) = ['RS256', 'INVALID_ALG', 'ES256'];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'algorithms',
            code: 'INVALID_ALGORITHMS',
            value: ['INVALID_ALG'],
          })
        );
      });

      it('should suggest adding ES256 for performance', () => {
        validConfig.algorithms = ['RS256'];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'algorithms',
            code: 'ALGORITHM_PERFORMANCE_SUGGESTION',
          })
        );
      });

      it('should warn about deprecated algorithms', () => {
        validConfig.algorithms = ['RS256', 'RS512'];
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'algorithms',
            code: 'DEPRECATED_ALGORITHM',
          })
        );
      });
    });

    describe('storage configuration validation', () => {
      it('should reject invalid storage type', () => {
        (validConfig.keyStorageType as any) = 'invalid';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'keyStorageType',
            code: 'INVALID_STORAGE_TYPE',
          })
        );
      });

      it('should require KV namespace for KV storage', () => {
        validConfig.keyStorageType = 'kv';
        validConfig.kvNamespace = undefined;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'kvNamespace',
            code: 'MISSING_KV_NAMESPACE',
          })
        );
      });

      it('should warn about short KV namespace', () => {
        validConfig.keyStorageType = 'kv';
        validConfig.kvNamespace = 'KV';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'kvNamespace',
            code: 'SHORT_KV_NAMESPACE',
          })
        );
      });

      it('should warn about memory storage', () => {
        validConfig.keyStorageType = 'memory';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'keyStorageType',
            code: 'MEMORY_STORAGE_WARNING',
          })
        );
      });
    });

    describe('logging configuration validation', () => {
      it('should reject invalid log level', () => {
        (validConfig.logging.level as any) = 'invalid';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'logging.level',
            code: 'INVALID_LOG_LEVEL',
          })
        );
      });

      it('should warn about debug log level in production', () => {
        validConfig.logging.level = 'debug';
        validConfig.debug = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'logging.level',
            code: 'DEBUG_LOG_LEVEL_WARNING',
          })
        );
      });

      it('should warn about verbose logging in production', () => {
        validConfig.logging.verbose = true;
        validConfig.debug = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'logging.verbose',
            code: 'VERBOSE_LOGGING_WARNING',
          })
        );
      });
    });

    describe('performance configuration validation', () => {
      it('should reject negative performance threshold', () => {
        validConfig.performance.thresholdMs = -1;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'performance.thresholdMs',
            code: 'NEGATIVE_PERFORMANCE_THRESHOLD',
          })
        );
      });

      it('should reject performance threshold exceeding 10000ms', () => {
        validConfig.performance.thresholdMs = 10001;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'performance.thresholdMs',
            code: 'PERFORMANCE_THRESHOLD_TOO_LARGE',
          })
        );
      });

      it('should warn about high performance threshold', () => {
        validConfig.performance.thresholdMs = 2000;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'performance.thresholdMs',
            code: 'HIGH_PERFORMANCE_THRESHOLD',
          })
        );
      });

      it('should warn about inconsistent performance config', () => {
        validConfig.performance.enabled = false;
        validConfig.performance.logSlowOperations = true;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'performance.logSlowOperations',
            code: 'PERFORMANCE_CONFIG_INCONSISTENT',
          })
        );
      });
    });

    describe('startup check configuration validation', () => {
      it('should warn when signature auth is enabled but startup check is disabled', () => {
        validConfig.enabled = true;
        validConfig.startupCheck.enabled = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'startupCheck.enabled',
            code: 'STARTUP_CHECK_DISABLED_WARNING',
          })
        );
      });

      it('should warn when key check is disabled but auth is enabled', () => {
        validConfig.enabled = true;
        validConfig.startupCheck.enabled = true;
        validConfig.startupCheck.checkKeyConfiguration = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'startupCheck.checkKeyConfiguration',
            code: 'KEY_CHECK_DISABLED_WARNING',
          })
        );
      });

      it('should warn when storage check is disabled but using KV', () => {
        validConfig.keyStorageType = 'kv';
        validConfig.kvNamespace = 'TEST_KV';
        validConfig.startupCheck.enabled = true;
        validConfig.startupCheck.checkStorageConnection = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'startupCheck.checkStorageConnection',
            code: 'STORAGE_CHECK_DISABLED_WARNING',
          })
        );
      });
    });

    describe('error handling configuration validation', () => {
      it('should reject invalid error reporting level', () => {
        (validConfig.errorHandling.reportingLevel as any) = 'invalid';
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'errorHandling.reportingLevel',
            code: 'INVALID_ERROR_REPORTING_LEVEL',
          })
        );
      });

      it('should warn about logging sensitive data', () => {
        validConfig.errorHandling.logSensitiveData = true;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'errorHandling.logSensitiveData',
            code: 'SENSITIVE_DATA_LOGGING_WARNING',
          })
        );
      });

      it('should warn about stack traces in production', () => {
        validConfig.errorHandling.includeStackTrace = true;
        validConfig.debug = false;
        
        const result = ConfigValidator.validateSignatureAuthConfig(validConfig);
        
        expect(result.isValid).toBe(true);
        expect(result.warnings).toContainEqual(
          expect.objectContaining({
            field: 'errorHandling.includeStackTrace',
            code: 'STACK_TRACE_WARNING',
          })
        );
      });
    });
  });

  describe('validateKeyManagerConfig', () => {
    let validConfig: KeyManagerConfig;

    beforeEach(() => {
      validConfig = AuthConfigManager.getDefaultKeyManagerConfig();
    });

    it('should validate a correct configuration', () => {
      const result = ConfigValidator.validateKeyManagerConfig(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid storage type', () => {
      (validConfig.storageType as any) = 'invalid';
      
      const result = ConfigValidator.validateKeyManagerConfig(validConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'storageType',
          code: 'INVALID_STORAGE_TYPE',
        })
      );
    });

    it('should reject negative cache expiry', () => {
      validConfig.cacheExpiry = -1;
      
      const result = ConfigValidator.validateKeyManagerConfig(validConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'cacheExpiry',
          code: 'INVALID_CACHE_EXPIRY',
        })
      );
    });

    it('should warn about long cache expiry', () => {
      validConfig.cacheExpiry = 7200;
      
      const result = ConfigValidator.validateKeyManagerConfig(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'cacheExpiry',
          code: 'LONG_CACHE_EXPIRY',
        })
      );
    });

    it('should warn about inconsistent cache config', () => {
      validConfig.enableCache = false;
      validConfig.cacheExpiry = 300;
      
      const result = ConfigValidator.validateKeyManagerConfig(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'cacheExpiry',
          code: 'CACHE_CONFIG_INCONSISTENT',
        })
      );
    });
  });

  describe('generateValidationReport', () => {
    it('should generate report for valid configuration', () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const report = ConfigValidator.generateValidationReport(result);
      
      expect(report).toContain('✅ VALID');
      expect(report).toContain('✨ No issues found!');
    });

    it('should generate report with errors', () => {
      const result: ValidationResult = {
        isValid: false,
        errors: [
          {
            field: 'timeWindowSeconds',
            message: 'Time window cannot be negative',
            code: 'NEGATIVE_TIME_WINDOW',
            value: -1,
            suggestion: 300,
          },
        ],
        warnings: [],
      };

      const report = ConfigValidator.generateValidationReport(result);
      
      expect(report).toContain('❌ INVALID');
      expect(report).toContain('🚨 ERRORS:');
      expect(report).toContain('[timeWindowSeconds] Time window cannot be negative');
      expect(report).toContain('Current: -1');
      expect(report).toContain('Suggested: 300');
    });

    it('should generate report with warnings', () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [
          {
            field: 'timeWindowSeconds',
            message: 'Time window is very short',
            code: 'SHORT_TIME_WINDOW',
            value: 30,
            suggestion: 300,
          },
        ],
      };

      const report = ConfigValidator.generateValidationReport(result);
      
      expect(report).toContain('✅ VALID');
      expect(report).toContain('⚠️  WARNINGS:');
      expect(report).toContain('[timeWindowSeconds] Time window is very short');
      expect(report).toContain('Current: 30');
      expect(report).toContain('Suggested: 300');
    });
  });
});

describe('Convenience functions', () => {
  let validConfig: SignatureAuthConfig;

  beforeEach(() => {
    validConfig = AuthConfigManager.getDefaultSignatureAuthConfig();
  });

  describe('validateAndThrow', () => {
    it('should not throw for valid configuration', () => {
      expect(() => validateAndThrow(validConfig)).not.toThrow();
    });

    it('should throw SignatureAuthConfigError for invalid configuration', () => {
      validConfig.timeWindowSeconds = -1;
      
      expect(() => validateAndThrow(validConfig))
        .toThrow(SignatureAuthConfigError);
    });

    it('should include validation details in error message', () => {
      validConfig.timeWindowSeconds = -1;
      
      expect(() => validateAndThrow(validConfig))
        .toThrow('timeWindowSeconds: Time window cannot be negative');
    });
  });

  describe('validateAndWarn', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should return validation result', () => {
      const result = validateAndWarn(validConfig);
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should log warnings to console', () => {
      validConfig.timeWindowSeconds = 30; // This should generate a warning
      
      validateAndWarn(validConfig);
      
      expect(consoleSpy).toHaveBeenCalledWith('Configuration validation warnings:');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('timeWindowSeconds: Time window is very short')
      );
    });

    it('should not log when no warnings', () => {
      // Ensure no warnings by fixing the performance config inconsistency
      validConfig.performance.logSlowOperations = false;
      
      validateAndWarn(validConfig);
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});