/**
 * 签名认证配置验证工具
 */

import type { SignatureAuthConfig } from "./config.js";
import { SignatureAuthConfigError } from "./config.js";
import type { KeyManagerConfig } from "./types.js";

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 是否验证通过 */
  isValid: boolean;
  /** 错误信息列表 */
  errors: ValidationError[];
  /** 警告信息列表 */
  warnings: ValidationWarning[];
}

/**
 * 验证错误接口
 */
export interface ValidationError {
  /** 错误字段 */
  field: string;
  /** 错误消息 */
  message: string;
  /** 错误代码 */
  code: string;
  /** 当前值 */
  value?: any;
  /** 建议值 */
  suggestion?: any;
}

/**
 * 验证警告接口
 */
export interface ValidationWarning {
  /** 警告字段 */
  field: string;
  /** 警告消息 */
  message: string;
  /** 警告代码 */
  code: string;
  /** 当前值 */
  value?: any;
  /** 建议值 */
  suggestion?: any;
}

/**
 * 配置验证器类
 */
export class ConfigValidator {
  /**
   * 验证签名认证配置
   */
  static validateSignatureAuthConfig(
    config: SignatureAuthConfig
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 验证基本配置
    this.validateBasicConfig(config, errors, warnings);

    // 验证算法配置
    this.validateAlgorithmConfig(config, errors, warnings);

    // 验证存储配置
    this.validateStorageConfig(config, errors, warnings);

    // 验证日志配置
    this.validateLoggingConfig(config, errors, warnings);

    // 验证性能配置
    this.validatePerformanceConfig(config, errors, warnings);

    // 验证启动检查配置
    this.validateStartupCheckConfig(config, errors, warnings);

    // 验证错误处理配置
    this.validateErrorHandlingConfig(config, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证密钥管理器配置
   */
  static validateKeyManagerConfig(config: KeyManagerConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 验证存储类型
    const validStorageTypes = ["env", "memory", "kv"];
    if (!validStorageTypes.includes(config.storageType)) {
      errors.push({
        field: "storageType",
        message: `Invalid storage type: ${config.storageType}`,
        code: "INVALID_STORAGE_TYPE",
        value: config.storageType,
        suggestion: validStorageTypes,
      });
    }

    // 验证缓存过期时间
    if (config.cacheExpiry < 0) {
      errors.push({
        field: "cacheExpiry",
        message: "Cache expiry must be non-negative",
        code: "INVALID_CACHE_EXPIRY",
        value: config.cacheExpiry,
        suggestion: 300,
      });
    } else if (config.cacheExpiry > 3600) {
      warnings.push({
        field: "cacheExpiry",
        message: "Cache expiry is very long, consider reducing it",
        code: "LONG_CACHE_EXPIRY",
        value: config.cacheExpiry,
        suggestion: 300,
      });
    }

    // 验证缓存配置一致性
    if (!config.enableCache && config.cacheExpiry > 0) {
      warnings.push({
        field: "cacheExpiry",
        message: "Cache expiry is set but cache is disabled",
        code: "CACHE_CONFIG_INCONSISTENT",
        value: config.cacheExpiry,
        suggestion: 0,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证基本配置
   */
  private static validateBasicConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // 验证时间窗口
    if (config.timeWindowSeconds < 0) {
      errors.push({
        field: "timeWindowSeconds",
        message: "Time window cannot be negative",
        code: "NEGATIVE_TIME_WINDOW",
        value: config.timeWindowSeconds,
        suggestion: 300,
      });
    } else if (config.timeWindowSeconds > 3600) {
      errors.push({
        field: "timeWindowSeconds",
        message: "Time window cannot exceed 3600 seconds (1 hour)",
        code: "TIME_WINDOW_TOO_LARGE",
        value: config.timeWindowSeconds,
        suggestion: 3600,
      });
    } else if (config.timeWindowSeconds < 60) {
      warnings.push({
        field: "timeWindowSeconds",
        message:
          "Time window is very short, may cause issues with network latency",
        code: "SHORT_TIME_WINDOW",
        value: config.timeWindowSeconds,
        suggestion: 300,
      });
    }

    // 验证跳过路径
    if (!Array.isArray(config.skipPaths)) {
      errors.push({
        field: "skipPaths",
        message: "Skip paths must be an array",
        code: "INVALID_SKIP_PATHS_TYPE",
        value: typeof config.skipPaths,
        suggestion: [],
      });
    } else {
      // 检查路径格式
      config.skipPaths.forEach((path, index) => {
        if (typeof path !== "string") {
          errors.push({
            field: `skipPaths[${index}]`,
            message: "Skip path must be a string",
            code: "INVALID_SKIP_PATH_TYPE",
            value: typeof path,
            suggestion: "/api/path",
          });
        } else if (!path.startsWith("/")) {
          warnings.push({
            field: `skipPaths[${index}]`,
            message: 'Skip path should start with "/"',
            code: "SKIP_PATH_FORMAT",
            value: path,
            suggestion: `/${path}`,
          });
        }
      });
    }
  }

  /**
   * 验证算法配置
   */
  private static validateAlgorithmConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validAlgorithms = ["RS256", "RS512", "ES256", "ES512"];

    if (!Array.isArray(config.algorithms)) {
      errors.push({
        field: "algorithms",
        message: "Algorithms must be an array",
        code: "INVALID_ALGORITHMS_TYPE",
        value: typeof config.algorithms,
        suggestion: ["RS256", "ES256"],
      });
      return;
    }

    if (config.algorithms.length === 0) {
      errors.push({
        field: "algorithms",
        message: "At least one algorithm must be specified",
        code: "NO_ALGORITHMS",
        value: config.algorithms,
        suggestion: ["RS256", "ES256"],
      });
      return;
    }

    // 检查无效算法
    const invalidAlgorithms = config.algorithms.filter(
      (alg) => !validAlgorithms.includes(alg)
    );
    if (invalidAlgorithms.length > 0) {
      errors.push({
        field: "algorithms",
        message: `Invalid algorithms: ${invalidAlgorithms.join(", ")}`,
        code: "INVALID_ALGORITHMS",
        value: invalidAlgorithms,
        suggestion: validAlgorithms,
      });
    }

    // 安全建议
    if (
      config.algorithms.includes("RS256") &&
      !config.algorithms.includes("ES256")
    ) {
      warnings.push({
        field: "algorithms",
        message: "Consider adding ES256 for better performance",
        code: "ALGORITHM_PERFORMANCE_SUGGESTION",
        value: config.algorithms,
        suggestion: [...config.algorithms, "ES256"],
      });
    }

    // 检查过时算法
    const deprecatedAlgorithms = config.algorithms.filter(
      (alg) => alg === "RS512"
    );
    if (deprecatedAlgorithms.length > 0) {
      warnings.push({
        field: "algorithms",
        message: "RS512 is slower than RS256, consider using RS256 instead",
        code: "DEPRECATED_ALGORITHM",
        value: deprecatedAlgorithms,
        suggestion: config.algorithms.map((alg) =>
          alg === "RS512" ? "RS256" : alg
        ),
      });
    }
  }

  /**
   * 验证存储配置
   */
  private static validateStorageConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validStorageTypes = ["env", "kv", "memory"];

    if (!validStorageTypes.includes(config.keyStorageType)) {
      errors.push({
        field: "keyStorageType",
        message: `Invalid storage type: ${config.keyStorageType}`,
        code: "INVALID_STORAGE_TYPE",
        value: config.keyStorageType,
        suggestion: validStorageTypes,
      });
    }

    // KV 存储特定验证
    if (config.keyStorageType === "kv") {
      if (!config.kvNamespace) {
        errors.push({
          field: "kvNamespace",
          message: "KV namespace is required when using KV storage",
          code: "MISSING_KV_NAMESPACE",
          value: config.kvNamespace,
          suggestion: "SIGNATURE_KEYS",
        });
      } else if (config.kvNamespace.length < 3) {
        warnings.push({
          field: "kvNamespace",
          message: "KV namespace is very short",
          code: "SHORT_KV_NAMESPACE",
          value: config.kvNamespace,
          suggestion: "SIGNATURE_KEYS",
        });
      }
    }

    // 内存存储警告
    if (config.keyStorageType === "memory") {
      warnings.push({
        field: "keyStorageType",
        message:
          "Memory storage is not persistent and not recommended for production",
        code: "MEMORY_STORAGE_WARNING",
        value: config.keyStorageType,
        suggestion: "kv",
      });
    }
  }

  /**
   * 验证日志配置
   */
  private static validateLoggingConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validLogLevels = ["debug", "info", "warn", "error"];

    if (!validLogLevels.includes(config.logging.level)) {
      errors.push({
        field: "logging.level",
        message: `Invalid log level: ${config.logging.level}`,
        code: "INVALID_LOG_LEVEL",
        value: config.logging.level,
        suggestion: validLogLevels,
      });
    }

    // 生产环境日志级别建议
    if (config.logging.level === "debug" && !config.debug) {
      warnings.push({
        field: "logging.level",
        message: "Debug log level in production may impact performance",
        code: "DEBUG_LOG_LEVEL_WARNING",
        value: config.logging.level,
        suggestion: "info",
      });
    }

    // 详细日志警告
    if (config.logging.verbose && !config.debug) {
      warnings.push({
        field: "logging.verbose",
        message: "Verbose logging in production may impact performance",
        code: "VERBOSE_LOGGING_WARNING",
        value: config.logging.verbose,
        suggestion: false,
      });
    }
  }

  /**
   * 验证性能配置
   */
  private static validatePerformanceConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (config.performance.thresholdMs < 0) {
      errors.push({
        field: "performance.thresholdMs",
        message: "Performance threshold cannot be negative",
        code: "NEGATIVE_PERFORMANCE_THRESHOLD",
        value: config.performance.thresholdMs,
        suggestion: 100,
      });
    } else if (config.performance.thresholdMs > 10000) {
      errors.push({
        field: "performance.thresholdMs",
        message: "Performance threshold cannot exceed 10000 milliseconds",
        code: "PERFORMANCE_THRESHOLD_TOO_LARGE",
        value: config.performance.thresholdMs,
        suggestion: 1000,
      });
    } else if (config.performance.thresholdMs > 1000) {
      warnings.push({
        field: "performance.thresholdMs",
        message: "Performance threshold is very high",
        code: "HIGH_PERFORMANCE_THRESHOLD",
        value: config.performance.thresholdMs,
        suggestion: 100,
      });
    }

    // 性能监控一致性检查
    if (config.performance.logSlowOperations && !config.performance.enabled) {
      warnings.push({
        field: "performance.logSlowOperations",
        message:
          "Slow operation logging is enabled but performance monitoring is disabled",
        code: "PERFORMANCE_CONFIG_INCONSISTENT",
        value: config.performance.logSlowOperations,
        suggestion: false,
      });
    }
  }

  /**
   * 验证启动检查配置
   */
  private static validateStartupCheckConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // 启动检查一致性
    if (config.enabled && !config.startupCheck.enabled) {
      warnings.push({
        field: "startupCheck.enabled",
        message: "Signature auth is enabled but startup check is disabled",
        code: "STARTUP_CHECK_DISABLED_WARNING",
        value: config.startupCheck.enabled,
        suggestion: true,
      });
    }

    // 检查项一致性
    if (config.startupCheck.enabled) {
      if (!config.startupCheck.checkKeyConfiguration && config.enabled) {
        warnings.push({
          field: "startupCheck.checkKeyConfiguration",
          message:
            "Key configuration check is disabled but signature auth is enabled",
          code: "KEY_CHECK_DISABLED_WARNING",
          value: config.startupCheck.checkKeyConfiguration,
          suggestion: true,
        });
      }

      if (
        !config.startupCheck.checkStorageConnection &&
        config.keyStorageType === "kv"
      ) {
        warnings.push({
          field: "startupCheck.checkStorageConnection",
          message: "Storage connection check is disabled but using KV storage",
          code: "STORAGE_CHECK_DISABLED_WARNING",
          value: config.startupCheck.checkStorageConnection,
          suggestion: true,
        });
      }
    }
  }

