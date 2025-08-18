import {
  type KeyStorageProvider,
  type AppConfig,
  type KeyPair,
  KeyManagerError,
} from "../types.js";

/**
 * Cloudflare KV 存储提供者
 * 支持将密钥配置存储在 Cloudflare KV 中
 */
export class KVStorageProvider implements KeyStorageProvider {
  private kv: KVNamespace;
  private keyPrefix: string;
  private debug: boolean;
  private retryConfig: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
  };

  constructor(
    kv: KVNamespace,
    options: {
      keyPrefix?: string;
      debug?: boolean;
      retryConfig?: {
        maxRetries?: number;
        baseDelay?: number;
        maxDelay?: number;
      };
    } = {}
  ) {
    this.kv = kv;
    this.keyPrefix = options.keyPrefix || "signature_auth:app:";
    this.debug = options.debug || false;
    this.retryConfig = {
      maxRetries: options.retryConfig?.maxRetries || 3,
      baseDelay: options.retryConfig?.baseDelay || 100,
      maxDelay: options.retryConfig?.maxDelay || 2000,
    };
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    const key = this.getAppKey(appId);

    try {
      const result = await this.withRetry(async () => {
        return await this.kv.get(key, "json");
      });

      if (!result) {
        if (this.debug) {
          console.log(`[KVStorage] App config not found for ${appId}`);
        }
        return null;
      }

      // 验证和转换数据
      const config = this.deserializeAppConfig(result);

      if (this.debug) {
        console.log(`[KVStorage] Loaded app config for ${appId}`);
      }

      return config;
    } catch (error) {
      if (this.debug) {
        console.error(
          `[KVStorage] Error loading app config for ${appId}:`,
          error
        );
      }

      throw new KeyManagerError(
        `Failed to load app config from KV: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          appId,
          operation: "get",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    const key = this.getAppKey(config.appId);

    try {
      // 验证配置
      this.validateAppConfig(config);

      // 序列化配置
      const serializedConfig = this.serializeAppConfig(config);

      await this.withRetry(async () => {
        await this.kv.put(key, JSON.stringify(serializedConfig));
      });

      // 更新应用列表索引
      await this.updateAppIndex(config.appId, true);

      if (this.debug) {
        console.log(`[KVStorage] Saved app config for ${config.appId}`);
      }
    } catch (error) {
      if (this.debug) {
        console.error(
          `[KVStorage] Error saving app config for ${config.appId}:`,
          error
        );
      }

      if (error instanceof KeyManagerError) {
        throw error;
      }

      throw new KeyManagerError(
        `Failed to save app config to KV: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          appId: config.appId,
          operation: "save",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async deleteAppConfig(appId: string): Promise<void> {
    const key = this.getAppKey(appId);

    try {
      // 检查应用是否存在
      const exists = await this.appExists(appId);
      if (!exists) {
        throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
          appId,
        });
      }

      await this.withRetry(async () => {
        await this.kv.delete(key);
      });

      // 从应用列表索引中移除
      await this.updateAppIndex(appId, false);

      if (this.debug) {
        console.log(`[KVStorage] Deleted app config for ${appId}`);
      }
    } catch (error) {
      if (this.debug) {
        console.error(
          `[KVStorage] Error deleting app config for ${appId}:`,
          error
        );
      }

      if (error instanceof KeyManagerError) {
        throw error;
      }

      throw new KeyManagerError(
        `Failed to delete app config from KV: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          appId,
          operation: "delete",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async listAppIds(): Promise<string[]> {
    const indexKey = this.getIndexKey();

    try {
      const result = await this.withRetry(async () => {
        return await this.kv.get(indexKey, "json");
      });

      if (!result || !Array.isArray(result)) {
        if (this.debug) {
          console.log("[KVStorage] No app index found, scanning keys");
        }
        // 如果没有索引，扫描所有键
        return await this.scanAppIds();
      }

      if (this.debug) {
        console.log(`[KVStorage] Found ${result.length} apps in index`);
      }

      return result;
    } catch (error) {
      if (this.debug) {
        console.error("[KVStorage] Error listing app IDs:", error);
      }

      throw new KeyManagerError(
        `Failed to list app IDs from KV: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          operation: "list",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async getMultipleAppConfigs(
    appIds: string[]
  ): Promise<Map<string, AppConfig>> {
    const result = new Map<string, AppConfig>();

    try {
      // KV 不支持批量操作，所以并发获取
      const promises = appIds.map(async (appId) => {
        try {
          const config = await this.getAppConfig(appId);
          if (config) {
            result.set(appId, config);
          }
        } catch (error) {
          if (this.debug) {
            console.warn(
              `[KVStorage] Failed to load config for ${appId}:`,
              error
            );
          }
          // 继续处理其他应用，不抛出错误
        }
      });

      await Promise.all(promises);

      if (this.debug) {
        console.log(
          `[KVStorage] Loaded ${result.size} app configs out of ${appIds.length} requested`
        );
      }

      return result;
    } catch (error) {
      if (this.debug) {
        console.error("[KVStorage] Error getting multiple app configs:", error);
      }

      throw new KeyManagerError(
        `Failed to get multiple app configs from KV: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          appIds,
          operation: "getMultiple",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async appExists(appId: string): Promise<boolean> {
    const key = this.getAppKey(appId);

    try {
      const result = await this.withRetry(async () => {
        return await this.kv.get(key);
      });

      return result !== null;
    } catch (error) {
      if (this.debug) {
        console.error(
          `[KVStorage] Error checking if app ${appId} exists:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<{
    totalApps: number;
    storageUsed?: number;
  }> {
    try {
      const appIds = await this.listAppIds();
      return {
        totalApps: appIds.length,
      };
    } catch (error) {
      if (this.debug) {
        console.error("[KVStorage] Error getting storage stats:", error);
      }
      return { totalApps: 0 };
    }
  }

  /**
   * 清理过期的应用配置
   */
  async cleanupExpiredApps(): Promise<number> {
    let cleanedCount = 0;

    try {
      const appIds = await this.listAppIds();
      const now = new Date();

      for (const appId of appIds) {
        try {
          const config = await this.getAppConfig(appId);
          if (!config) continue;

          // 检查是否有过期的密钥对
          const hasValidKeys = config.keyPairs.some(
            (kp) => kp.enabled && (!kp.expiresAt || kp.expiresAt > now)
          );

          if (!hasValidKeys) {
            await this.deleteAppConfig(appId);
            cleanedCount++;

            if (this.debug) {
              console.log(`[KVStorage] Cleaned up expired app ${appId}`);
            }
          }
        } catch (error) {
          if (this.debug) {
            console.warn(`[KVStorage] Error cleaning up app ${appId}:`, error);
          }
        }
      }

      if (this.debug) {
        console.log(
          `[KVStorage] Cleanup completed, removed ${cleanedCount} expired apps`
        );
      }

      return cleanedCount;
    } catch (error) {
      if (this.debug) {
        console.error("[KVStorage] Error during cleanup:", error);
      }
      throw new KeyManagerError(
        `Failed to cleanup expired apps: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          operation: "cleanup",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private getAppKey(appId: string): string {
    return `${this.keyPrefix}${appId}`;
  }

  private getIndexKey(): string {
    return `${this.keyPrefix}__index__`;
  }

  private async updateAppIndex(appId: string, add: boolean): Promise<void> {
    const indexKey = this.getIndexKey();

    try {
      const currentIndex = await this.withRetry(async () => {
        return await this.kv.get(indexKey, "json");
      });

      let appIds: string[] = Array.isArray(currentIndex) ? currentIndex : [];

      if (add) {
        if (!appIds.includes(appId)) {
          appIds.push(appId);
        }
      } else {
        appIds = appIds.filter((id) => id !== appId);
      }

      await this.withRetry(async () => {
        await this.kv.put(indexKey, JSON.stringify(appIds));
      });

      if (this.debug) {
        console.log(
          `[KVStorage] Updated app index: ${add ? "added" : "removed"} ${appId}`
        );
      }
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[KVStorage] Failed to update app index for ${appId}:`,
          error
        );
      }
      // 索引更新失败不应该阻止主操作
    }
  }

  private async scanAppIds(): Promise<string[]> {
    // KV 不支持键扫描，所以这里返回空数组
    // 在实际使用中，应该维护一个索引
    if (this.debug) {
      console.warn(
        "[KVStorage] Key scanning not supported, returning empty list"
      );
    }
    return [];
  }

  private serializeAppConfig(config: AppConfig): any {
    return {
      ...config,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt?.toISOString(),
      keyPairs: config.keyPairs.map((kp) => ({
        ...kp,
        createdAt: kp.createdAt.toISOString(),
        expiresAt: kp.expiresAt?.toISOString(),
      })),
    };
  }

  private deserializeAppConfig(data: any): AppConfig {
    if (!data || typeof data !== "object") {
      throw new KeyManagerError(
        "Invalid app config data format",
        "VALIDATION_ERROR",
        { data }
      );
    }

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
      keyPairs: data.keyPairs.map((kp: any) => ({
        ...kp,
        createdAt: new Date(kp.createdAt),
        expiresAt: kp.expiresAt ? new Date(kp.expiresAt) : undefined,
      })),
    };
  }

  private validateAppConfig(config: AppConfig): void {
    if (!config.appId || typeof config.appId !== "string") {
      throw new KeyManagerError("Invalid app ID", "VALIDATION_ERROR", {
        appId: config.appId,
      });
    }

    if (!config.name || typeof config.name !== "string") {
      throw new KeyManagerError("Invalid app name", "VALIDATION_ERROR", {
        appId: config.appId,
        name: config.name,
      });
    }

    if (!Array.isArray(config.keyPairs) || config.keyPairs.length === 0) {
      throw new KeyManagerError(
        "App must have at least one key pair",
        "VALIDATION_ERROR",
        { appId: config.appId }
      );
    }

    for (const keyPair of config.keyPairs) {
      this.validateKeyPair(keyPair, config.appId);
    }
  }

  private validateKeyPair(keyPair: KeyPair, appId: string): void {
    if (!keyPair.keyId || typeof keyPair.keyId !== "string") {
      throw new KeyManagerError("Invalid key ID", "VALIDATION_ERROR", {
        appId,
        keyId: keyPair.keyId,
      });
    }

    if (!keyPair.publicKey || typeof keyPair.publicKey !== "string") {
      throw new KeyManagerError("Invalid public key", "VALIDATION_ERROR", {
        appId,
        keyId: keyPair.keyId,
      });
    }

    if (!["RS256", "RS512", "ES256", "ES512"].includes(keyPair.algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${keyPair.algorithm}`,
        "VALIDATION_ERROR",
        { appId, keyId: keyPair.keyId, algorithm: keyPair.algorithm }
      );
    }

    // 验证公钥格式
    if (!this.validatePublicKeyFormat(keyPair.publicKey)) {
      throw new KeyManagerError(
        "Invalid public key format",
        "INVALID_KEY_FORMAT",
        { appId, keyId: keyPair.keyId }
      );
    }
  }

  private validatePublicKeyFormat(publicKey: string): boolean {
    const pemRegex =
      /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    return pemRegex.test(publicKey.trim());
  }

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
            `[KVStorage] Operation failed (attempt ${attempt + 1}/${
              this.retryConfig.maxRetries + 1
            }), retrying in ${delay}ms:`,
            error
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
