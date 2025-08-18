import type { KeyManagerConfig } from "./types.js";

/**
 * 签名认证相关的环境变量接口
 */
export interface SignatureAuthEnvironment {
  /** 密钥存储方式 */
  KEY_STORAGE_TYPE?: string;
  /** 缓存过期时间（秒） */
  KEY_CACHE_EXPIRY?: string;
  /** 是否启用缓存 */
  KEY_ENABLE_CACHE?: string;
  /** 调试模式 */
  SIGNATURE_DEBUG?: string;
  /** 签名认证是否启用 */
  SIGNATURE_AUTH_ENABLED?: string;
  /** 时间窗口容差（秒） */
  SIGNATURE_TIME_WINDOW?: string;
  /** 支持的签名算法 */
  SIGNATURE_ALGORITHMS?: string;
  /** 跳过验证的路径模式 */
  SIGNATURE_SKIP_PATHS?: string;
  /** KV 命名空间 */
  SIGNATURE_KV_NAMESPACE?: string;
  /** 日志级别 */
  SIGNATURE_LOG_LEVEL?: string;
  /** 是否记录详细日志 */
  SIGNATURE_VERBOSE_LOGGING?: string;
  /** 配置验证模式 */
  SIGNATURE_CONFIG_VALIDATION?: string;
  /** 启动时检查 */
  SIGNATURE_STARTUP_CHECK?: string;
  /** 性能监控 */
  SIGNATURE_PERFORMANCE_MONITORING?: string;
  /** 性能阈值（毫秒） */
  SIGNATURE_PERFORMANCE_THRESHOLD?: string;
  /** 是否记录慢操作 */
  SIGNATURE_LOG_SLOW_OPS?: string;
  /** 错误报告级别 */
  SIGNATURE_ERROR_REPORTING?: string;
  /** 是否包含堆栈跟踪 */
  SIGNATURE_INCLUDE_STACK_TRACE?: string;
  /** 是否记录敏感数据 */
  SIGNATURE_LOG_SENSITIVE_DATA?: string;
}

/**
 * 签名认证配置接口
 */
export interface SignatureAuthConfig {
  /** 是否启用签名认证 */
  enabled: boolean;
  /** 时间窗口容差（秒） */
  timeWindowSeconds: number;
  /** 支持的签名算法 */
  algorithms: ("RS256" | "RS512" | "ES256" | "ES512")[];
  /** 是否启用调试模式 */
  debug: boolean;
  /** 跳过验证的路径模式 */
  skipPaths: string[];
  /** 密钥存储类型 */
  keyStorageType: "env" | "kv" | "memory";
  /** KV 命名空间（当使用 KV 存储时） */
  kvNamespace?: string;
  /** 日志配置 */
  logging: {
    /** 日志级别 */
    level: "debug" | "info" | "warn" | "error";
    /** 是否启用详细日志 */
    verbose: boolean;
    /** 是否记录签名验证过程 */
    logVerificationProcess: boolean;
    /** 是否记录性能指标 */
    logPerformanceMetrics: boolean;
  };
  /** 验证配置 */
  validation: {
    /** 是否启用严格验证 */
    strict: boolean;
    /** 是否验证密钥格式 */
    validateKeyFormat: boolean;
    /** 是否验证算法兼容性 */
    validateAlgorithmCompatibility: boolean;
  };
  /** 启动检查配置 */
  startupCheck: {
    /** 是否启用启动检查 */
    enabled: boolean;
    /** 是否检查密钥配置 */
    checkKeyConfiguration: boolean;
    /** 是否检查存储连接 */
    checkStorageConnection: boolean;
    /** 是否验证算法支持 */
    validateAlgorithmSupport: boolean;
  };
  /** 性能监控配置 */
  performance: {
    /** 是否启用性能监控 */
    enabled: boolean;
    /** 性能阈值（毫秒） */
    thresholdMs: number;
    /** 是否记录慢查询 */
    logSlowOperations: boolean;
  };
  /** 错误处理配置 */
  errorHandling: {
    /** 错误报告级别 */
    reportingLevel: "minimal" | "standard" | "detailed";
    /** 是否包含堆栈跟踪 */
    includeStackTrace: boolean;
    /** 是否记录敏感信息 */
    logSensitiveData: boolean;
  };
}

/**
 * 配置验证错误类
 */
export class SignatureAuthConfigError extends Error {
  constructor(message: string, public field?: string, public code?: string) {
    super(message);
    this.name = "SignatureAuthConfigError";
  }
}

/**
 * 认证配置管理器
 */
