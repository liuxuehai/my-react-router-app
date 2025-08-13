import { Hono } from "hono";
import { ApiException, ApiErrorCode } from "./types/index.js";
import { buildApiApp } from "./routes/index.js";
import {
  middlewareConfigManager,
  updateMiddlewareFromApiConfig,
  getConfiguredMiddleware,
  createApiConfig,
  type ApiConfig,
} from "./config/index.js";

/**
 * Hono 应用配置接口
 */
export interface HonoAppConfig {
  /** API 基础路径 */
  basePath: string;
  /** CORS 配置 */
  cors: {
    origin: string | string[];
    methods: string[];
    headers: string[];
  };
  /** 日志配置 */
  logging: {
    enabled: boolean;
    level: "debug" | "info" | "warn" | "error";
  };
}

/**
 * 默认 Hono 应用配置
 */
export const defaultHonoConfig: HonoAppConfig = {
  basePath: "/api",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers: ["Content-Type", "Authorization"],
  },
  logging: {
    enabled: true,
    level: "info",
  },
};

/**
 * 创建并配置 Hono 应用实例
 * @param apiConfig - API 配置，如果未提供则使用默认配置
 * @returns 配置好的 Hono 应用实例
 */
export function createHonoApp(apiConfig?: ApiConfig): Hono {
  // 创建 Hono 应用实例
  const app = new Hono();


  // 如果提供了 API 配置，更新中间件配置
  if (apiConfig) {
    updateMiddlewareFromApiConfig(apiConfig);
  }

  // 获取配置好的中间件并按顺序应用
  const configuredMiddleware = getConfiguredMiddleware();
  configuredMiddleware.forEach((middleware) => {
    app.use("*", middleware);
  });

  // 添加错误处理测试端点
  app.get("/test-error", (c) => {
    const errorType = c.req.query("type") || "generic";

    switch (errorType) {
      case "api":
        throw new ApiException(
          ApiErrorCode.BAD_REQUEST,
          "This is a test API error",
          400,
          { testField: "testValue" }
        );
      case "validation":
        throw new ApiException(
          ApiErrorCode.VALIDATION_ERROR,
          "Validation failed for test",
          422,
          { field: "email", value: "invalid-email" }
        );
      default:
        throw new Error("This is a generic test error");
    }
  });

  // 挂载所有注册的 API 路由
  const apiRoutes = buildApiApp();
  app.route("/api", apiRoutes);
  return app;
}

/**
 * 获取应用配置的工具函数
 * @param env - 环境变量对象
 * @returns 根据环境变量生成的配置
 */
export function getHonoConfigFromEnv(
  env: Record<string, any> = {}
): Partial<HonoAppConfig> {
  return {
    cors: {
      origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(",") : ["*"],
      methods: env.CORS_METHODS
        ? env.CORS_METHODS.split(",")
        : ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      headers: env.CORS_HEADERS
        ? env.CORS_HEADERS.split(",")
        : ["Content-Type", "Authorization"],
    },
    logging: {
      enabled: env.LOGGING_ENABLED !== "false",
      level: env.LOG_LEVEL || "info",
    },
  };
}

/**
 * 创建带有完整配置的 Hono 应用
 * @param env - 环境变量对象
 * @returns 配置好的 Hono 应用实例
 */
export function createConfiguredHonoApp(env: Record<string, any> = {}): Hono {
  // 从环境变量创建 API 配置
  const apiConfig = createApiConfig(env);

  // 使用配置创建 Hono 应用
  return createHonoApp(apiConfig);
}

/**
 * 热重载中间件配置
 * @param newConfig - 新的 API 配置
 */
export function reloadMiddlewareConfig(newConfig: ApiConfig): void {
  updateMiddlewareFromApiConfig(newConfig);
}

/**
 * 获取当前中间件配置状态
 */
export function getMiddlewareStatus() {
  return {
    configs: middlewareConfigManager.getAllConfigs(),
    enabledCount: middlewareConfigManager.getEnabledMiddleware().length,
  };
}
