import { type KeyManager, type AppConfig, type KeyPair, type KeyStorageProvider, type KeyManagerConfig, KeyManagerError } from './types.js';
import { EnvStorageProvider } from './storage/env-storage.js';
import { MemoryStorageProvider } from './storage/memory-storage.js';

/**
 * 密钥管理器实现
 * 提供密钥的加载、验证、缓存等功能
 */
export class KeyManagerImpl implements KeyManager {
  private storage: KeyStorageProvider;
  private cache: Map<string, { config: AppConfig; timestamp: number }> = new Map();
  private config: KeyManagerConfig;

  constructor(config: KeyManagerConfig, env?: Record<string, string | undefined>) {
    this.config = config;
    this.storage = this.createStorageProvider(config.storageType, env);
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    try {
      // 检查缓存
      if (this.config.enableCache) {
        const cached = this.cache.get(appId);
        if (cached && this.isCacheValid(cached.timestamp)) {
          if (this.config.debug) {
            console.log(`[KeyManager] Cache hit for app ${appId}`);
          }
          return cached.config;
        }
      }

      // 从存储加载
      const config = await this.storage.getAppConfig(appId);
      
      if (config && this.config.enableCache) {
        this.cache.set(appId, {
          config,
          timestamp: Date.now()
        });
        
        if (this.config.debug) {
          console.log(`[KeyManager] Loaded and cached config for app ${appId}`);
        }
      }

      return config;
    } catch (error) {
      if (this.config.debug) {
        console.error(`[KeyManager] Error loading app config for ${appId}:`, error);
      }
      
      if (error instanceof KeyManagerError) {
        throw error;
      }
      
      throw new KeyManagerError(
        `Failed to load app config for ${appId}`,
        'STORAGE_ERROR',
        { appId, originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async getPublicKey(appId: string, keyId?: string): Promise<string | null> {
    const config = await this.getAppConfig(appId);
    
    if (!config) {
      return null;
    }

    if (!config.enabled) {
      throw new KeyManagerError(
        `App ${appId} is disabled`,
        'APP_NOT_FOUND',
        { appId, enabled: false }
      );
    }

    // 如果没有指定 keyId，使用第一个启用的密钥
    const targetKeyId = keyId || 'default';
    const keyPair = config.keyPairs.find(kp => kp.keyId === targetKeyId);
    
    if (!keyPair) {
      throw new KeyManagerError(
        `Key ${targetKeyId} not found for app ${appId}`,
        'KEY_NOT_FOUND',
        { appId, keyId: targetKeyId, availableKeys: config.keyPairs.map(kp => kp.keyId) }
      );
    }

    if (!keyPair.enabled) {
      throw new KeyManagerError(
        `Key ${targetKeyId} is disabled for app ${appId}`,
        'KEY_NOT_FOUND',
        { appId, keyId: targetKeyId, enabled: false }
      );
    }

    // 检查密钥是否过期
    if (keyPair.expiresAt && keyPair.expiresAt < new Date()) {
      throw new KeyManagerError(
        `Key ${targetKeyId} has expired for app ${appId}`,
        'KEY_NOT_FOUND',
        { appId, keyId: targetKeyId, expiresAt: keyPair.expiresAt }
      );
    }

    return keyPair.publicKey;
  }

  async validateApp(appId: string): Promise<boolean> {
    try {
      const config = await this.getAppConfig(appId);
      return config !== null && config.enabled;
    } catch (error) {
      if (this.config.debug) {
        console.error(`[KeyManager] Error validating app ${appId}:`, error);
      }
      return false;
    }
  }

  async addApp(config: AppConfig): Promise<void> {
    await this.storage.saveAppConfig(config);
    
    // 更新缓存
    if (this.config.enableCache) {
      this.cache.set(config.appId, {
        config,
        timestamp: Date.now()
      });
    }
    
    if (this.config.debug) {
      console.log(`[KeyManager] Added app ${config.appId}`);
    }
  }

  async updateApp(appId: string, updates: Partial<AppConfig>): Promise<void> {
    const existing = await this.getAppConfig(appId);
    
    if (!existing) {
      throw new KeyManagerError(
        `App ${appId} not found`,
        'APP_NOT_FOUND',
        { appId }
      );
    }

    const updated: AppConfig = {
      ...existing,
      ...updates,
      appId, // 确保 appId 不被修改
      createdAt: existing.createdAt // 保持原始创建时间
    };

    await this.storage.saveAppConfig(updated);
    
    // 更新缓存
    if (this.config.enableCache) {
      this.cache.set(appId, {
        config: updated,
        timestamp: Date.now()
      });
    }
    
    if (this.config.debug) {
      console.log(`[KeyManager] Updated app ${appId}`);
    }
  }

  async generateKeyPair(algorithm: string): Promise<KeyPair> {
    // 这里只是创建一个基本的密钥对结构
    // 实际的密钥生成将在后续任务中实现
    if (!['RS256', 'RS512', 'ES256', 'ES512'].includes(algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${algorithm}`,
        'VALIDATION_ERROR',
        { algorithm, supportedAlgorithms: ['RS256', 'RS512', 'ES256', 'ES512'] }
      );
    }

    // 临时实现 - 返回占位符密钥对
    return {
      keyId: `key_${Date.now()}`,
      publicKey: '-----BEGIN PUBLIC KEY-----\n[PLACEHOLDER]\n-----END PUBLIC KEY-----',
      algorithm: algorithm as KeyPair['algorithm'],
      createdAt: new Date(),
      enabled: true
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    
    if (this.config.debug) {
      console.log('[KeyManager] Cache cleared');
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size
    };
  }

  private createStorageProvider(type: string, env?: Record<string, string | undefined>): KeyStorageProvider {
    switch (type) {
      case 'env':
        return new EnvStorageProvider(env);
      case 'memory':
        return new MemoryStorageProvider();
      default:
        throw new KeyManagerError(
          `Unsupported storage type: ${type}`,
          'VALIDATION_ERROR',
          { storageType: type, supportedTypes: ['env', 'memory'] }
        );
    }
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.config.cacheExpiry * 1000;
  }
}

/**
 * 创建密钥管理器的工厂函数
 */
export function createKeyManager(
  config: Partial<KeyManagerConfig> = {},
  env?: Record<string, string | undefined>
): KeyManager {
  const defaultConfig: KeyManagerConfig = {
    storageType: 'env',
    cacheExpiry: 300, // 5 minutes
    enableCache: true,
    debug: false
  };

  const finalConfig = { ...defaultConfig, ...config };
  
  return new KeyManagerImpl(finalConfig, env);
}