export class AuthConfigManager {
  private static instance: AuthConfigManager | null = null;
  private config: SignatureAuthConfig | null = null;
  private keyManagerConfig: KeyManagerConfig | null = null;
  private configListeners: Array<(config: SignatureAuthConfig) => void> = [];

  /**
   * 获取单例实例
   */
  static getInstance(): AuthConfigManager {
    if (!this.instance) {
      this.instance = new AuthConfigManager();
    }
    return this.instance;
  }

  /**
   * 从环境变量加载签名认证配置
   */
  static loadSignatureAuthConfig(
    env: SignatureAuthEnvironment = {}
  ): SignatureAuthConfig {
    const config: SignatureAuthConfig = {
      enabled: this.parseBoolean(env.SIGNATURE_AUTH_ENABLED, false),
      timeWindowSeconds: this.parseNumber(env.SIGNATURE_TIME_WINDOW, 300),
      algorithms: this.parseAlgorithms(env.SIGNATURE_ALGORITHMS, [
        "RS256",
        "ES256",
      ]),
      debug: this.parseBoolean(env.SIGNATURE_DEBUG, false),
      skipPaths: this.parseStringArray(env.SIGNATURE_SKIP_PATHS, [
        "/api/health",
        "/api/docs",
      ]),
      keyStorageType: this.parseStorageType(env.KEY_STORAGE_TYPE),
      kvNamespace: env.SIGNATURE_KV_NAMESPACE,
      logging: {
        level: this.parseLogLevel(env.SIGNATURE_LOG_LEVEL, "info"),
        verbose: this.parseBoolean(env.SIGNATURE_VERBOSE_LOGGING, false),
        logVerificationProcess: this.parseBoolean(env.SIGNATURE_DEBUG, false),
        logPerformanceMetrics: this.parseBoolean(
          env.SIGNATURE_PERFORMANCE_MONITORING,
          false
        ),
      },
      validation: {
        strict: this.parseBoolean(env.SIGNATURE_CONFIG_VALIDATION, true),
        validateKeyFormat: true,
        validateAlgorithmCompatibility: true,
      },
      startupCheck: {
        enabled: this.parseBoolean(env.SIGNATURE_STARTUP_CHECK, true),
        checkKeyConfiguration: true,
        checkStorageConnection: true,
        validateAlgorithmSupport: true,
      },
      performance: {
        enabled: this.parseBoolean(env.SIGNATURE_PERFORMANCE_MONITORING, false),
        thresholdMs: this.parseNumber(env.SIGNATURE_PERFORMANCE_THRESHOLD, 100),
        logSlowOperations: this.parseBoolean(env.SIGNATURE_LOG_SLOW_OPS, true),
      },
      errorHandling: {
        reportingLevel: this.parseErrorReportingLevel(
          env.SIGNATURE_ERROR_REPORTING,
          "standard"
        ),
        includeStackTrace: this.parseBoolean(
          env.SIGNATURE_INCLUDE_STACK_TRACE,
          false
        ),
        logSensitiveData: this.parseBoolean(
          env.SIGNATURE_LOG_SENSITIVE_DATA,
          false
        ),
      },
    };

    return config;
  }

  /**
   * 从环境变量加载密钥管理器配置
   */
  static loadKeyManagerConfig(
    env: SignatureAuthEnvironment = {}
  ): KeyManagerConfig {
    return {
      storageType: this.parseStorageType(env.KEY_STORAGE_TYPE),
      cacheExpiry: this.parseNumber(env.KEY_CACHE_EXPIRY, 300),
      enableCache: this.parseBoolean(env.KEY_ENABLE_CACHE, true),
      debug: this.parseBoolean(env.SIGNATURE_DEBUG, false),
    };
  }