  /**
   * 验证错误处理配置
   */
  private static validateErrorHandlingConfig(
    config: SignatureAuthConfig,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const validReportingLevels = ["minimal", "standard", "detailed"];

    if (!validReportingLevels.includes(config.errorHandling.reportingLevel)) {
      errors.push({
        field: "errorHandling.reportingLevel",
        message: `Invalid error reporting level: ${config.errorHandling.reportingLevel}`,
        code: "INVALID_ERROR_REPORTING_LEVEL",
        value: config.errorHandling.reportingLevel,
        suggestion: validReportingLevels,
      });
    }

    // 安全警告
    if (config.errorHandling.logSensitiveData) {
      warnings.push({
        field: "errorHandling.logSensitiveData",
        message: "Logging sensitive data may pose security risks",
        code: "SENSITIVE_DATA_LOGGING_WARNING",
        value: config.errorHandling.logSensitiveData,
        suggestion: false,
      });
    }

    if (config.errorHandling.includeStackTrace && !config.debug) {
      warnings.push({
        field: "errorHandling.includeStackTrace",
        message: "Stack traces in production may expose sensitive information",
        code: "STACK_TRACE_WARNING",
        value: config.errorHandling.includeStackTrace,
        suggestion: false,
      });
    }
  }

  /**
   * 生成验证报告
   */
  static generateValidationReport(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push("=== Configuration Validation Report ===");
    lines.push(`Status: ${result.isValid ? "✅ VALID" : "❌ INVALID"}`);
    lines.push("");

    if (result.errors.length > 0) {
      lines.push("🚨 ERRORS:");
      result.errors.forEach((error, index) => {
        lines.push(`  ${index + 1}. [${error.field}] ${error.message}`);
        if (error.value !== undefined) {
          lines.push(`     Current: ${JSON.stringify(error.value)}`);
        }
        if (error.suggestion !== undefined) {
          lines.push(`     Suggested: ${JSON.stringify(error.suggestion)}`);
        }
        lines.push("");
      });
    }

    if (result.warnings.length > 0) {
      lines.push("⚠️  WARNINGS:");
      result.warnings.forEach((warning, index) => {
        lines.push(`  ${index + 1}. [${warning.field}] ${warning.message}`);
        if (warning.value !== undefined) {
          lines.push(`     Current: ${JSON.stringify(warning.value)}`);
        }
        if (warning.suggestion !== undefined) {
          lines.push(`     Suggested: ${JSON.stringify(warning.suggestion)}`);
        }
        lines.push("");
      });
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      lines.push("✨ No issues found!");
    }

    return lines.join("\n");
  }
}

/**
 * 便捷函数：验证并抛出错误
 */
export function validateAndThrow(config: SignatureAuthConfig): void {
  const result = ConfigValidator.validateSignatureAuthConfig(config);

  if (!result.isValid) {
    const errorMessages = result.errors.map(
      (error) => `${error.field}: ${error.message}`
    );
    throw new SignatureAuthConfigError(
      `Configuration validation failed: ${errorMessages.join("; ")}`,
      "validation",
      "VALIDATION_FAILED"
    );
  }
}

/**
 * 便捷函数：验证并记录警告
 */
export function validateAndWarn(config: SignatureAuthConfig): ValidationResult {
  const result = ConfigValidator.validateSignatureAuthConfig(config);

  if (result.warnings.length > 0) {
    console.warn("Configuration validation warnings:");
    result.warnings.forEach((warning) => {
      console.warn(`  - ${warning.field}: ${warning.message}`);
    });
  }

  return result;
}
