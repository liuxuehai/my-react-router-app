/**
 * 中间件配置管理系统
 * 支持运行时配置修改和热重载
 */

import type { Context, Next } from "hono";
import type { CorsOptions } from "../middleware/cors.js";
import type { LoggerOptions } from "../middleware/logger.js";
import type { ErrorHandlerConfig } from "../middleware/error-handler.js";
import type { SignatureAuthOptions } from "../middleware/signature-auth.js";
import type { SignatureAuthFactoryOptions } from "../middleware/signature-auth-factory.js";
import { cors } from "../middleware/cors.js";
import { logger } from "../middleware/logger.js";
import { createErrorHandler } from "../middleware/error-handler.js";
import { createSignatureAuthMiddleware } from "../middleware/signature-auth-factory.js";
import type { ApiConfig } from "./index.js";

/**
 * 中间件类型枚举
 */
export enum MiddlewareType {
  CORS = "cors",
  LOGGER = "logger",
  ERROR_HANDLER = "errorHandler",
  VALIDATION = "validation",
  RATE_LIMIT = "rateLimit",
  AUTH = "auth",
  SIGNATURE_AUTH = "signatureAuth",
}

/**
 * 中间件配置接口
 */
export interface MiddlewareConfig {
  /** 中间件名称 */
  name: string;
  /** 中间件类型 */
  type: MiddlewareType;
  /** 是否启用 */
  enabled: boolean;
  /** 执行顺序（数字越小越先执行） */
  order: number;
  /** 中间件配置选项 */
  options: Record<string, any>;
  /** 应用路径模式（可选，默认应用到所有路径） */
  pathPattern?: string | RegExp;
}

/**
 * 中间件工厂函数类型
 */
export type MiddlewareFactory = (
  options: any
) => (c: Context, next: Next) => Promise<Response | void>;

/**
 * 中间件注册表
 */
const middlewareRegistry = new Map<MiddlewareType, MiddlewareFactory>();

/**
 * 注册内置中间件
 */
function registerBuiltinMiddleware() {
  middlewareRegistry.set(MiddlewareType.CORS, cors);
  middlewareRegistry.set(MiddlewareType.LOGGER, logger);
  middlewareRegistry.set(MiddlewareType.ERROR_HANDLER, createErrorHandler);
  middlewareRegistry.set(MiddlewareType.SIGNATURE_AUTH, createSignatureAuthMiddleware);
}

// 初始化内置中间件
registerBuiltinMiddleware();

/**
 * 中间件配置管理器
 */
export class MiddlewareConfigManager {
  private configs: Map<string, MiddlewareConfig> = new Map();
  private instances: Map<
    string,
    (c: Context, next: Next) => Promise<Response | void>
  > = new Map();
  private changeListeners: Array<(config: MiddlewareConfig) => void> = [];

  constructor() {
    this.loadDefaultConfigs();
  }

  /**
   * 加载默认中间件配置
   */
  private loadDefaultConfigs(): void {
    const defaultConfigs: MiddlewareConfig[] = [
      {
        name: "errorHandler",
        type: MiddlewareType.ERROR_HANDLER,
        enabled: true,
        order: 0, // 错误处理器应该最先执行
        options: {
          showStack: false,
          logErrors: true,
        },
      },
      {
        name: "cors",
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {
          origin: "*",
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
          allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
          credentials: false,
          maxAge: 86400,
        },
      },
      {
        name: "logger",
        type: MiddlewareType.LOGGER,
        enabled: true,
        order: 20,
        options: {
          level: "info",
          enabled: true,
          includeRequestBody: false,
          includeResponseBody: false,
          maxBodyLength: 1000,
        },
      },
      {
        name: "signatureAuth",
        type: MiddlewareType.SIGNATURE_AUTH,
        enabled: false, // 默认禁用，通过 API 配置启用
        order: 15, // 在 CORS 之后，Logger 之前
        options: {
          timeWindowSeconds: 300,
          debug: false,
          skipPaths: ['/api/health', '/api/docs'],
          algorithms: ['RS256', 'ES256'],
          keyStorageType: 'env',
        },
      },
    ];

    defaultConfigs.forEach((config) => {
      this.configs.set(config.name, config);
    });
  }