  /**
   * 验证签名认证配置
   */
  static validateSignatureAuthConfig(config: SignatureAuthConfig): void {
    const errors: string[] = [];

    // 验证时间窗口
    if (config.timeWindowSeconds < 0 || config.timeWindowSeconds > 3600) {
      errors.push("Time window must be between 0 and 3600 seconds");
    }

    // 验证算法
    const validAlgorithms = ["RS256", "RS512", "ES256", "ES512"];
    const invalidAlgorithms = config.algorithms.filter(
      (alg) => !validAlgorithms.includes(alg)
    );
    if (invalidAlgorithms.length > 0) {
      errors.push(
        `Invalid algorithms: ${invalidAlgorithms.join(
          ", "
        )}. Supported: ${validAlgorithms.join(", ")}`
      );
    }

    // 验证存储类型
    const validStorageTypes = ["env", "kv", "memory"];
    if (!validStorageTypes.includes(config.keyStorageType)) {
      errors.push(
        `Invalid storage type: ${
          config.keyStorageType
        }. Supported: ${validStorageTypes.join(", ")}`
      );
    }

    // 验证 KV 命名空间
    if (config.keyStorageType === "kv" && !config.kvNamespace) {
      errors.push("KV namespace is required when using KV storage");
    }

    // 验证跳过路径
    if (!Array.isArray(config.skipPaths)) {
      errors.push("Skip paths must be an array");
    }

    // 验证日志级别
    const validLogLevels = ["debug", "info", "warn", "error"];
    if (!validLogLevels.includes(config.logging.level)) {
      errors.push(
        `Invalid log level: ${
          config.logging.level
        }. Supported: ${validLogLevels.join(", ")}`
      );
    }

    // 验证性能阈值
    if (
      config.performance.thresholdMs < 0 ||
      config.performance.thresholdMs > 10000
    ) {
      errors.push(
        "Performance threshold must be between 0 and 10000 milliseconds"
      );
    }

    // 验证错误报告级别
    const validReportingLevels = ["minimal", "standard", "detailed"];
    if (!validReportingLevels.includes(config.errorHandling.reportingLevel)) {
      errors.push(
        `Invalid error reporting level: ${
          config.errorHandling.reportingLevel
        }. Supported: ${validReportingLevels.join(", ")}`
      );
    }

    if (errors.length > 0) {
      throw new SignatureAuthConfigError(
        `Configuration validation failed: ${errors.join("; ")}`,
        "validation",
        "VALIDATION_ERROR"
      );
    }
  }

  /**
   * 验证密钥管理器配置
   */
  static validateKeyManagerConfig(config: KeyManagerConfig): boolean {
    const validStorageTypes = ["env", "memory", "kv"];

    if (!validStorageTypes.includes(config.storageType)) {
      throw new Error(
        `Invalid storage type: ${
          config.storageType
        }. Supported types: ${validStorageTypes.join(", ")}`
      );
    }

    if (config.cacheExpiry < 0) {
      throw new Error("Cache expiry must be non-negative");
    }

    return true;
  }

  /**
   * 获取默认的签名认证配置
   */
  static getDefaultSignatureAuthConfig(): SignatureAuthConfig {
    return {
      enabled: false,
      timeWindowSeconds: 300,
      algorithms: ["RS256", "ES256"],
      debug: false,
      skipPaths: ["/api/health", "/api/docs"],
      keyStorageType: "env",
      logging: {
        level: "info",
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
        reportingLevel: "standard",
        includeStackTrace: false,
        logSensitiveData: false,
      },
    };
  }

  /**
   * 获取默认的密钥管理器配置
   */
  static getDefaultKeyManagerConfig(): KeyManagerConfig {
    return {
      storageType: "env",
      cacheExpiry: 300,
      enableCache: true,
      debug: false,
    };
  }

  /**
   * 初始化配置
   */
  initialize(env: SignatureAuthEnvironment = {}): SignatureAuthConfig {
    this.config = AuthConfigManager.loadSignatureAuthConfig(env);
    this.keyManagerConfig = AuthConfigManager.loadKeyManagerConfig(env);

    // 验证配置
    AuthConfigManager.validateSignatureAuthConfig(this.config);
    AuthConfigManager.validateKeyManagerConfig(this.keyManagerConfig);

    return this.config;
  }

  /**
   * 获取当前配置
   */
  getConfig(): SignatureAuthConfig {
    if (!this.config) {
      throw new SignatureAuthConfigError(
        "Configuration not initialized. Call initialize() first.",
        "initialization",
        "NOT_INITIALIZED"
      );
    }
    return this.config;
  }

  /**
   * 获取密钥管理器配置
   */
  getKeyManagerConfig(): KeyManagerConfig {
    if (!this.keyManagerConfig) {
      throw new SignatureAuthConfigError(
        "Key manager configuration not initialized. Call initialize() first.",
        "initialization",
        "NOT_INITIALIZED"
      );
    }
    return this.keyManagerConfig;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<SignatureAuthConfig>): void {
    if (!this.config) {
      throw new SignatureAuthConfigError(
        "Configuration not initialized. Call initialize() first.",
        "initialization",
        "NOT_INITIALIZED"
      );
    }

    const newConfig = { ...this.config, ...updates };
    AuthConfigManager.validateSignatureAuthConfig(newConfig);

    this.config = newConfig;
    this.notifyConfigChange(newConfig);
  }

