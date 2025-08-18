import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { KeyManager } from "../auth/types.js";
import {
  SignatureAuthError,
  signatureAuth,
  type SignatureAuthOptions,
} from "./signature-auth.js";
import {
  RouteAuthConfigManager,
  type GlobalRouteAuthConfig,
  type RouteAuthInfo,
  createDefaultRouteAuthConfig,
} from "../auth/route-config.js";

export interface RouteSignatureAuthOptions
  extends Omit<SignatureAuthOptions, "skipPaths"> {
  /** 路由认证配置 */
  routeConfig?: GlobalRouteAuthConfig;
  /** 路由配置管理器实例（如果提供，将忽略 routeConfig） */
  routeConfigManager?: RouteAuthConfigManager;
  /** 当路由不需要认证时是否跳过所有验证 */
  skipUnauthenticatedRoutes?: boolean;
  /** 自定义路由信息处理器 */
  onRouteInfo?: (routeInfo: RouteAuthInfo, c: Context) => void | Promise<void>;
  /** 自定义权限拒绝处理器 */
  onPermissionDenied?: (
    appId: string,
    path: string,
    method: string,
    c: Context
  ) => Response | Promise<Response>;
}

/**
 * 带路由级别控制的签名认证中间件
 */
export function routeSignatureAuth(options: RouteSignatureAuthOptions) {
  // 创建路由配置管理器
  const routeConfigManager =
    options.routeConfigManager ||
    new RouteAuthConfigManager(
      options.routeConfig || createDefaultRouteAuthConfig()
    );

  // 创建基础签名认证中间件
  const baseSignatureAuth = signatureAuth({
    ...options,
    skipPaths: [], // 我们将通过路由配置来控制跳过逻辑
  });

  return async (c: Context, next: Next) => {
    const path = c.req.path;
    const method = c.req.method;

    try {
      // 获取路由认证信息
      const routeInfo = routeConfigManager.getRouteAuthInfo(path, method);

      // 调用路由信息处理器
      if (options.onRouteInfo) {
        await options.onRouteInfo(routeInfo, c);
      }

      if (options.debug) {
        console.log(`[RouteSignatureAuth] Route info for ${method} ${path}:`, {
          requiresAuth: routeInfo.requiresAuth,
          isPublic: routeInfo.isPublic,
          isProtected: routeInfo.isProtected,
          matchedRoute: routeInfo.matchedRoute,
        });
      }

      // 如果路由不需要认证，根据配置决定是否跳过
      if (!routeInfo.requiresAuth) {
        if (options.skipUnauthenticatedRoutes) {
          if (options.debug) {
            console.log(
              `[RouteSignatureAuth] Skipping authentication for public route: ${path}`
            );
          }
          await next();
          return;
        } else {
          // 即使不需要认证，也可能需要验证签名（如果提供了签名头）
          const hasSignatureHeaders =
            c.req.header("X-Signature") &&
            c.req.header("X-Timestamp") &&
            c.req.header("X-App-Id");

          if (!hasSignatureHeaders) {
            if (options.debug) {
              console.log(
                `[RouteSignatureAuth] No signature headers found for public route: ${path}`
              );
            }
            await next();
            return;
          }
        }
      }

      // 执行基础签名认证
      await baseSignatureAuth(c, async () => {
        // 签名验证通过后，检查应用级别的路由权限
        const signatureAuth = c.get("signatureAuth");
        if (signatureAuth && signatureAuth.appId) {
          const hasPermission = await routeConfigManager.checkAppPermission(
            signatureAuth.appId,
            path,
            method
          );

          if (!hasPermission) {
            if (options.debug) {
              console.log(
                `[RouteSignatureAuth] Permission denied for app ${signatureAuth.appId} on ${method} ${path}`
              );
            }

            // 使用自定义权限拒绝处理器
            if (options.onPermissionDenied) {
              await options.onPermissionDenied(
                signatureAuth.appId,
                path,
                method,
                c
              );
              return; // Don't continue to next()
            }

            // 默认权限拒绝响应
            throw new HTTPException(403, {
              message: `App ${signatureAuth.appId} does not have permission to access ${method} ${path}`,
              cause: {
                appId: signatureAuth.appId,
                path,
                method,
                routeInfo,
              },
            });
          }

          if (options.debug) {
            console.log(
              `[RouteSignatureAuth] Permission granted for app ${signatureAuth.appId} on ${method} ${path}`
            );
          }

          // 将路由信息添加到上下文
          c.set("routeAuth", {
            ...routeInfo,
            appId: signatureAuth.appId,
            permissionGranted: true,
          });
        }

        await next();
      });
    } catch (error) {
      if (options.debug) {
        console.error(
          `[RouteSignatureAuth] Error processing ${method} ${path}:`,
          error
        );
      }
      throw error;
    }
  };
}

