import {
  type KeyManager,
  type AppConfig,
  type KeyPair,
  type KeyStorageProvider,
  type KeyManagerConfig,
  KeyManagerError,
} from "./types.js";
import { EnvStorageProvider } from "./storage/env-storage.js";
import { MemoryStorageProvider } from "./storage/memory-storage.js";

/**
 * 密钥管理器实现
 * 提供密钥的加载、验证、缓存等功能
 */
export class KeyManagerImpl implements KeyManager {
  private storage: KeyStorageProvider;
  private cache: Map<string, { config: AppConfig; timestamp: number }> =
    new Map();
  private config: KeyManagerConfig;

  constructor(
    config: KeyManagerConfig,
    env?: Record<string, string | undefined>
  ) {
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
          timestamp: Date.now(),
        });

        if (this.config.debug) {
          console.log(`[KeyManager] Loaded and cached config for app ${appId}`);
        }
      }

      return config;
    } catch (error) {
      if (this.config.debug) {
        console.error(
          `[KeyManager] Error loading app config for ${appId}:`,
          error
        );
      }

      if (error instanceof KeyManagerError) {
        throw error;
      }

      throw new KeyManagerError(
        `Failed to load app config for ${appId}`,
        "STORAGE_ERROR",
        {
          appId,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async getPublicKey(appId: string, keyId?: string): Promise<string | null> {
    const config = await this.getAppConfig(appId);

    if (!config) {
      return null;
    }

    if (!config.enabled) {
      throw new KeyManagerError(`App ${appId} is disabled`, "APP_NOT_FOUND", {
        appId,
        enabled: false,
      });
    }

    // 如果没有指定 keyId，使用第一个启用的密钥
    const targetKeyId = keyId || "default";
    const keyPair = config.keyPairs.find((kp) => kp.keyId === targetKeyId);

    if (!keyPair) {
      throw new KeyManagerError(
        `Key ${targetKeyId} not found for app ${appId}`,
        "KEY_NOT_FOUND",
        {
          appId,
          keyId: targetKeyId,
          availableKeys: config.keyPairs.map((kp) => kp.keyId),
        }
      );
    }

    if (!keyPair.enabled) {
      throw new KeyManagerError(
        `Key ${targetKeyId} is disabled for app ${appId}`,
        "KEY_NOT_FOUND",
        { appId, keyId: targetKeyId, enabled: false }
      );
    }

    // 检查密钥是否过期
    if (keyPair.expiresAt && keyPair.expiresAt < new Date()) {
      throw new KeyManagerError(
        `Key ${targetKeyId} has expired for app ${appId}`,
        "KEY_NOT_FOUND",
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
        timestamp: Date.now(),
      });
    }

    if (this.config.debug) {
      console.log(`[KeyManager] Added app ${config.appId}`);
    }
  }

  async updateApp(appId: string, updates: Partial<AppConfig>): Promise<void> {
    const existing = await this.getAppConfig(appId);

    if (!existing) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
        appId,
      });
    }

    const updated: AppConfig = {
      ...existing,
      ...updates,
      appId, // 确保 appId 不被修改
      createdAt: existing.createdAt, // 保持原始创建时间
    };

    await this.storage.saveAppConfig(updated);

    // 更新缓存
    if (this.config.enableCache) {
      this.cache.set(appId, {
        config: updated,
        timestamp: Date.now(),
      });
    }

    if (this.config.debug) {
      console.log(`[KeyManager] Updated app ${appId}`);
    }
  }

  async generateKeyPair(algorithm: string): Promise<KeyPair> {
    // 这里只是创建一个基本的密钥对结构
    // 实际的密钥生成将在后续任务中实现
    if (!["RS256", "RS512", "ES256", "ES512"].includes(algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${algorithm}`,
        "VALIDATION_ERROR",
        { algorithm, supportedAlgorithms: ["RS256", "RS512", "ES256", "ES512"] }
      );
    }

    // 临时实现 - 返回占位符密钥对
    return {
      keyId: `key_${Date.now()}`,
      publicKey:
        "-----BEGIN PUBLIC KEY-----\n[PLACEHOLDER]\n-----END PUBLIC KEY-----",
      algorithm: algorithm as KeyPair["algorithm"],
      createdAt: new Date(),
      enabled: true,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();

    if (this.config.debug) {
      console.log("[KeyManager] Cache cleared");
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }

  /**
   * 列出所有应用 ID
   */
  async listApps(): Promise<string[]> {
    try {
      return await this.storage.listAppIds();
    } catch (error) {
      if (this.config.debug) {
        console.error("[KeyManager] Error listing apps:", error);
      }
      throw new KeyManagerError(
        "Failed to list applications",
        "STORAGE_ERROR",
        {
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * 批量获取应用配置
   */
  async getMultipleAppConfigs(
    appIds: string[]
  ): Promise<Map<string, AppConfig>> {
    const result = new Map<string, AppConfig>();

    try {
      // 如果存储提供者支持批量获取，使用批量方法
      if (this.storage.getMultipleAppConfigs) {
        return await this.storage.getMultipleAppConfigs(appIds);
      }

      // 否则逐个获取
      const promises = appIds.map(async (appId) => {
        const config = await this.getAppConfig(appId);
        if (config) {
          result.set(appId, config);
        }
      });

      await Promise.all(promises);
      return result;
    } catch (error) {
      if (this.config.debug) {
        console.error(
          "[KeyManager] Error getting multiple app configs:",
          error
        );
      }
      throw new KeyManagerError(
        "Failed to get multiple app configurations",
        "STORAGE_ERROR",
        {
          appIds,
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * 启用/禁用应用
   */
  async setAppEnabled(appId: string, enabled: boolean): Promise<void> {
    const config = await this.getAppConfig(appId);

    if (!config) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
        appId,
      });
    }

    await this.updateApp(appId, {
      enabled,
      updatedAt: new Date(),
    });

    if (this.config.debug) {
      console.log(
        `[KeyManager] App ${appId} ${enabled ? "enabled" : "disabled"}`
      );
    }
  }

  /**
   * 添加密钥对到现有应用
   */
  async addKeyPair(appId: string, keyPair: KeyPair): Promise<void> {
    const config = await this.getAppConfig(appId);

    if (!config) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
        appId,
      });
    }

    // 检查密钥 ID 是否已存在
    if (config.keyPairs.some((kp) => kp.keyId === keyPair.keyId)) {
      throw new KeyManagerError(
        `Key ${keyPair.keyId} already exists for app ${appId}`,
        "VALIDATION_ERROR",
        { appId, keyId: keyPair.keyId }
      );
    }

    // 验证密钥对
    this.validateKeyPair(keyPair);

    const updatedKeyPairs = [...config.keyPairs, keyPair];

    await this.updateApp(appId, {
      keyPairs: updatedKeyPairs,
      updatedAt: new Date(),
    });

    if (this.config.debug) {
      console.log(`[KeyManager] Added key ${keyPair.keyId} to app ${appId}`);
    }
  }

  /**
   * 更新密钥对
   */
  async updateKeyPair(
    appId: string,
    keyId: string,
    updates: Partial<KeyPair>
  ): Promise<void> {
    const config = await this.getAppConfig(appId);

    if (!config) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
        appId,
      });
    }

    const keyIndex = config.keyPairs.findIndex((kp) => kp.keyId === keyId);
    if (keyIndex === -1) {
      throw new KeyManagerError(
        `Key ${keyId} not found for app ${appId}`,
        "KEY_NOT_FOUND",
        { appId, keyId }
      );
    }

    // 不允许修改 keyId
    const { keyId: _, ...allowedUpdates } = updates;

    const updatedKeyPair = {
      ...config.keyPairs[keyIndex],
      ...allowedUpdates,
    };

    // 验证更新后的密钥对
    this.validateKeyPair(updatedKeyPair);

    const updatedKeyPairs = [...config.keyPairs];
    updatedKeyPairs[keyIndex] = updatedKeyPair;

    await this.updateApp(appId, {
      keyPairs: updatedKeyPairs,
      updatedAt: new Date(),
    });

    if (this.config.debug) {
      console.log(`[KeyManager] Updated key ${keyId} for app ${appId}`);
    }
  }

  /**
   * 删除密钥对
   */
  async removeKeyPair(appId: string, keyId: string): Promise<void> {
    const config = await this.getAppConfig(appId);

    if (!config) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", {
        appId,
      });
    }

    const keyIndex = config.keyPairs.findIndex((kp) => kp.keyId === keyId);
    if (keyIndex === -1) {
      throw new KeyManagerError(
        `Key ${keyId} not found for app ${appId}`,
        "KEY_NOT_FOUND",
        { appId, keyId }
      );
    }

    // 确保至少保留一个密钥对
    if (config.keyPairs.length <= 1) {
      throw new KeyManagerError(
        `Cannot remove the last key pair for app ${appId}`,
        "VALIDATION_ERROR",
        { appId, keyId, remainingKeys: config.keyPairs.length }
      );
    }

    const updatedKeyPairs = config.keyPairs.filter((kp) => kp.keyId !== keyId);

    await this.updateApp(appId, {
      keyPairs: updatedKeyPairs,
      updatedAt: new Date(),
    });

    if (this.config.debug) {
      console.log(`[KeyManager] Removed key ${keyId} from app ${appId}`);
    }
  }

  /**
   * 启用/禁用密钥对
   */
  async setKeyPairEnabled(
    appId: string,
    keyId: string,
    enabled: boolean
  ): Promise<void> {
    await this.updateKeyPair(appId, keyId, { enabled });

    if (this.config.debug) {
      console.log(
        `[KeyManager] Key ${keyId} for app ${appId} ${
          enabled ? "enabled" : "disabled"
        }`
      );
    }
  }

  /**
   * 验证访问权限
   */
  async validateAccess(
    appId: string,
    path: string,
    method: string,
    clientIP?: string
  ): Promise<boolean> {
    try {
      const config = await this.getAppConfig(appId);

      if (!config || !config.enabled) {
        if (this.config.debug) {
          console.log(
            `[KeyManager] Access denied for app ${appId}: app not found or disabled`
          );
        }
        return false;
      }

      const accessControl = config.accessControl;
      if (!accessControl) {
        if (this.config.debug) {
          console.log(
            `[KeyManager] Access allowed for app ${appId}: no access control configured`
          );
        }
        return true; // 没有访问控制配置，默认允许
      }

      // 首先检查拒绝路径 - 如果匹配拒绝路径，直接拒绝
      if (accessControl.deniedPaths && accessControl.deniedPaths.length > 0) {
        for (const deniedPath of accessControl.deniedPaths) {
          if (this.matchPath(path, deniedPath)) {
            if (this.config.debug) {
              console.log(
                `[KeyManager] Access denied for app ${appId}: path ${path} matches denied pattern ${deniedPath}`
              );
            }
            return false;
          }
        }
      }

      // 然后检查允许路径 - 如果配置了允许路径，必须匹配其中一个
      if (accessControl.allowedPaths && accessControl.allowedPaths.length > 0) {
        const isAllowed = accessControl.allowedPaths.some((allowedPath) => {
          const matches = this.matchPath(path, allowedPath);
          if (this.config.debug && matches) {
            console.log(
              `[KeyManager] Path ${path} matches allowed pattern ${allowedPath}`
            );
          }
          return matches;
        });

        if (!isAllowed) {
          if (this.config.debug) {
            console.log(
              `[KeyManager] Access denied for app ${appId}: path ${path} not in allowed paths [${accessControl.allowedPaths.join(
                ", "
              )}]`
            );
          }
          return false;
        }
      }

      // 检查 IP 白名单
      if (
        clientIP &&
        accessControl.allowedIPs &&
        accessControl.allowedIPs.length > 0
      ) {
        if (!accessControl.allowedIPs.includes(clientIP)) {
          if (this.config.debug) {
            console.log(
              `[KeyManager] Access denied for app ${appId}: IP ${clientIP} not in whitelist [${accessControl.allowedIPs.join(
                ", "
              )}]`
            );
          }
          return false;
        }
      }

      if (this.config.debug) {
        console.log(
          `[KeyManager] Access allowed for app ${appId}: all checks passed`
        );
      }
      return true;
    } catch (error) {
      if (this.config.debug) {
        console.error(
          `[KeyManager] Error validating access for app ${appId}:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * 获取应用的有效密钥对
   */
  async getValidKeyPairs(appId: string): Promise<KeyPair[]> {
    const config = await this.getAppConfig(appId);

    if (!config || !config.enabled) {
      return [];
    }

    const now = new Date();
    return config.keyPairs.filter((keyPair) => {
      // 检查是否启用
      if (!keyPair.enabled) {
        return false;
      }

      // 检查是否过期
      if (keyPair.expiresAt && keyPair.expiresAt < now) {
        return false;
      }

      return true;
    });
  }

  private createStorageProvider(
    type: string,
    env?: Record<string, string | undefined>
  ): KeyStorageProvider {
    switch (type) {
      case "env":
        return new EnvStorageProvider(env);
      case "memory":
        return new MemoryStorageProvider();
      default:
        throw new KeyManagerError(
          `Unsupported storage type: ${type}`,
          "VALIDATION_ERROR",
          { storageType: type, supportedTypes: ["env", "memory"] }
        );
    }
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.config.cacheExpiry * 1000;
  }

  /**
   * 验证密钥对格式和内容
   */
  private validateKeyPair(keyPair: KeyPair): void {
    if (!keyPair.keyId || typeof keyPair.keyId !== "string") {
      throw new KeyManagerError("Invalid key ID", "VALIDATION_ERROR", {
        keyId: keyPair.keyId,
      });
    }

    if (!keyPair.publicKey || typeof keyPair.publicKey !== "string") {
      throw new KeyManagerError("Invalid public key", "VALIDATION_ERROR", {
        keyId: keyPair.keyId,
      });
    }

    if (!["RS256", "RS512", "ES256", "ES512"].includes(keyPair.algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${keyPair.algorithm}`,
        "VALIDATION_ERROR",
        { keyId: keyPair.keyId, algorithm: keyPair.algorithm }
      );
    }

    // 验证公钥格式
    const pemRegex =
      /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    if (!pemRegex.test(keyPair.publicKey.trim())) {
      throw new KeyManagerError(
        "Invalid public key format",
        "INVALID_KEY_FORMAT",
        { keyId: keyPair.keyId }
      );
    }
  }

  /**
   * 匹配路径模式
   * 支持通配符 * 和 **
   */
  private matchPath(path: string, pattern: string): boolean {
    // 先处理通配符，再转义其他特殊字符
    let regexPattern = pattern
      .replace(/\*\*/g, "__DOUBLE_STAR__") // 临时替换 **
      .replace(/\*/g, "__SINGLE_STAR__") // 临时替换 *
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义正则表达式特殊字符
      .replace(/__DOUBLE_STAR__/g, ".*") // ** 匹配任意字符（包括 /）
      .replace(/__SINGLE_STAR__/g, "[^/]*") // * 匹配除 / 外的任意字符
      .replace(/\?/g, "."); // ? 匹配单个字符

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
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
    storageType: "env",
    cacheExpiry: 300, // 5 minutes
    enableCache: true,
    debug: false,
  };

  const finalConfig = { ...defaultConfig, ...config };

  return new KeyManagerImpl(finalConfig, env);
}