  /**
   * 添加配置变更监听器
   */
  onConfigChange(listener: (config: SignatureAuthConfig) => void): void {
    this.configListeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   */
  removeConfigChangeListener(
    listener: (config: SignatureAuthConfig) => void
  ): void {
    const index = this.configListeners.indexOf(listener);
    if (index > -1) {
      this.configListeners.splice(index, 1);
    }
  }

  /**
   * 通知配置变更
   */
  private notifyConfigChange(config: SignatureAuthConfig): void {
    this.configListeners.forEach((listener) => {
      try {
        listener(config);
      } catch (error) {
        console.error("Error in config change listener:", error);
      }
    });
  }

  /**
   * 执行启动检查
   */
  async performStartupCheck(): Promise<void> {
    const config = this.getConfig();

    if (!config.startupCheck.enabled) {
      return;
    }

    const checks: Array<{ name: string; check: () => Promise<void> }> = [];

    if (config.startupCheck.checkKeyConfiguration) {
      checks.push({
        name: "Key Configuration",
        check: () => this.checkKeyConfiguration(),
      });
    }

    if (config.startupCheck.checkStorageConnection) {
      checks.push({
        name: "Storage Connection",
        check: () => this.checkStorageConnection(),
      });
    }

    if (config.startupCheck.validateAlgorithmSupport) {
      checks.push({
        name: "Algorithm Support",
        check: () => this.checkAlgorithmSupport(),
      });
    }

    const results = await Promise.allSettled(
      checks.map(async ({ name, check }) => {
        try {
          await check();
          return { name, success: true };
        } catch (error) {
          return { name, success: false, error };
        }
      })
    );

    const failures = results
      .map((result, index) => ({ ...checks[index], result }))
      .filter(
        ({ result }) => result.status === "rejected" || !result.value.success
      );

    if (failures.length > 0) {
      const errorMessages = failures.map(({ name, result }) => {
        const error =
          result.status === "rejected" ? result.reason : result.value.error;
        return `${name}: ${error.message || error}`;
      });

      throw new SignatureAuthConfigError(
        `Startup checks failed: ${errorMessages.join("; ")}`,
        "startup_check",
        "STARTUP_CHECK_FAILED"
      );
    }

    if (config.logging.verbose) {
      console.log("✅ All signature authentication startup checks passed");
    }
  }

  /**
   * 检查密钥配置
   */
  private async checkKeyConfiguration(): Promise<void> {
    const config = this.getConfig();

    // 检查是否有基本的密钥配置
    if (config.keyStorageType === "env") {
      // 检查环境变量中是否有密钥配置
      const hasKeyConfig = Object.keys(process.env).some(
        (key) => key.includes("PUBLIC_KEY") || key.includes("PRIVATE_KEY")
      );

      if (!hasKeyConfig && config.enabled) {
        throw new Error("No key configuration found in environment variables");
      }
    }
  }

  /**
   * 检查存储连接
   */
  private async checkStorageConnection(): Promise<void> {
    const config = this.getConfig();

    if (config.keyStorageType === "kv") {
      // 这里应该检查 KV 存储的连接
      // 由于这是启动检查，我们只验证配置的完整性
      if (!config.kvNamespace) {
        throw new Error("KV namespace not configured");
      }
    }
  }

  /**
   * 检查算法支持
   */
  private async checkAlgorithmSupport(): Promise<void> {
    const config = this.getConfig();
    const supportedAlgorithms = ["RS256", "RS512", "ES256", "ES512"];

    const unsupportedAlgorithms = config.algorithms.filter(
      (alg) => !supportedAlgorithms.includes(alg)
    );

    if (unsupportedAlgorithms.length > 0) {
      throw new Error(
        `Unsupported algorithms: ${unsupportedAlgorithms.join(", ")}`
      );
    }
  }

  /**
   * 获取配置摘要（用于日志记录）
   */
  getConfigSummary(): Record<string, any> {
    const config = this.getConfig();

    return {
      enabled: config.enabled,
      timeWindowSeconds: config.timeWindowSeconds,
      algorithms: config.algorithms,
      keyStorageType: config.keyStorageType,
      skipPathsCount: config.skipPaths.length,
      debugMode: config.debug,
      loggingLevel: config.logging.level,
      performanceMonitoring: config.performance.enabled,
      startupCheckEnabled: config.startupCheck.enabled,
    };
  }

  private static parseStorageType(value?: string): "env" | "memory" | "kv" {
    const validTypes = ["env", "memory", "kv"];
    const type = value?.toLowerCase();

    if (type && validTypes.includes(type)) {
      return type as "env" | "memory" | "kv";
    }

    return "env";
  }

  private static parseNumber(value?: string, defaultValue: number = 0): number {
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private static parseBoolean(
    value?: string,
    defaultValue: boolean = false
  ): boolean {
    if (value === undefined) return defaultValue;
    if (value === "") return false; // Empty string is falsy

    const lower = value.toLowerCase();
    return lower === "true" || lower === "1" || lower === "yes";
  }

  private static parseAlgorithms(
    value?: string,
    defaultValue: ("RS256" | "RS512" | "ES256" | "ES512")[] = ["RS256", "ES256"]
  ): ("RS256" | "RS512" | "ES256" | "ES512")[] {
    if (!value) return defaultValue;

    const algorithms = value.split(",").map((alg) => alg.trim().toUpperCase());
    const validAlgorithms = ["RS256", "RS512", "ES256", "ES512"];

    return algorithms.filter((alg) => validAlgorithms.includes(alg)) as (
      | "RS256"
      | "RS512"
      | "ES256"
      | "ES512"
    )[];
  }

  private static parseStringArray(
    value?: string,
    defaultValue: string[] = []
  ): string[] {
    if (!value) return defaultValue;

    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private static parseLogLevel(
    value?: string,
    defaultValue: "debug" | "info" | "warn" | "error" = "info"
  ): "debug" | "info" | "warn" | "error" {
    const validLevels = ["debug", "info", "warn", "error"];
    const level = value?.toLowerCase();

    if (level && validLevels.includes(level)) {
      return level as "debug" | "info" | "warn" | "error";
    }

    return defaultValue;
  }

  private static parseErrorReportingLevel(
    value?: string,
    defaultValue: "minimal" | "standard" | "detailed" = "standard"
  ): "minimal" | "standard" | "detailed" {
    const validLevels = ["minimal", "standard", "detailed"];
    const level = value?.toLowerCase();

    if (level && validLevels.includes(level)) {
      return level as "minimal" | "standard" | "detailed";
    }

    return defaultValue;
  }
}

/**
 * 配置日志记录器
 */
export class ConfigLogger {
  private config: SignatureAuthConfig;

  constructor(config: SignatureAuthConfig) {
    this.config = config;
  }

  debug(message: string, ...args: any[]): void {
    if (this.config.logging.level === "debug") {
      console.debug(`[SignatureAuth:DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (["debug", "info"].includes(this.config.logging.level)) {
      console.info(`[SignatureAuth:INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (["debug", "info", "warn"].includes(this.config.logging.level)) {
      console.warn(`[SignatureAuth:WARN] ${message}`, ...args);
    }
  }

  error(message: string, error?: Error, ...args: any[]): void {
    console.error(`[SignatureAuth:ERROR] ${message}`, error, ...args);
  }

  logVerificationProcess(step: string, details: Record<string, any>): void {
    if (this.config.logging.logVerificationProcess) {
      this.debug(`Verification step: ${step}`, details);
    }
  }

  logPerformanceMetric(
    operation: string,
    durationMs: number,
    details?: Record<string, any>
  ): void {
    if (this.config.logging.logPerformanceMetrics) {
      const message = `Performance: ${operation} took ${durationMs}ms`;

      if (
        this.config.performance.enabled &&
        durationMs > this.config.performance.thresholdMs
      ) {
        this.warn(
          `${message} (exceeded threshold of ${this.config.performance.thresholdMs}ms)`,
          details
        );
      } else {
        this.debug(message, details);
      }
    }
  }
}

/**
 * 便捷函数：从环境变量创建签名认证配置
 */
export function createSignatureAuthConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): SignatureAuthConfig {
  const config = AuthConfigManager.loadSignatureAuthConfig(env);
  AuthConfigManager.validateSignatureAuthConfig(config);
  return config;
}

/**
 * 便捷函数：从环境变量创建密钥管理器配置
 */
export function createKeyManagerConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): KeyManagerConfig {
  const config = AuthConfigManager.loadKeyManagerConfig(env);
  AuthConfigManager.validateKeyManagerConfig(config);
  return config;
}

/**
 * 便捷函数：初始化配置管理器
 */
export function initializeAuthConfig(
  env: Record<string, string | undefined> = process.env
): SignatureAuthConfig {
  const manager = AuthConfigManager.getInstance();
  return manager.initialize(env);
}

/**
 * 便捷函数：获取配置管理器实例
 */
export function getAuthConfigManager(): AuthConfigManager {
  return AuthConfigManager.getInstance();
}

/**
 * 便捷函数：创建配置日志记录器
 */
export function createConfigLogger(config?: SignatureAuthConfig): ConfigLogger {
  const actualConfig = config || AuthConfigManager.getInstance().getConfig();
  return new ConfigLogger(actualConfig);
}
