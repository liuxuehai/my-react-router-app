import { type KeyStorageProvider, type AppConfig, KeyManagerError } from '../types.js';

/**
 * 重试配置接口
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

/**
 * 基于内存的密钥存储提供者
 * 主要用于测试和开发环境
 */
export class MemoryStorageProvider implements KeyStorageProvider {
  private apps: Map<string, AppConfig> = new Map();
  private debug: boolean;
  private retryConfig: RetryConfig;

  constructor(options: {
    debug?: boolean;
    retryConfig?: Partial<RetryConfig>;
  } = {}) {
    this.debug = options.debug || false;
    this.retryConfig = {
      maxRetries: options.retryConfig?.maxRetries || 3,
      baseDelay: options.retryConfig?.baseDelay || 50,
      maxDelay: options.retryConfig?.maxDelay || 1000,
    };
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    return this.withRetry(async () => {
      const config = this.apps.get(appId) || null;
      
      if (this.debug) {
        console.log(`[MemoryStorage] App config ${config ? 'found' : 'not found'} for ${appId}`);
      }
      
      return config;
    });
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    return this.withRetry(async () => {
      // 验证配置
      this.validateAppConfig(config);
      
      // 深拷贝以避免外部修改
      const configCopy = JSON.parse(JSON.stringify(config));
      configCopy.createdAt = new Date(config.createdAt);
      configCopy.updatedAt = config.updatedAt ? new Date(config.updatedAt) : undefined;
      configCopy.keyPairs = config.keyPairs.map(kp => ({
        ...kp,
        createdAt: new Date(kp.createdAt),
        expiresAt: kp.expiresAt ? new Date(kp.expiresAt) : undefined
      }));
      
      this.apps.set(config.appId, configCopy);
      
      if (this.debug) {
        console.log(`[MemoryStorage] Saved app config for ${config.appId}`);
      }
    });
  }

  async deleteAppConfig(appId: string): Promise<void> {
    return this.withRetry(async () => {
      if (!this.apps.has(appId)) {
        throw new KeyManagerError(
          `App ${appId} not found`,
          'APP_NOT_FOUND',
          { appId }
        );
      }
      
      this.apps.delete(appId);
      
      if (this.debug) {
        console.log(`[MemoryStorage] Deleted app config for ${appId}`);
      }
    });
  }

  async listAppIds(): Promise<string[]> {
    return this.withRetry(async () => {
      const appIds = Array.from(this.apps.keys());
      
      if (this.debug) {
        console.log(`[MemoryStorage] Found ${appIds.length} apps`);
      }
      
      return appIds;
    });
  }

  async getMultipleAppConfigs(appIds: string[]): Promise<Map<string, AppConfig>> {
    const result = new Map<string, AppConfig>();
    
    for (const appId of appIds) {
      const config = this.apps.get(appId);
      if (config) {
        // 深拷贝以避免外部修改
        const configCopy = JSON.parse(JSON.stringify(config));
        configCopy.createdAt = new Date(config.createdAt);
        configCopy.updatedAt = config.updatedAt ? new Date(config.updatedAt) : undefined;
        configCopy.keyPairs = config.keyPairs.map(kp => ({
          ...kp,
          createdAt: new Date(kp.createdAt),
          expiresAt: kp.expiresAt ? new Date(kp.expiresAt) : undefined
        }));
        
        result.set(appId, configCopy);
      }
    }
    
    return result;
  }

  async appExists(appId: string): Promise<boolean> {
    return this.withRetry(async () => {
      const exists = this.apps.has(appId);
      
      if (this.debug) {
        console.log(`[MemoryStorage] App ${appId} exists: ${exists}`);
      }
      
      return exists;
    });
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  clear(): void {
    this.apps.clear();
  }

  /**
   * 获取存储的应用数量（仅用于测试）
   */
  size(): number {
    return this.apps.size;
  }

  private validateAppConfig(config: AppConfig): void {
    if (!config.appId || typeof config.appId !== 'string') {
      throw new KeyManagerError(
        'Invalid app ID',
        'VALIDATION_ERROR',
        { appId: config.appId }
      );
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new KeyManagerError(
        'Invalid app name',
        'VALIDATION_ERROR',
        { appId: config.appId, name: config.name }
      );
    }

    if (!Array.isArray(config.keyPairs) || config.keyPairs.length === 0) {
      throw new KeyManagerError(
        'App must have at least one key pair',
        'VALIDATION_ERROR',
        { appId: config.appId }
      );
    }

    for (const keyPair of config.keyPairs) {
      this.validateKeyPair(keyPair, config.appId);
    }
  }

  private validateKeyPair(keyPair: any, appId: string): void {
    if (!keyPair.keyId || typeof keyPair.keyId !== 'string') {
      throw new KeyManagerError(
        'Invalid key ID',
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId }
      );
    }

    if (!keyPair.publicKey || typeof keyPair.publicKey !== 'string') {
      throw new KeyManagerError(
        'Invalid public key',
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId }
      );
    }

    if (!['RS256', 'RS512', 'ES256', 'ES512'].includes(keyPair.algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${keyPair.algorithm}`,
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId, algorithm: keyPair.algorithm }
      );
    }

    // 验证公钥格式
    if (!this.validatePublicKeyFormat(keyPair.publicKey)) {
      throw new KeyManagerError(
        'Invalid public key format',
        'INVALID_KEY_FORMAT',
        { appId, keyId: keyPair.keyId }
      );
    }
  }

  private validatePublicKeyFormat(publicKey: string): boolean {
    const pemRegex = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    return pemRegex.test(publicKey.trim());
  }

  /**
   * 重试机制包装器
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // 计算延迟时间（指数退避）
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt),
          this.retryConfig.maxDelay
        );

        if (this.debug) {
          console.warn(
            `[MemoryStorage] Operation failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`,
            error
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}