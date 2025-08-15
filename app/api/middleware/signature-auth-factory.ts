import type { Context, Next } from "hono";
import { signatureAuth, type SignatureAuthOptions } from "./signature-auth.js";
import { createKeyManager } from "../auth/key-manager.js";
import type { KeyManager } from "../auth/types.js";

/**
 * 签名认证中间件工厂配置
 */
export interface SignatureAuthFactoryOptions {
  /** 时间窗口（秒），默认300秒（5分钟） */
  timeWindowSeconds?: number;
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 跳过验证的路径模式 */
  skipPaths?: (string | RegExp)[];
  /** 支持的签名算法 */
  algorithms?: string[];
  /** 密钥存储类型 */
  keyStorageType?: 'env' | 'kv' | 'memory';
  /** KV 命名空间（当使用 KV 存储时） */
  kvNamespace?: string;
  /** 自定义密钥管理器实例 */
  keyManager?: KeyManager;
}

/**
 * 全局密钥管理器实例缓存
 */
let globalKeyManager: KeyManager | null = null;

/**
 * 获取或创建密钥管理器实例
 */
async function getKeyManager(options: SignatureAuthFactoryOptions, env?: any): Promise<KeyManager> {
  // 如果提供了自定义密钥管理器，直接使用
  if (options.keyManager) {
    return options.keyManager;
  }

  // 如果已有全局实例，复用
  if (globalKeyManager) {
    return globalKeyManager;
  }

  // 创建新的密钥管理器实例
  const keyManagerOptions = {
    storageType: options.keyStorageType || 'env',
    cacheExpiry: 300, // 5 minutes default
    enableCache: true,
    debug: options.debug || false,
  };

  globalKeyManager = createKeyManager(keyManagerOptions, env);
  return globalKeyManager;
}

/**
 * 签名认证中间件工厂函数
 * 这个工厂函数符合中间件配置系统的 MiddlewareFactory 接口
 */
export function createSignatureAuthMiddleware(
  options: SignatureAuthFactoryOptions = {}
) {
  return async (c: Context, next: Next) => {
    try {
      // 获取 Cloudflare Worker 环境变量
      const env = c.env;
      
      // 获取或创建密钥管理器
      const keyManager = await getKeyManager(options, env);

      // 创建签名认证中间件配置
      const signatureAuthOptions: SignatureAuthOptions = {
        keyManager,
        timeWindowSeconds: options.timeWindowSeconds || 300,
        debug: options.debug || false,
        skipPaths: options.skipPaths || [],
      };

      // 创建并执行签名认证中间件
      const middleware = signatureAuth(signatureAuthOptions);
      return await middleware(c, next);
    } catch (error) {
      console.error('[SignatureAuthFactory] Failed to create middleware:', error);
      
      // 在生产环境中，如果签名认证配置失败，应该拒绝请求
      if (c.env?.NODE_ENV === 'production') {
        return c.json(
          {
            success: false,
            error: {
              code: 'SIGNATURE_AUTH_CONFIG_ERROR',
              message: 'Signature authentication configuration error',
            },
          },
          500
        );
      }
      
      // 在开发环境中，记录错误但继续执行
      console.warn('[SignatureAuthFactory] Continuing without signature auth due to configuration error');
      await next();
    }
  };
}

/**
 * 重置全局密钥管理器（主要用于测试）
 */
export function resetGlobalKeyManager(): void {
  globalKeyManager = null;
}

/**
 * 设置全局密钥管理器（主要用于测试和自定义配置）
 */
export function setGlobalKeyManager(keyManager: KeyManager): void {
  globalKeyManager = keyManager;
}