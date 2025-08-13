import { Hono } from "hono";
import { createSuccessResponse, type ApiResponse } from "../types/index.js";


// Cloudflare Workers 环境变量接口
interface Env {
  APP_VERSION?: string;
  NODE_ENV?: string;
  BUILD_DATE?: string;
  GIT_COMMIT?: string;
  [key: string]: any;
}

// 健康检查响应接口
export interface HealthCheckResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: ServiceStatus[];
  system: SystemMetrics;
}

// 服务状态接口
export interface ServiceStatus {
  name: string;
  status: "up" | "down" | "degraded";
  responseTime?: number;
  lastCheck: string;
  details?: Record<string, any>;
}

// 系统指标接口
export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  runtime: {
    version: string;
    platform: string;
  };
  requests: {
    total: number;
    errors: number;
    averageResponseTime: number;
  };
}

// 应用启动时间
const startTime = Date.now();

// 模拟请求统计（在实际应用中应该使用持久化存储）
let requestStats = {
  total: 0,
  errors: 0,
  totalResponseTime: 0,
};

// 更新请求统计的工具函数
export function updateRequestStats(
  responseTime: number,
  isError: boolean = false
) {
  requestStats.total++;
  requestStats.totalResponseTime += responseTime;
  if (isError) {
    requestStats.errors++;
  }
}

// 获取系统指标
function getSystemMetrics(): SystemMetrics {
  // Cloudflare Workers 环境下的模拟内存使用情况
  const memoryUsage = {
    used: 0,
    rss: 50 * 1024 * 1024, // 模拟 50MB
    heapTotal: 40 * 1024 * 1024,
    heapUsed: 30 * 1024 * 1024,
    external: 5 * 1024 * 1024,
    arrayBuffers: 1 * 1024 * 1024,
  };

  return {
    memory: {
      used: memoryUsage.heapUsed || memoryUsage.used,
      total: memoryUsage.heapTotal || memoryUsage.rss,
      percentage: Math.round(
        ((memoryUsage.heapUsed || memoryUsage.used) /
          (memoryUsage.heapTotal || memoryUsage.rss)) *
          100
      ),
    },
    runtime: {
      version: "cloudflare-workers",
      platform: "cloudflare-workers",
    },
    requests: {
      total: requestStats.total,
      errors: requestStats.errors,
      averageResponseTime:
        requestStats.total > 0
          ? Math.round(requestStats.totalResponseTime / requestStats.total)
          : 0,
    },
  };
}

// 检查外部服务状态（模拟）
async function checkExternalServices(): Promise<ServiceStatus[]> {
  const services: ServiceStatus[] = [];

  // 模拟数据库检查
  const dbCheckStart = Date.now();
  try {
    // 在实际应用中，这里会进行真实的数据库连接测试
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 50)); // 模拟延迟
    services.push({
      name: "database",
      status: "up",
      responseTime: Date.now() - dbCheckStart,
      lastCheck: new Date().toISOString(),
      details: {
        type: "postgresql",
        connections: 5,
        maxConnections: 100,
      },
    });
  } catch (error) {
    services.push({
      name: "database",
      status: "down",
      responseTime: Date.now() - dbCheckStart,
      lastCheck: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }

  // 模拟缓存服务检查
  const cacheCheckStart = Date.now();
  try {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
    services.push({
      name: "cache",
      status: "up",
      responseTime: Date.now() - cacheCheckStart,
      lastCheck: new Date().toISOString(),
      details: {
        type: "redis",
        memory: "45MB",
        keys: 1250,
      },
    });
  } catch (error) {
    services.push({
      name: "cache",
      status: "down",
      responseTime: Date.now() - cacheCheckStart,
      lastCheck: new Date().toISOString(),
      details: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }

  return services;
}

// 确定整体健康状态
function determineOverallStatus(
  services: ServiceStatus[]
): "healthy" | "unhealthy" | "degraded" {
  const downServices = services.filter((s) => s.status === "down");
  const degradedServices = services.filter((s) => s.status === "degraded");

  if (downServices.length > 0) {
    return "unhealthy";
  }

  if (degradedServices.length > 0) {
    return "degraded";
  }

  return "healthy";
}

/**
 * 创建健康检查路由
 */
export function createHealthRoutes(): Hono {
  const app = new Hono();

 

  // GET /health - 基础健康检查
  app.get("/", async (c) => {
    const services = await checkExternalServices();
    const systemMetrics = getSystemMetrics();
    const overallStatus = determineOverallStatus(services);
    const env = (c.env as Env) || {};

    const healthData: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION || "1.0.0",
      uptime: Date.now() - startTime,
      environment: env.NODE_ENV || "production",
      services,
      system: systemMetrics,
    };

    const response: ApiResponse<HealthCheckResponse> = createSuccessResponse(
      healthData,
      "Health check completed"
    );

    // 根据健康状态设置适当的 HTTP 状态码
    const statusCode =
      overallStatus === "healthy"
        ? 200
        : overallStatus === "degraded"
        ? 200
        : 503;

    return c.json(response, statusCode);
  });

  // GET /health/live - 存活性检查（简单检查）
  app.get("/live", async (c) => {
    const response: ApiResponse<{ status: string; timestamp: string }> =
      createSuccessResponse(
        {
          status: "alive",
          timestamp: new Date().toISOString(),
        },
        "Service is alive"
      );

    return c.json(response);
  });

  // GET /health/ready - 就绪性检查（检查依赖服务）
  app.get("/ready", async (c) => {
    const services = await checkExternalServices();
    const criticalServicesDown = services.filter(
      (s) => s.status === "down" && ["database"].includes(s.name)
    );

    const isReady = criticalServicesDown.length === 0;
    const status = isReady ? "ready" : "not_ready";

    const readyData = {
      status,
      timestamp: new Date().toISOString(),
      services: services.map((s) => ({
        name: s.name,
        status: s.status,
        critical: ["database"].includes(s.name),
      })),
    };

    const response: ApiResponse<typeof readyData> = createSuccessResponse(
      readyData,
      isReady ? "Service is ready" : "Service is not ready"
    );

    return c.json(response, isReady ? 200 : 503);
  });

  // GET /health/metrics - 详细系统指标
  app.get("/metrics", async (c) => {
    const systemMetrics = getSystemMetrics();
    const env = (c.env as Env) || {};

    const metricsData = {
      ...systemMetrics,
      uptime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION || "1.0.0",
    };

    const response: ApiResponse<typeof metricsData> = createSuccessResponse(
      metricsData,
      "System metrics retrieved"
    );

    return c.json(response);
  });

  // GET /health/version - 版本信息
  app.get("/version", async (c) => {
    const env = (c.env as Env) || {};

    const versionData = {
      version: env.APP_VERSION || "1.0.0",
      buildDate: env.BUILD_DATE || new Date().toISOString(),
      gitCommit: env.GIT_COMMIT || "unknown",
      environment: env.NODE_ENV || "production",
      runtime: {
        version: "cloudflare-workers",
        platform: "cloudflare-workers",
      },
    };

    const response: ApiResponse<typeof versionData> = createSuccessResponse(
      versionData,
      "Version information retrieved"
    );

    return c.json(response);
  });

  return app;
}