  /**
   * 从 API 配置更新中间件配置
   */
  updateFromApiConfig(apiConfig: ApiConfig): void {
    // 更新 CORS 配置
    const corsConfig = this.configs.get("cors");
    if (corsConfig) {
      corsConfig.options = {
        origin: apiConfig.cors.origin,
        methods: apiConfig.cors.methods,
        allowedHeaders: apiConfig.cors.headers,
        credentials: apiConfig.cors.credentials,
        maxAge: apiConfig.cors.maxAge,
      };
      this.updateMiddleware("cors", corsConfig);
    }

    // 更新日志配置
    const loggerConfig = this.configs.get("logger");
    if (loggerConfig) {
      loggerConfig.enabled = apiConfig.logging.enabled;
      loggerConfig.options = {
        level: apiConfig.logging.level,
        enabled: apiConfig.logging.enabled,
        includeRequestBody: apiConfig.logging.logRequestBody,
        includeResponseBody: apiConfig.logging.logResponseBody,
        maxBodyLength: 1000,
      };
      this.updateMiddleware("logger", loggerConfig);
    }

    // 更新错误处理配置
    const errorConfig = this.configs.get("errorHandler");
    if (errorConfig) {
      errorConfig.options = {
        showStack: apiConfig.logging.showErrorDetails,
        logErrors: true,
      };
      this.updateMiddleware("errorHandler", errorConfig);
    }

    // 更新签名认证配置
    const signatureAuthConfig = this.configs.get("signatureAuth");
    if (signatureAuthConfig) {
      signatureAuthConfig.enabled = apiConfig.security.signatureAuth.enabled;
      signatureAuthConfig.options = {
        timeWindowSeconds: apiConfig.security.signatureAuth.timeWindowSeconds,
        debug: apiConfig.security.signatureAuth.debug,
        skipPaths: apiConfig.security.signatureAuth.skipPaths,
        algorithms: apiConfig.security.signatureAuth.algorithms,
        keyStorageType: apiConfig.security.signatureAuth.keyStorageType,
        kvNamespace: apiConfig.security.signatureAuth.kvNamespace,
      };
      this.updateMiddleware("signatureAuth", signatureAuthConfig);
    }
  }

  /**
   * 注册自定义中间件工厂
   */
  registerMiddleware(type: MiddlewareType, factory: MiddlewareFactory): void {
    middlewareRegistry.set(type, factory);
  }

  /**
   * 添加中间件配置
   */
  addMiddleware(config: MiddlewareConfig): void {
    this.validateConfig(config);
    this.configs.set(config.name, config);
    this.createMiddlewareInstance(config);
    this.notifyChange(config);
  }

  /**
   * 更新中间件配置
   */
  updateMiddleware(name: string, config: Partial<MiddlewareConfig>): void {
    const existingConfig = this.configs.get(name);
    if (!existingConfig) {
      throw new Error(`Middleware '${name}' not found`);
    }

    const updatedConfig = { ...existingConfig, ...config };
    this.validateConfig(updatedConfig);

    this.configs.set(name, updatedConfig);
    this.createMiddlewareInstance(updatedConfig);
    this.notifyChange(updatedConfig);
  }

  /**
   * 删除中间件配置
   */
  removeMiddleware(name: string): void {
    if (!this.configs.has(name)) {
      throw new Error(`Middleware '${name}' not found`);
    }

    this.configs.delete(name);
    this.instances.delete(name);
  }

