/**
 * 高性能缓存管理器
 * High-performance cache manager for signature authentication
 */

export interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 创建时间戳 */
  timestamp: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** 过期时间（可选） */
  expiresAt?: number;
}

export interface CacheStats {
  /** 缓存大小 */
  size: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 平均访问时间（毫秒） */
  avgAccessTime: number;
  /** 内存使用估算（字节） */
  memoryUsage: number;
}

export interface CacheConfig {
  /** 最大缓存条目数 */
  maxSize: number;
  /** 默认过期时间（秒） */
  defaultTTL: number;
  /** 是否启用 LRU 清理 */
  enableLRU: boolean;
  /** 清理间隔（毫秒） */
  cleanupInterval: number;
  /** 是否启用统计 */
  enableStats: boolean;
}

/**
 * 高性能 LRU 缓存实现
 */
export class PerformanceCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
    accessCount: 0,
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private config: CacheConfig) {
    if (config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | null {
    const startTime = performance.now();

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateAccessTime(startTime);
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (entry.expiresAt && entry.expiresAt < now) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateAccessTime(startTime);
      return null;
    }

    // 更新访问统计
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.hits++;
    this.updateAccessTime(startTime);

    return entry.data;
  }

  /**
   * 设置缓存项
   */
  set(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = ttl ? now + ttl * 1000 : 
                     this.config.defaultTTL > 0 ? now + this.config.defaultTTL * 1000 : 
                     undefined;

    // 如果缓存已满，执行 LRU 清理
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
      expiresAt,
    };

    this.cache.set(key, entry);
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 检查缓存项是否存在
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // 检查是否过期
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const avgAccessTime = this.stats.accessCount > 0 ? 
                         this.stats.totalAccessTime / this.stats.accessCount : 0;

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      avgAccessTime,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      totalAccessTime: 0,
      accessCount: 0,
    };
  }

  /**
   * 手动清理过期项
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * 获取所有缓存键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 销毁缓存（清理定时器）
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }

  /**
   * LRU 清理策略
   */
  private evictLRU(): void {
    if (!this.config.enableLRU || this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * 更新访问时间统计
   */
  private updateAccessTime(startTime: number): void {
    if (this.config.enableStats) {
      const accessTime = performance.now() - startTime;
      this.stats.totalAccessTime += accessTime;
      this.stats.accessCount++;
    }
  }

  /**
   * 估算内存使用量
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // 估算键的大小
      totalSize += key.length * 2; // UTF-16 字符
      
      // 估算数据的大小（简单估算）
      totalSize += JSON.stringify(entry.data).length * 2;
      
      // 估算元数据的大小
      totalSize += 64; // 时间戳、计数器等
    }

    return totalSize;
  }
}

/**
 * 公钥缓存管理器
 * 专门用于缓存解析后的公钥对象
 */
export class PublicKeyCache {
  private keyCache: PerformanceCache<CryptoKey>;
  private parseCache: PerformanceCache<string>; // 缓存清理后的 PEM 字符串

  constructor(config: Partial<CacheConfig> = {}) {
    const defaultConfig: CacheConfig = {
      maxSize: 1000,
      defaultTTL: 3600, // 1 hour
      enableLRU: true,
      cleanupInterval: 300000, // 5 minutes
      enableStats: true,
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    this.keyCache = new PerformanceCache<CryptoKey>(finalConfig);
    this.parseCache = new PerformanceCache<string>({
      ...finalConfig,
      maxSize: finalConfig.maxSize * 2, // PEM 字符串缓存可以更大
    });
  }

  /**
   * 获取缓存的公钥
   */
  getPublicKey(keyId: string, algorithm: string): CryptoKey | null {
    const cacheKey = `${keyId}:${algorithm}`;
    return this.keyCache.get(cacheKey);
  }

  /**
   * 缓存公钥
   */
  setPublicKey(keyId: string, algorithm: string, key: CryptoKey, ttl?: number): void {
    const cacheKey = `${keyId}:${algorithm}`;
    this.keyCache.set(cacheKey, key, ttl);
  }

  /**
   * 获取缓存的清理后 PEM 字符串
   */
  getCleanedPEM(pemKey: string): string | null {
    const hash = this.hashPEM(pemKey);
    return this.parseCache.get(hash);
  }

  /**
   * 缓存清理后的 PEM 字符串
   */
  setCleanedPEM(pemKey: string, cleanedPEM: string, ttl?: number): void {
    const hash = this.hashPEM(pemKey);
    this.parseCache.set(hash, cleanedPEM, ttl);
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { keyCache: CacheStats; parseCache: CacheStats } {
    return {
      keyCache: this.keyCache.getStats(),
      parseCache: this.parseCache.getStats(),
    };
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.keyCache.clear();
    this.parseCache.clear();
  }

  /**
   * 销毁缓存
   */
  destroy(): void {
    this.keyCache.destroy();
    this.parseCache.destroy();
  }

  /**
   * 生成 PEM 字符串的哈希
   */
  private hashPEM(pemKey: string): string {
    // 简单的哈希函数，用于缓存键
    let hash = 0;
    for (let i = 0; i < pemKey.length; i++) {
      const char = pemKey.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return hash.toString(36);
  }
}

/**
 * 创建默认的公钥缓存
 */
export function createPublicKeyCache(config?: Partial<CacheConfig>): PublicKeyCache {
  return new PublicKeyCache(config);
}