/**
 * 创建路由签名认证中间件的便捷函数
 */
export function createRouteSignatureAuth(
  keyManager: KeyManager,
  options: Omit<RouteSignatureAuthOptions, "keyManager"> = {}
) {
  return routeSignatureAuth({
    keyManager,
    ...options,
  });
}

/**
 * 路由认证中间件工厂，用于与现有中间件系统集成
 */
export interface RouteSignatureAuthFactoryOptions {
  /** 时间窗口（秒），默认300秒（5分钟） */
  timeWindowSeconds?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 支持的签名算法 */
  algorithms?: string[];
  /** 密钥存储类型 */
  keyStorageType?: "env" | "kv" | "memory";
  /** KV 命名空间（当使用 KV 存储时） */
  kvNamespace?: string;
  /** 自定义密钥管理器实例 */
  keyManager?: KeyManager;
  /** 路由认证配置 */
  routeConfig?: GlobalRouteAuthConfig;
  /** 当路由不需要认证时是否跳过所有验证 */
  skipUnauthenticatedRoutes?: boolean;
}

/**
 * 路由签名认证中间件工厂函数
 */
export function createRouteSignatureAuthMiddleware(
  options: RouteSignatureAuthFactoryOptions = {}
) {
  return async (c: Context, next: Next) => {
    try {
      // 动态导入以避免循环依赖
      const { createKeyManager } = await import("../auth/key-manager.js");

      // 获取或创建密钥管理器
      const keyManager =
        options.keyManager ||
        createKeyManager(
          {
            storageType: options.keyStorageType || "env",
            cacheExpiry: 300,
            enableCache: true,
            debug: options.debug || false,
          },
          c.env
        );

      // 创建路由签名认证中间件配置
      const routeSignatureAuthOptions: RouteSignatureAuthOptions = {
        keyManager,
        timeWindowSeconds: options.timeWindowSeconds || 300,
        debug: options.debug || false,
        routeConfig: options.routeConfig,
        skipUnauthenticatedRoutes: options.skipUnauthenticatedRoutes ?? true,
        onRouteInfo: options.debug
          ? (routeInfo, c) => {
              console.log(
                `[RouteSignatureAuthFactory] Route info for ${c.req.method} ${c.req.path}:`,
                routeInfo
              );
            }
          : undefined,
        onPermissionDenied: async (appId, path, method, c) => {
          return c.json(
            {
              success: false,
              error: {
                code: "PERMISSION_DENIED",
                message: `App ${appId} does not have permission to access ${method} ${path}`,
                details: {
                  appId,
                  path,
                  method,
                },
              },
              meta: {
                timestamp: new Date().toISOString(),
                requestId: c.req.header("x-request-id") || "unknown",
              },
            },
            403
          );
        },
      };

      // 创建并执行路由签名认证中间件
      const middleware = routeSignatureAuth(routeSignatureAuthOptions);
      return await middleware(c, next);
    } catch (error) {
      console.error(
        "[RouteSignatureAuthFactory] Failed to create middleware:",
        error
      );

      // 在生产环境中，如果签名认证配置失败，应该拒绝请求
      if (c.env?.NODE_ENV === "production") {
        return c.json(
          {
            success: false,
            error: {
              code: "ROUTE_SIGNATURE_AUTH_CONFIG_ERROR",
              message: "Route signature authentication configuration error",
            },
          },
          500
        );
      }

      // 在开发环境中，记录错误但继续执行
      console.warn(
        "[RouteSignatureAuthFactory] Continuing without route signature auth due to configuration error"
      );
      await next();
    }
  };
}

/**
 * 获取当前请求的路由认证信息
 */
export function getRouteAuthInfo(
  c: Context
): (RouteAuthInfo & { appId?: string; permissionGranted?: boolean }) | null {
  return c.get("routeAuth") || null;
}

/**
 * 检查当前请求是否已通过路由认证
 */
export function isRouteAuthenticated(c: Context): boolean {
  const routeAuth = getRouteAuthInfo(c);
  return routeAuth?.permissionGranted === true;
}

/**
 * 获取当前请求的应用 ID（如果已认证）
 */
export function getAuthenticatedAppId(c: Context): string | null {
  const routeAuth = getRouteAuthInfo(c);
  return routeAuth?.appId || null;
}