  /**
   * 启用/禁用中间件
   */
  toggleMiddleware(name: string, enabled: boolean): void {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`Middleware '${name}' not found`);
    }

    config.enabled = enabled;
    this.createMiddlewareInstance(config);
    this.notifyChange(config);
  }

  /**
   * 获取中间件配置
   */
  getConfig(name: string): MiddlewareConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * 获取所有中间件配置
   */
  getAllConfigs(): MiddlewareConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * 获取启用的中间件实例（按执行顺序排序）
   */
  getEnabledMiddleware(): Array<
    (c: Context, next: Next) => Promise<Response | void>
  > {
    return Array.from(this.configs.values())
      .filter((config) => config.enabled)
      .sort((a, b) => a.order - b.order)
      .map((config) => this.instances.get(config.name))
      .filter(Boolean) as Array<
      (c: Context, next: Next) => Promise<Response | void>
    >;
  }

  /**
   * 添加配置变更监听器
   */
  onConfigChange(listener: (config: MiddlewareConfig) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   */
  removeConfigChangeListener(
    listener: (config: MiddlewareConfig) => void
  ): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /**
   * 验证中间件配置
   */
  private validateConfig(config: MiddlewareConfig): void {
    if (!config.name || typeof config.name !== "string") {
      throw new Error("Middleware name is required and must be a string");
    }

    if (!Object.values(MiddlewareType).includes(config.type)) {
      throw new Error(`Invalid middleware type: ${config.type}`);
    }

    if (typeof config.enabled !== "boolean") {
      throw new Error("Middleware enabled flag must be a boolean");
    }

    if (typeof config.order !== "number" || config.order < 0) {
      throw new Error("Middleware order must be a non-negative number");
    }

    if (!middlewareRegistry.has(config.type)) {
      throw new Error(`Middleware factory not found for type: ${config.type}`);
    }
  }

  /**
   * 创建中间件实例
   */
  private createMiddlewareInstance(config: MiddlewareConfig): void {
    if (!config.enabled) {
      this.instances.delete(config.name);
      return;
    }

    const factory = middlewareRegistry.get(config.type);
    if (!factory) {
      throw new Error(`Middleware factory not found for type: ${config.type}`);
    }

    try {
      const middleware = factory(config.options);

      // 如果配置了路径模式，包装中间件以支持路径匹配
      if (config.pathPattern) {
        const wrappedMiddleware = this.wrapWithPathPattern(
          middleware,
          config.pathPattern
        );
        this.instances.set(config.name, wrappedMiddleware);
      } else {
        this.instances.set(config.name, middleware);
      }
    } catch (error) {
      throw new Error(`Failed to create middleware '${config.name}': ${error}`);
    }
  }

  /**
   * 包装中间件以支持路径模式匹配
   */
  private wrapWithPathPattern(
    middleware: (c: Context, next: Next) => Promise<Response | void>,
    pathPattern: string | RegExp
  ): (c: Context, next: Next) => Promise<Response | void> {
    return async (c: Context, next: Next) => {
      const path = new URL(c.req.url).pathname;

      let matches = false;
      if (typeof pathPattern === "string") {
        matches = path.startsWith(pathPattern);
      } else if (pathPattern instanceof RegExp) {
        matches = pathPattern.test(path);
      }

      if (matches) {
        return await middleware(c, next);
      } else {
        await next();
      }
    };
  }

  /**
   * 通知配置变更
   */
  private notifyChange(config: MiddlewareConfig): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener(config);
      } catch (error) {
        console.error("Error in middleware config change listener:", error);
      }
    });
  }

  /**
   * 导出配置为 JSON
   */
  exportConfig(): string {
    const configs = Array.from(this.configs.values());
    return JSON.stringify(configs, null, 2);
  }

  /**
   * 从 JSON 导入配置
   */
  importConfig(json: string): void {
    try {
      const configs: MiddlewareConfig[] = JSON.parse(json);

      // 验证所有配置
      configs.forEach((config) => this.validateConfig(config));

      // 清空现有配置
      this.configs.clear();
      this.instances.clear();

      // 添加新配置
      configs.forEach((config) => {
        this.configs.set(config.name, config);
        this.createMiddlewareInstance(config);
      });

      // 通知所有配置变更
      configs.forEach((config) => this.notifyChange(config));
    } catch (error) {
      throw new Error(`Failed to import middleware config: ${error}`);
    }
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults(): void {
    this.configs.clear();
    this.instances.clear();
    this.loadDefaultConfigs();

    // 重新创建所有中间件实例
    this.configs.forEach((config) => {
      this.createMiddlewareInstance(config);
    });
  }
}

/**
 * 全局中间件配置管理器实例
 */
export const middlewareConfigManager = new MiddlewareConfigManager();

/**
 * 便捷函数：获取配置好的中间件数组
 */
export function getConfiguredMiddleware(): Array<
  (c: Context, next: Next) => Promise<Response | void>
> {
  return middlewareConfigManager.getEnabledMiddleware();
}

/**
 * 便捷函数：从 API 配置更新中间件
 */
export function updateMiddlewareFromApiConfig(apiConfig: ApiConfig): void {
  middlewareConfigManager.updateFromApiConfig(apiConfig);
}

/**
 * 便捷函数：添加自定义中间件
 */
export function addCustomMiddleware(config: MiddlewareConfig): void {
  middlewareConfigManager.addMiddleware(config);
}

/**
 * 便捷函数：更新中间件配置
 */
export function updateMiddlewareConfig(
  name: string,
  config: Partial<MiddlewareConfig>
): void {
  middlewareConfigManager.updateMiddleware(name, config);
}

/**
 * 中间件配置验证错误类
 */
export class MiddlewareConfigError extends Error {
  constructor(message: string, public middlewareName?: string) {
    super(message);
    this.name = "MiddlewareConfigError";
  }
}

/**
 * 导出类型
 */
export type {
  CorsOptions,
  LoggerOptions,
  ErrorHandlerConfig,
  SignatureAuthOptions,
  SignatureAuthFactoryOptions,
};
