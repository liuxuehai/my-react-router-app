import { createRequestHandler } from "react-router";
import { createConfiguredHonoApp } from "../app/api/hono-app.js";

/**
 * 路由分发器配置接口
 */
export interface RouteDispatcherConfig {
  /** API 路径前缀 */
  apiPrefix: string;
  /** 是否启用详细日志 */
  enableLogging: boolean;
}

/**
 * 默认路由分发器配置
 */
export const defaultDispatcherConfig: RouteDispatcherConfig = {
  apiPrefix: "/api",
  enableLogging: true,
};

/**
 * 创建路由分发器
 * @param config - 分发器配置
 * @returns 路由分发函数
 */
export function createRouteDispatcher(
  config: Partial<RouteDispatcherConfig> = {}
) {
  const dispatcherConfig = { ...defaultDispatcherConfig, ...config };

  // 创建 React Router 请求处理器
  const reactRouterHandler = createRequestHandler(
    () => import("virtual:react-router/server-build"),
    import.meta.env.MODE
  );

  // 创建 Hono 应用实例（延迟初始化）
  let honoApp: ReturnType<typeof createConfiguredHonoApp> | null = null;

  /**
   * 获取或创建 Hono 应用实例
   * @param env - 环境变量
   * @returns Hono 应用实例
   */
  function getHonoApp(env: Env) {
    if (!honoApp) {
      honoApp = createConfiguredHonoApp(env);
    }
    return honoApp;
  }

  /**
   * 判断请求是否为 API 请求
   * @param request - 请求对象
   * @returns 是否为 API 请求
   */
  function isApiRequest(request: Request): boolean {
    const url = new URL(request.url);
    return url.pathname.startsWith(dispatcherConfig.apiPrefix);
  }

  /**
   * 记录请求日志
   * @param request - 请求对象
   * @param type - 请求类型
   */
  function logRequest(request: Request, type: "api" | "frontend") {
    if (dispatcherConfig.enableLogging) {
      const url = new URL(request.url);
      console.log(
        `[Route Dispatcher] ${type.toUpperCase()} request: ${request.method} ${
          url.pathname
        }`
      );
    }
  }

  /**
   * 处理 API 请求
   * @param request - 请求对象
   * @param env - 环境变量
   * @param ctx - 执行上下文
   * @returns API 响应
   */
  async function handleApiRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      logRequest(request, "api");
      const app = getHonoApp(env);
      return await app.fetch(request, env, ctx);
    } catch (error) {
      console.error("[Route Dispatcher] API request error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Internal server error occurred while processing API request",
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  /**
   * 处理前端请求
   * @param request - 请求对象
   * @param env - 环境变量
   * @param ctx - 执行上下文
   * @returns 前端响应
   */
  async function handleFrontendRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      logRequest(request, "frontend");
      return await reactRouterHandler(request, {
        cloudflare: { env, ctx },
      });
    } catch (error) {
      console.error("[Route Dispatcher] Frontend request error:", error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
  }

  /**
   * 主路由分发函数
   * @param request - 请求对象
   * @param env - 环境变量
   * @param ctx - 执行上下文
   * @returns 响应
   */
  return async function dispatch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      // 根据请求路径判断处理方式
      if (isApiRequest(request)) {
        return await handleApiRequest(request, env, ctx);
      } else {
        return await handleFrontendRequest(request, env, ctx);
      }
    } catch (error) {
      console.error("[Route Dispatcher] Dispatch error:", error);

      // 返回通用错误响应
      const isApi = isApiRequest(request);
      if (isApi) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "DISPATCH_ERROR",
              message: "An error occurred while dispatching the request",
            },
            meta: {
              timestamp: new Date().toISOString(),
            },
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        return new Response("Internal Server Error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }
    }
  };
}
