import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import type { KeyManager } from "../auth/types.js";
import {
  SignatureUtils,
  type SignatureData,
  type SupportedAlgorithm,
} from "../auth/signature-utils.js";
import { OptimizedSignatureUtils } from "../auth/optimized-signature-utils.js";
import { globalPerformanceMonitor, performanceMonitor } from "../auth/performance-monitor.js";

export interface SignatureAuthOptions {
  /** 密钥管理器实例 */
  keyManager: KeyManager;
  /** 时间窗口（秒），默认300秒（5分钟） */
  timeWindowSeconds?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 跳过验证的路径模式 */
  skipPaths?: (string | RegExp)[];
  /** 自定义错误处理 */
  onError?: (
    error: SignatureAuthError,
    c: Context
  ) => Response | Promise<Response>;
  /** 是否启用性能优化 */
  enableOptimization?: boolean;
  /** 是否启用性能监控 */
  enablePerformanceMonitoring?: boolean;
}

export interface SignatureHeaders {
  /** 签名值 */
  signature: string;
  /** 时间戳 */
  timestamp: string;
  /** 应用ID */
  appId: string;
  /** 密钥ID（可选） */
  keyId?: string;
  /** 签名算法（可选，从密钥配置获取） */
  algorithm?: string;
}

export class SignatureAuthError extends Error {
  constructor(
    message: string,
    public code:
      | "MISSING_HEADERS"
      | "INVALID_TIMESTAMP"
      | "APP_NOT_FOUND"
      | "KEY_NOT_FOUND"
      | "SIGNATURE_INVALID"
      | "INTERNAL_ERROR",
    public statusCode: number = 401,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "SignatureAuthError";
  }
}

const defaultOptions: Partial<SignatureAuthOptions> = {
  timeWindowSeconds: 300,
  debug: false,
  skipPaths: [],
  enableOptimization: true,
  enablePerformanceMonitoring: true,
};

/**
 * 签名验证中间件
 * 验证请求的数字签名以确保请求的完整性和身份认证
 */
export function signatureAuth(options: SignatureAuthOptions) {
  const opts = { ...defaultOptions, ...options };

  // 初始化优化工具（如果启用）
  if (opts.enableOptimization) {
    OptimizedSignatureUtils.initialize({
      enableKeyCache: true,
      keyCacheTTL: 3600,
      maxCacheSize: 1000,
      enableMetrics: opts.enablePerformanceMonitoring || false,
      enableFastFail: true,
    });
  }

  return async (c: Context, next: Next) => {
    const startTime = opts.enablePerformanceMonitoring ? performance.now() : 0;
    
    try {
      // 检查是否跳过验证
      if (shouldSkipPath(c.req.path, opts.skipPaths || [])) {
        if (opts.debug) {
          console.log(
            `[SignatureAuth] Skipping verification for path: ${c.req.path}`
          );
        }
        await next();
        return;
      }

      // 提取签名相关的请求头
      const headers = extractSignatureHeaders(c);

      if (opts.debug) {
        console.log(
          `[SignatureAuth] Verifying signature for app: ${headers.appId}`
        );
      }

      // 验证应用是否存在且启用
      const isValidApp = await opts.keyManager.validateApp(headers.appId);
      if (!isValidApp) {
        throw new SignatureAuthError(
          `App ${headers.appId} not found or disabled`,
          "APP_NOT_FOUND",
          403,
          { appId: headers.appId }
        );
      }

      // 获取应用配置
      const appConfig = await opts.keyManager.getAppConfig(headers.appId);
      if (!appConfig) {
        throw new SignatureAuthError(
          `App configuration not found for ${headers.appId}`,
          "APP_NOT_FOUND",
          403,
          { appId: headers.appId }
        );
      }

      // 验证访问权限
      const clientIP = getClientIP(c);
      const hasAccess = await opts.keyManager.validateAccess(
        headers.appId,
        c.req.path,
        c.req.method,
        clientIP
      );

      if (!hasAccess) {
        throw new SignatureAuthError(
          `Access denied for app ${headers.appId} to path ${c.req.path}`,
          "APP_NOT_FOUND",
          403,
          { 
            appId: headers.appId, 
            path: c.req.path, 
            method: c.req.method,
            clientIP 
          }
        );
      }

      // 确定使用的密钥
      const keyId = headers.keyId || "default";
      const keyPair = appConfig.keyPairs.find((kp) => kp.keyId === keyId);

      if (!keyPair || !keyPair.enabled) {
        throw new SignatureAuthError(
          `Key ${keyId} not found or disabled for app ${headers.appId}`,
          "KEY_NOT_FOUND",
          403,
          { appId: headers.appId, keyId, availableKeys: appConfig.keyPairs.filter(kp => kp.enabled).map(kp => kp.keyId) }
        );
      }

      // 检查密钥是否过期
      if (keyPair.expiresAt && keyPair.expiresAt < new Date()) {
        throw new SignatureAuthError(
          `Key ${keyId} has expired for app ${headers.appId}`,
          "KEY_NOT_FOUND",
          403,
          { appId: headers.appId, keyId, expiresAt: keyPair.expiresAt }
        );
      }

      // 验证时间戳（使用应用自定义时间窗口或默认值）
      const timeWindow = appConfig.accessControl?.customTimeWindow || opts.timeWindowSeconds;
      if (
        !SignatureUtils.validateTimestamp(
          headers.timestamp,
          timeWindow
        )
      ) {
        throw new SignatureAuthError(
          "Request timestamp is outside allowed time window",
          "INVALID_TIMESTAMP",
          401,
          {
            timestamp: headers.timestamp,
            timeWindow,
            customTimeWindow: appConfig.accessControl?.customTimeWindow,
            currentTime: new Date().toISOString(),
          }
        );
      }

      // 构建签名数据
      const body = await getRequestBody(c);
      const signatureData: SignatureData = {
        timestamp: headers.timestamp,
        method: c.req.method,
        path: c.req.path,
        body,
        appId: headers.appId,
      };

      const dataString = SignatureUtils.buildSignatureString(signatureData);

      // 验证签名（使用优化版本或标准版本）
      let isValidSignature: boolean;
      if (opts.enableOptimization) {
        isValidSignature = await OptimizedSignatureUtils.verifySignatureOptimized(
          dataString,
          headers.signature,
          keyPair.publicKey,
          keyPair.algorithm
        );
      } else {
        isValidSignature = await SignatureUtils.verifySignature(
          dataString,
          headers.signature,
          keyPair.publicKey,
          keyPair.algorithm
        );
      }

      if (!isValidSignature) {
        throw new SignatureAuthError(
          "Invalid signature",
          "SIGNATURE_INVALID",
          401,
          {
            appId: headers.appId,
            keyId,
            algorithm: keyPair.algorithm,
          }
        );
      }

      if (opts.debug) {
        console.log(
          `[SignatureAuth] Signature verified successfully for app: ${headers.appId}`
        );
      }

      // 将验证信息添加到上下文中，供后续中间件使用
      c.set("signatureAuth", {
        appId: headers.appId,
        keyId,
        algorithm: keyPair.algorithm,
        timestamp: headers.timestamp,
        verified: true,
      });

      await next();

      // 记录成功的性能指标
      if (opts.enablePerformanceMonitoring) {
        const duration = performance.now() - startTime;
        globalPerformanceMonitor.recordTiming('signature_verification', duration, true, {
          appId: headers.appId,
          keyId,
          algorithm: keyPair.algorithm,
          optimized: opts.enableOptimization,
        });
      }
    } catch (error) {
      // 记录失败的性能指标
      if (opts.enablePerformanceMonitoring) {
        const duration = performance.now() - startTime;
        globalPerformanceMonitor.recordTiming('signature_verification', duration, false, {
          error: error instanceof Error ? error.message : 'Unknown error',
          optimized: opts.enableOptimization,
        });
      }

      if (opts.debug) {
        console.error("[SignatureAuth] Verification failed:", error);
      }

      // 使用自定义错误处理器
      if (opts.onError && error instanceof SignatureAuthError) {
        const response = await opts.onError(error, c);
        return response;
      }

      // 默认错误处理
      if (error instanceof SignatureAuthError) {
        throw new HTTPException(error.statusCode as any, {
          message: error.message,
          cause: error.details,
        });
      }

      // 未知错误
      throw new HTTPException(500, {
        message: "Internal server error during signature verification",
      });
    }
  };
}

