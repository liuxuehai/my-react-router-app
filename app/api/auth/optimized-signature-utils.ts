/**
 * 优化的签名工具类 - 包含性能优化和缓存机制
 * Optimized signature utilities with performance enhancements and caching
 */

import {
  SignatureUtils,
  type SignatureData,
  type SupportedAlgorithm,
} from "./signature-utils.js";
import { PublicKeyCache, type CacheStats } from "./performance-cache.js";

export interface PerformanceMetrics {
  /** 签名验证次数 */
  verificationCount: number;
  /** 平均验证时间（毫秒） */
  avgVerificationTime: number;
  /** 最快验证时间（毫秒） */
  minVerificationTime: number;
  /** 最慢验证时间（毫秒） */
  maxVerificationTime: number;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 公钥解析次数 */
  keyParseCount: number;
  /** 平均公钥解析时间（毫秒） */
  avgKeyParseTime: number;
}

export interface OptimizedSignatureConfig {
  /** 是否启用公钥缓存 */
  enableKeyCache: boolean;
  /** 公钥缓存 TTL（秒） */
  keyCacheTTL: number;
  /** 最大缓存大小 */
  maxCacheSize: number;
  /** 是否启用性能监控 */
  enableMetrics: boolean;
  /** 是否启用快速失败模式 */
  enableFastFail: boolean;
}

/**
 * 优化的签名工具类
 */
export class OptimizedSignatureUtils {
  private static keyCache: PublicKeyCache;
  private static metrics = {
    verificationCount: 0,
    totalVerificationTime: 0,
    minVerificationTime: Infinity,
    maxVerificationTime: 0,
    keyParseCount: 0,
    totalKeyParseTime: 0,
  };
  private static config: OptimizedSignatureConfig = {
    enableKeyCache: true,
    keyCacheTTL: 3600, // 1 hour
    maxCacheSize: 1000,
    enableMetrics: true,
    enableFastFail: true,
  };

  /**
   * 初始化优化配置
   */
  static initialize(config: Partial<OptimizedSignatureConfig> = {}): void {
    this.config = { ...this.config, ...config };

    if (this.config.enableKeyCache) {
      this.keyCache = new PublicKeyCache({
        maxSize: this.config.maxCacheSize,
        defaultTTL: this.config.keyCacheTTL,
        enableLRU: true,
        cleanupInterval: 300000, // 5 minutes
        enableStats: this.config.enableMetrics,
      });
    }
  }

  /**
   * 优化的签名验证 - 包含缓存和性能监控
   */
  static async verifySignatureOptimized(
    data: string,
    signature: string,
    publicKey: string,
    algorithm: SupportedAlgorithm
  ): Promise<boolean> {
    const startTime = performance.now();

    try {
      // 快速失败检查
      if (this.config.enableFastFail) {
        if (!data || !signature || !publicKey || !algorithm) {
          return false;
        }

        if (!this.isSupportedAlgorithm(algorithm)) {
          return false;
        }
      }

      // 尝试从缓存获取公钥
      let keyData: CryptoKey;
      const keyId = this.generateKeyId(publicKey, algorithm);

      if (this.config.enableKeyCache && this.keyCache) {
        const cachedKey = this.keyCache.getPublicKey(keyId, algorithm);
        if (cachedKey) {
          keyData = cachedKey;
        } else {
          keyData = await this.importPublicKeyOptimized(
            publicKey,
            algorithm,
            keyId
          );
        }
      } else {
        keyData = await this.importPublicKeyOptimized(
          publicKey,
          algorithm,
          keyId
        );
      }

      // 准备数据
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // 验证签名
      const result = await crypto.subtle.verify(
        this.getAlgorithmParams(algorithm),
        keyData,
        signatureBuffer,
        dataBuffer
      );

      // 更新性能指标
      if (this.config.enableMetrics) {
        this.updateMetrics(startTime);
      }

      return result;
    } catch (error) {
      // 更新性能指标（即使失败也要记录）
      if (this.config.enableMetrics) {
        this.updateMetrics(startTime);
      }

      console.error("Optimized signature verification failed:", error);
      return false;
    }
  }

