/**
 * 签名认证启动检查系统
 */

import type { SignatureAuthConfig } from "./config.js";
import { SignatureAuthConfigError, createConfigLogger } from "./config.js";
import { ConfigValidator } from "./config-validator.js";

/**
 * 启动检查结果接口
 */
export interface StartupCheckResult {
  /** 检查名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** 错误信息 */
  error?: string;
  /** 检查耗时（毫秒） */
  duration: number;
  /** 详细信息 */
  details?: Record<string, any>;
}

/**
 * 启动检查摘要接口
 */
export interface StartupCheckSummary {
  /** 总检查数 */
  totalChecks: number;
  /** 通过的检查数 */
  passedChecks: number;
  /** 失败的检查数 */
  failedChecks: number;
  /** 总耗时（毫秒） */
  totalDuration: number;
  /** 是否全部通过 */
  allPassed: boolean;
  /** 检查结果列表 */
  results: StartupCheckResult[];
}

/**
 * 启动检查器类
 */
export class StartupChecker {
  private config: SignatureAuthConfig;
  private logger: ReturnType<typeof createConfigLogger>;

  constructor(config: SignatureAuthConfig) {
    this.config = config;
    this.logger = createConfigLogger(config);
  }

  /**
   * 执行所有启动检查（不抛出错误，返回摘要）
   */
  async performAllChecksWithoutThrow(): Promise<StartupCheckSummary> {
    if (!this.config.startupCheck.enabled) {
      this.logger.info("Startup checks are disabled, skipping...");
      return {
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        totalDuration: 0,
        allPassed: true,
        results: [],
      };
    }

    this.logger.info("Starting signature authentication startup checks...");
    const startTime = Date.now();

    const checks: Array<() => Promise<StartupCheckResult>> = [];

    // 添加配置验证检查
    checks.push(() => this.checkConfigurationValidation());

    // 添加密钥配置检查
    if (this.config.startupCheck.checkKeyConfiguration) {
      checks.push(() => this.checkKeyConfiguration());
    }

    // 添加存储连接检查
    if (this.config.startupCheck.checkStorageConnection) {
      checks.push(() => this.checkStorageConnection());
    }

    // 添加算法支持检查
    if (this.config.startupCheck.validateAlgorithmSupport) {
      checks.push(() => this.checkAlgorithmSupport());
    }

    // 添加环境一致性检查
    checks.push(() => this.checkEnvironmentConsistency());

    // 添加性能基准检查
    if (this.config.performance.enabled) {
      checks.push(() => this.checkPerformanceBenchmark());
    }

    // 执行所有检查
    const results = await Promise.all(
      checks.map(async (check) => {
        try {
          return await check();
        } catch (error) {
          return {
            name: "Unknown Check",
            passed: false,
            error: error instanceof Error ? error.message : String(error),
            duration: 0,
          };
        }
      })
    );

    const totalDuration = Date.now() - startTime;
    const passedChecks = results.filter((r) => r.passed).length;
    const failedChecks = results.length - passedChecks;
    const allPassed = failedChecks === 0;

    const summary: StartupCheckSummary = {
      totalChecks: results.length,
      passedChecks,
      failedChecks,
      totalDuration,
      allPassed,
      results,
    };

    // 记录检查结果
    this.logCheckSummary(summary);

    return summary;
  }

  /**
   * 执行所有启动检查（抛出错误版本）
   */
  async performAllChecks(): Promise<StartupCheckSummary> {
    const summary = await this.performAllChecksWithoutThrow();

    // 如果有失败的检查，抛出错误
    if (!summary.allPassed) {
      const failedCheckNames = summary.results
        .filter((r) => !r.passed)
        .map((r) => r.name)
        .join(", ");

      throw new SignatureAuthConfigError(
        `Startup checks failed: ${failedCheckNames}`,
        "startup_check",
        "STARTUP_CHECK_FAILED"
      );
    }

    return summary;
  }