/**
 * 从请求头中提取签名相关信息
 */
function extractSignatureHeaders(c: Context): SignatureHeaders {
  const signature = c.req.header("X-Signature");
  const timestamp = c.req.header("X-Timestamp");
  const appId = c.req.header("X-App-Id");
  const keyId = c.req.header("X-Key-Id");
  const algorithm = c.req.header("X-Algorithm");

  // 检查必需的请求头
  const missingHeaders: string[] = [];
  if (!signature) missingHeaders.push("X-Signature");
  if (!timestamp) missingHeaders.push("X-Timestamp");
  if (!appId) missingHeaders.push("X-App-Id");

  if (missingHeaders.length > 0) {
    throw new SignatureAuthError(
      `Missing required headers: ${missingHeaders.join(", ")}`,
      "MISSING_HEADERS",
      400,
      { missingHeaders }
    );
  }

  return {
    signature: signature!,
    timestamp: timestamp!,
    appId: appId!,
    keyId,
    algorithm,
  };
}

/**
 * 获取请求体内容
 */
async function getRequestBody(c: Context): Promise<string | undefined> {
  try {
    // 对于 GET 和 HEAD 请求，通常没有请求体
    if (c.req.method === "GET" || c.req.method === "HEAD") {
      return undefined;
    }

    // 尝试获取请求体
    const body = await c.req.text();
    return body || undefined;
  } catch (error) {
    // 如果无法读取请求体，返回 undefined
    return undefined;
  }
}

/**
 * 检查路径是否应该跳过验证
 */
function shouldSkipPath(path: string, skipPaths: (string | RegExp)[]): boolean {
  return skipPaths.some((pattern) => {
    if (typeof pattern === "string") {
      return path === pattern || path.startsWith(pattern);
    }
    if (pattern instanceof RegExp) {
      return pattern.test(path);
    }
    return false;
  });
}

/**
 * 获取客户端 IP 地址
 */
function getClientIP(c: Context): string | undefined {
  // 尝试从各种头部获取真实 IP
  const headers = [
    'CF-Connecting-IP', // Cloudflare
    'X-Forwarded-For',
    'X-Real-IP',
    'X-Client-IP',
    'X-Forwarded',
    'X-Cluster-Client-IP',
    'Forwarded-For',
    'Forwarded'
  ];

  for (const header of headers) {
    const value = c.req.header(header);
    if (value) {
      // X-Forwarded-For 可能包含多个 IP，取第一个
      const ip = value.split(',')[0].trim();
      if (ip && ip !== 'unknown') {
        return ip;
      }
    }
  }

  // 如果没有找到，返回 undefined
  return undefined;
}

/**
 * 创建签名验证中间件的便捷函数
 */
export function createSignatureAuth(
  keyManager: KeyManager,
  options: Omit<SignatureAuthOptions, "keyManager"> = {}
) {
  return signatureAuth({
    keyManager,
    ...options,
  });
}