  /**
   * 批量验证签名 - 并发优化
   */
  static async verifySignaturesBatch(
    requests: Array<{
      data: string;
      signature: string;
      publicKey: string;
      algorithm: SupportedAlgorithm;
    }>
  ): Promise<boolean[]> {
    // 预加载所有需要的公钥
    const keyPromises = new Map<string, Promise<CryptoKey>>();

    for (const req of requests) {
      const keyId = this.generateKeyId(req.publicKey, req.algorithm);
      const cacheKey = `${keyId}:${req.algorithm}`;

      if (!keyPromises.has(cacheKey)) {
        if (this.config.enableKeyCache && this.keyCache) {
          const cachedKey = this.keyCache.getPublicKey(keyId, req.algorithm);
          if (cachedKey) {
            keyPromises.set(cacheKey, Promise.resolve(cachedKey));
          } else {
            keyPromises.set(
              cacheKey,
              this.importPublicKeyOptimized(req.publicKey, req.algorithm, keyId)
            );
          }
        } else {
          keyPromises.set(
            cacheKey,
            this.importPublicKeyOptimized(req.publicKey, req.algorithm, keyId)
          );
        }
      }
    }

    // 等待所有公钥加载完成
    const keyMap = new Map<string, CryptoKey>();
    for (const [cacheKey, keyPromise] of keyPromises) {
      try {
        keyMap.set(cacheKey, await keyPromise);
      } catch (error) {
        console.error(`Failed to load key ${cacheKey}:`, error);
      }
    }

    // 并发验证所有签名
    const verificationPromises = requests.map(async (req) => {
      try {
        const keyId = this.generateKeyId(req.publicKey, req.algorithm);
        const cacheKey = `${keyId}:${req.algorithm}`;
        const keyData = keyMap.get(cacheKey);

        if (!keyData) {
          return false;
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(req.data);
        const signatureBuffer = this.base64ToArrayBuffer(req.signature);

        return await crypto.subtle.verify(
          this.getAlgorithmParams(req.algorithm),
          keyData,
          signatureBuffer,
          dataBuffer
        );
      } catch (error) {
        console.error("Batch signature verification failed:", error);
        return false;
      }
    });

    return await Promise.all(verificationPromises);
  }

  /**
   * 优化的公钥导入 - 包含缓存
   */
  private static async importPublicKeyOptimized(
    publicKey: string,
    algorithm: SupportedAlgorithm,
    keyId: string
  ): Promise<CryptoKey> {
    const parseStartTime = performance.now();

    try {
      // 尝试从缓存获取清理后的 PEM
      let cleanKey: string;
      if (this.config.enableKeyCache && this.keyCache) {
        const cachedPEM = this.keyCache.getCleanedPEM(publicKey);
        if (cachedPEM) {
          cleanKey = cachedPEM;
        } else {
          cleanKey = this.cleanPEMKey(publicKey);
          this.keyCache.setCleanedPEM(publicKey, cleanKey);
        }
      } else {
        cleanKey = this.cleanPEMKey(publicKey);
      }

      const keyBuffer = this.base64ToArrayBuffer(cleanKey);
      const algorithmParams = this.getKeyImportParams(algorithm);

      const cryptoKey = await crypto.subtle.importKey(
        "spki",
        keyBuffer,
        algorithmParams,
        false,
        ["verify"]
      );

      // 缓存解析后的公钥
      if (this.config.enableKeyCache && this.keyCache) {
        this.keyCache.setPublicKey(keyId, algorithm, cryptoKey);
      }

      // 更新解析性能指标
      if (this.config.enableMetrics) {
        this.updateKeyParseMetrics(parseStartTime);
      }

      return cryptoKey;
    } catch (error) {
      // 更新解析性能指标（即使失败也要记录）
      if (this.config.enableMetrics) {
        this.updateKeyParseMetrics(parseStartTime);
      }
      throw error;
    }
  }

  /**
   * 清理 PEM 格式密钥
   */
  private static cleanPEMKey(publicKey: string): string {
    return publicKey
      .replace(/-----BEGIN.*?-----/g, "")
      .replace(/-----END.*?-----/g, "")
      .replace(/\s/g, "");
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 获取算法参数
   */
  private static getAlgorithmParams(
    algorithm: SupportedAlgorithm
  ): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
    switch (algorithm) {
      case "RS256":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        };
      case "RS512":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-512",
        };
      case "ES256":
        return {
          name: "ECDSA",
          hash: "SHA-256",
        };
      case "ES512":
        return {
          name: "ECDSA",
          hash: "SHA-512",
        };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 获取密钥导入参数
   */
  private static getKeyImportParams(
    algorithm: SupportedAlgorithm
  ): RsaHashedImportParams | EcKeyImportParams {
    switch (algorithm) {
      case "RS256":
      case "RS512":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: algorithm === "RS256" ? "SHA-256" : "SHA-512",
        };
      case "ES256":
        return {
          name: "ECDSA",
          namedCurve: "P-256",
        };
      case "ES512":
        return {
          name: "ECDSA",
          namedCurve: "P-521",
        };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 验证算法是否支持
   */
  private static isSupportedAlgorithm(
    algorithm: string
  ): algorithm is SupportedAlgorithm {
    const SUPPORTED_ALGORITHMS: SupportedAlgorithm[] = [
      "RS256",
      "RS512",
      "ES256",
      "ES512",
    ];
    return SUPPORTED_ALGORITHMS.includes(algorithm as SupportedAlgorithm);
  }

  /**
   * 生成密钥 ID
   */
  private static generateKeyId(publicKey: string, algorithm: string): string {
    // 使用公钥内容和算法生成唯一 ID
    const content = publicKey + algorithm;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return `key_${Math.abs(hash).toString(36)}`;
  }

  /**
   * 更新验证性能指标
   */
  private static updateMetrics(startTime: number): void {
    const duration = performance.now() - startTime;

    this.metrics.verificationCount++;
    this.metrics.totalVerificationTime += duration;
    this.metrics.minVerificationTime = Math.min(
      this.metrics.minVerificationTime,
      duration
    );
    this.metrics.maxVerificationTime = Math.max(
      this.metrics.maxVerificationTime,
      duration
    );
  }

  /**
   * 更新密钥解析性能指标
   */
  private static updateKeyParseMetrics(startTime: number): void {
    const duration = performance.now() - startTime;

    this.metrics.keyParseCount++;
    this.metrics.totalKeyParseTime += duration;
  }

  /**
   * 获取性能指标
   */
  static getPerformanceMetrics(): PerformanceMetrics {
    const avgVerificationTime =
      this.metrics.verificationCount > 0
        ? this.metrics.totalVerificationTime / this.metrics.verificationCount
        : 0;

    const avgKeyParseTime =
      this.metrics.keyParseCount > 0
        ? this.metrics.totalKeyParseTime / this.metrics.keyParseCount
        : 0;

    let cacheHitRate = 0;
    if (this.config.enableKeyCache && this.keyCache) {
      const cacheStats = this.keyCache.getStats();
      cacheHitRate = cacheStats.keyCache.hitRate;
    }

    return {
      verificationCount: this.metrics.verificationCount,
      avgVerificationTime,
      minVerificationTime:
        this.metrics.minVerificationTime === Infinity
          ? 0
          : this.metrics.minVerificationTime,
      maxVerificationTime: this.metrics.maxVerificationTime,
      cacheHitRate,
      keyParseCount: this.metrics.keyParseCount,
      avgKeyParseTime,
    };
  }

  /**
   * 获取缓存统计信息
   */
  static getCacheStats(): {
    keyCache: CacheStats;
    parseCache: CacheStats;
  } | null {
    if (!this.config.enableKeyCache || !this.keyCache) {
      return null;
    }
    return this.keyCache.getStats();
  }

  /**
   * 重置性能指标
   */
  static resetMetrics(): void {
    this.metrics = {
      verificationCount: 0,
      totalVerificationTime: 0,
      minVerificationTime: Infinity,
      maxVerificationTime: 0,
      keyParseCount: 0,
      totalKeyParseTime: 0,
    };

    if (this.config.enableKeyCache && this.keyCache) {
      this.keyCache.getStats(); // 这会重置内部统计
    }
  }

  /**
   * 预热缓存 - 预加载常用公钥
   */
  static async warmupCache(
    keys: Array<{ publicKey: string; algorithm: SupportedAlgorithm }>
  ): Promise<void> {
    if (!this.config.enableKeyCache || !this.keyCache) {
      return;
    }

    const promises = keys.map(async ({ publicKey, algorithm }) => {
      try {
        const keyId = this.generateKeyId(publicKey, algorithm);
        await this.importPublicKeyOptimized(publicKey, algorithm, keyId);
      } catch (error) {
        console.warn(`Failed to warmup key for algorithm ${algorithm}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 清理缓存
   */
  static clearCache(): void {
    if (this.config.enableKeyCache && this.keyCache) {
      this.keyCache.clear();
    }
  }

  /**
   * 销毁优化工具（清理资源）
   */
  static destroy(): void {
    if (this.config.enableKeyCache && this.keyCache) {
      this.keyCache.destroy();
    }
    this.resetMetrics();
  }

  /**
   * 获取当前配置
   */
  static getConfig(): OptimizedSignatureConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  static updateConfig(newConfig: Partial<OptimizedSignatureConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // 如果缓存配置发生变化，重新初始化
    if (
      oldConfig.enableKeyCache !== this.config.enableKeyCache ||
      oldConfig.maxCacheSize !== this.config.maxCacheSize ||
      oldConfig.keyCacheTTL !== this.config.keyCacheTTL
    ) {
      if (oldConfig.enableKeyCache && this.keyCache) {
        this.keyCache.destroy();
      }

      if (this.config.enableKeyCache) {
        this.keyCache = new PublicKeyCache({
          maxSize: this.config.maxCacheSize,
          defaultTTL: this.config.keyCacheTTL,
          enableLRU: true,
          cleanupInterval: 300000,
          enableStats: this.config.enableMetrics,
        });
      }
    }
  }
}

// 默认初始化
OptimizedSignatureUtils.initialize();