  /**
   * 检查配置验证
   */
  private async checkConfigurationValidation(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      const result = ConfigValidator.validateSignatureAuthConfig(this.config);

      if (!result.isValid) {
        const errorMessages = result.errors.map((e) => e.message).join("; ");
        return {
          name: "Configuration Validation",
          passed: false,
          error: `Configuration validation failed: ${errorMessages}`,
          duration: Date.now() - startTime,
          details: {
            errors: result.errors,
            warnings: result.warnings,
          },
        };
      }

      return {
        name: "Configuration Validation",
        passed: true,
        duration: Date.now() - startTime,
        details: {
          warningsCount: result.warnings.length,
          warnings: result.warnings,
        },
      };
    } catch (error) {
      return {
        name: "Configuration Validation",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查密钥配置
   */
  private async checkKeyConfiguration(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      const details: Record<string, any> = {
        storageType: this.config.keyStorageType,
        enabled: this.config.enabled,
      };

      if (!this.config.enabled) {
        return {
          name: "Key Configuration",
          passed: true,
          duration: Date.now() - startTime,
          details: { ...details, reason: "Signature auth is disabled" },
        };
      }

      // 检查环境变量密钥配置
      if (this.config.keyStorageType === "env") {
        const keyEnvVars = Object.keys(process.env).filter(
          (key) =>
            key.includes("PUBLIC_KEY") ||
            key.includes("PRIVATE_KEY") ||
            (key.includes("APP_") &&
              (key.includes("KEY") || key.includes("ALGORITHM")))
        );

        details.foundKeyEnvVars = keyEnvVars.length;
        details.keyEnvVars = keyEnvVars;

        if (keyEnvVars.length === 0) {
          return {
            name: "Key Configuration",
            passed: false,
            error: "No key configuration found in environment variables",
            duration: Date.now() - startTime,
            details,
          };
        }

        // 检查是否有基本的应用配置
        const appConfigVars = keyEnvVars.filter((key) =>
          key.startsWith("APP_")
        );
        if (appConfigVars.length === 0) {
          return {
            name: "Key Configuration",
            passed: false,
            error:
              "No application key configuration found (APP_* environment variables)",
            duration: Date.now() - startTime,
            details,
          };
        }

        details.appConfigVars = appConfigVars;
      }

      // 检查 KV 存储配置
      if (this.config.keyStorageType === "kv") {
        if (!this.config.kvNamespace) {
          return {
            name: "Key Configuration",
            passed: false,
            error: "KV namespace is required for KV storage",
            duration: Date.now() - startTime,
            details,
          };
        }

        details.kvNamespace = this.config.kvNamespace;
      }

      return {
        name: "Key Configuration",
        passed: true,
        duration: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        name: "Key Configuration",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查存储连接
   */
  private async checkStorageConnection(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      const details: Record<string, any> = {
        storageType: this.config.keyStorageType,
      };

      switch (this.config.keyStorageType) {
        case "env":
          // 环境变量存储不需要连接检查
          return {
            name: "Storage Connection",
            passed: true,
            duration: Date.now() - startTime,
            details: {
              ...details,
              reason: "Environment storage does not require connection",
            },
          };

        case "memory":
          // 内存存储不需要连接检查
          return {
            name: "Storage Connection",
            passed: true,
            duration: Date.now() - startTime,
            details: {
              ...details,
              reason: "Memory storage does not require connection",
            },
          };

        case "kv":
          // KV 存储连接检查
          if (!this.config.kvNamespace) {
            return {
              name: "Storage Connection",
              passed: false,
              error: "KV namespace not configured",
              duration: Date.now() - startTime,
              details,
            };
          }

          // 这里应该检查 KV 存储的实际连接
          // 由于这是启动检查，我们只验证配置的完整性
          details.kvNamespace = this.config.kvNamespace;
          details.kvAvailable = typeof (globalThis as any).KV !== "undefined";

          return {
            name: "Storage Connection",
            passed: true,
            duration: Date.now() - startTime,
            details,
          };

        default:
          return {
            name: "Storage Connection",
            passed: false,
            error: `Unknown storage type: ${this.config.keyStorageType}`,
            duration: Date.now() - startTime,
            details,
          };
      }
    } catch (error) {
      return {
        name: "Storage Connection",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查算法支持
   */
  private async checkAlgorithmSupport(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      const supportedAlgorithms = ["RS256", "RS512", "ES256", "ES512"];
      const unsupportedAlgorithms = this.config.algorithms.filter(
        (alg) => !supportedAlgorithms.includes(alg)
      );

      const details: Record<string, any> = {
        configuredAlgorithms: this.config.algorithms,
        supportedAlgorithms,
        unsupportedAlgorithms,
      };

      if (unsupportedAlgorithms.length > 0) {
        return {
          name: "Algorithm Support",
          passed: false,
          error: `Unsupported algorithms: ${unsupportedAlgorithms.join(", ")}`,
          duration: Date.now() - startTime,
          details,
        };
      }

      // 检查 Web Crypto API 支持
      const cryptoAvailable =
        typeof globalThis.crypto !== "undefined" &&
        typeof globalThis.crypto.subtle !== "undefined";

      details.cryptoApiAvailable = cryptoAvailable;

      if (!cryptoAvailable) {
        return {
          name: "Algorithm Support",
          passed: false,
          error: "Web Crypto API is not available",
          duration: Date.now() - startTime,
          details,
        };
      }

      return {
        name: "Algorithm Support",
        passed: true,
        duration: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        name: "Algorithm Support",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查环境一致性
   */
  private async checkEnvironmentConsistency(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      const issues: string[] = [];
      const details: Record<string, any> = {};

      // 检查生产环境配置
      const isProduction = process.env.NODE_ENV === "production";
      details.isProduction = isProduction;

      if (isProduction) {
        // 生产环境应该启用签名认证
        if (!this.config.enabled) {
          issues.push(
            "Signature authentication should be enabled in production"
          );
        }

        // 生产环境不应该启用调试模式
        if (this.config.debug) {
          issues.push("Debug mode should be disabled in production");
        }

        // 生产环境日志级别不应该是 debug
        if (this.config.logging.level === "debug") {
          issues.push("Log level should not be debug in production");
        }

        // 生产环境不应该记录敏感数据
        if (this.config.errorHandling.logSensitiveData) {
          issues.push(
            "Sensitive data logging should be disabled in production"
          );
        }

        // 生产环境应该使用 KV 存储
        if (this.config.keyStorageType === "memory") {
          issues.push("Memory storage is not recommended for production");
        }
      }

      // 检查开发环境配置
      if (!isProduction) {
        details.isDevelopment = true;

        // 开发环境可以有更宽松的配置
        if (this.config.timeWindowSeconds < 60) {
          issues.push(
            "Time window is very short, may cause issues during development"
          );
        }
      }

      details.issues = issues;

      if (issues.length > 0) {
        return {
          name: "Environment Consistency",
          passed: false,
          error: `Environment consistency issues: ${issues.join("; ")}`,
          duration: Date.now() - startTime,
          details,
        };
      }

      return {
        name: "Environment Consistency",
        passed: true,
        duration: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        name: "Environment Consistency",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 检查性能基准
   */
  private async checkPerformanceBenchmark(): Promise<StartupCheckResult> {
    const startTime = Date.now();

    try {
      // 执行简单的性能基准测试
      const benchmarkStart = Date.now();

      // 模拟签名验证操作
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        // 简单的计算操作来模拟签名验证
        const data = `test-data-${i}`;
        const hash = await globalThis.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(data)
        );
      }

      const benchmarkDuration = Date.now() - benchmarkStart;
      const averageTime = benchmarkDuration / iterations;

      const details = {
        iterations,
        totalBenchmarkTime: benchmarkDuration,
        averageTimePerOperation: averageTime,
        performanceThreshold: this.config.performance.thresholdMs,
      };

      // 检查是否超过性能阈值
      if (averageTime > this.config.performance.thresholdMs) {
        return {
          name: "Performance Benchmark",
          passed: false,
          error: `Average operation time (${averageTime.toFixed(
            2
          )}ms) exceeds threshold (${this.config.performance.thresholdMs}ms)`,
          duration: Date.now() - startTime,
          details,
        };
      }

      return {
        name: "Performance Benchmark",
        passed: true,
        duration: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        name: "Performance Benchmark",
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 记录检查摘要
   */
  private logCheckSummary(summary: StartupCheckSummary): void {
    if (summary.allPassed) {
      this.logger.info(
        `✅ All startup checks passed (${summary.passedChecks}/${summary.totalChecks}) in ${summary.totalDuration}ms`
      );
    } else {
      this.logger.error(
        `❌ Startup checks failed (${summary.passedChecks}/${summary.totalChecks} passed) in ${summary.totalDuration}ms`
      );
    }

    // 记录详细结果
    if (this.config.logging.verbose || !summary.allPassed) {
      summary.results.forEach((result) => {
        const status = result.passed ? "✅" : "❌";
        const message = `${status} ${result.name} (${result.duration}ms)`;

        if (result.passed) {
          this.logger.debug(message, result.details);
        } else {
          this.logger.error(`${message}: ${result.error}`, undefined, result.details);
        }
      });
    }
  }
}

/**
 * 便捷函数：执行启动检查（不抛出错误）
 */
export async function performStartupChecks(
  config: SignatureAuthConfig
): Promise<StartupCheckSummary> {
  const checker = new StartupChecker(config);
  return await checker.performAllChecksWithoutThrow();
}

/**
 * 便捷函数：执行启动检查并抛出错误
 */
export async function performStartupChecksAndThrow(
  config: SignatureAuthConfig
): Promise<void> {
  const summary = await performStartupChecks(config);

  if (!summary.allPassed) {
    const failedChecks = summary.results
      .filter((r) => !r.passed)
      .map((r) => `${r.name}: ${r.error}`)
      .join("; ");

    throw new SignatureAuthConfigError(
      `Startup checks failed: ${failedChecks}`,
      "startup_check",
      "STARTUP_CHECK_FAILED"
    );
  }
}
