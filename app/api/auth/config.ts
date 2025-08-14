import type { KeyManagerConfig } from './types.js';

/**
 * 签名认证相关的环境变量接口
 */
export interface SignatureAuthEnvironment {
  /** 密钥存储方式 */
  KEY_STORAGE_TYPE?: string;
  /** 缓存过期时间（秒） */
  KEY_CACHE_EXPIRY?: string;
  /** 是否启用缓存 */
  KEY_ENABLE_CACHE?: string;
  /** 调试模式 */
  SIGNATURE_DEBUG?: string;
}

/**
 * 认证配置管理器
 */
export class AuthConfigManager {
  /**
   * 从环境变量加载密钥管理器配置
   */
  static loadKeyManagerConfig(env: SignatureAuthEnvironment = {}): KeyManagerConfig {
    return {
      storageType: this.parseStorageType(env.KEY_STORAGE_TYPE),
      cacheExpiry: this.parseNumber(env.KEY_CACHE_EXPIRY, 300),
      enableCache: this.parseBoolean(env.KEY_ENABLE_CACHE, true),
      debug: this.parseBoolean(env.SIGNATURE_DEBUG, false)
    };
  }

  /**
   * 验证密钥管理器配置
   */
  static validateKeyManagerConfig(config: KeyManagerConfig): boolean {
    const validStorageTypes = ['env', 'memory', 'kv'];
    
    if (!validStorageTypes.includes(config.storageType)) {
      throw new Error(`Invalid storage type: ${config.storageType}. Supported types: ${validStorageTypes.join(', ')}`);
    }

    if (config.cacheExpiry < 0) {
      throw new Error('Cache expiry must be non-negative');
    }

    return true;
  }

  /**
   * 获取默认的密钥管理器配置
   */
  static getDefaultKeyManagerConfig(): KeyManagerConfig {
    return {
      storageType: 'env',
      cacheExpiry: 300,
      enableCache: true,
      debug: false
    };
  }

  private static parseStorageType(value?: string): 'env' | 'memory' | 'kv' {
    const validTypes = ['env', 'memory', 'kv'];
    const type = value?.toLowerCase();
    
    if (type && validTypes.includes(type)) {
      return type as 'env' | 'memory' | 'kv';
    }
    
    return 'env';
  }

  private static parseNumber(value?: string, defaultValue: number = 0): number {
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private static parseBoolean(value?: string, defaultValue: boolean = false): boolean {
    if (value === undefined) return defaultValue;
    if (value === '') return false; // Empty string is falsy
    
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
}

/**
 * 便捷函数：从环境变量创建密钥管理器配置
 */
export function createKeyManagerConfigFromEnv(env: Record<string, string | undefined> = process.env): KeyManagerConfig {
  const config = AuthConfigManager.loadKeyManagerConfig(env);
  AuthConfigManager.validateKeyManagerConfig(config);
  return config;
}