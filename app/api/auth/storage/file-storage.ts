import {
  type KeyStorageProvider,
  type AppConfig,
  type KeyPair,
  KeyManagerError,
} from "../types.js";

/**
 * 基于配置文件的密钥存储提供者
 * 支持从 JSON 配置文件加载密钥配置
 */
/**
 * 重试配置接口
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export class FileStorageProvider implements KeyStorageProvider {
  private configPath: string;
  private config: { apps: Record<string, any> } | null = null;
  private debug: boolean;
  private lastModified: number = 0;
  private retryConfig: RetryConfig;

  constructor(
    configPath: string,
    options: {
      debug?: boolean;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ) {
    this.configPath = configPath;
    this.debug = options.debug || false;
    this.retryConfig = {
      maxRetries: options.retryConfig?.maxRetries || 3,
      baseDelay: options.retryConfig?.baseDelay || 100,
      maxDelay: options.retryConfig?.maxDelay || 2000,
    };
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    return this.withRetry(async () => {
      try {
        await this.loadConfig();

        if (!this.config || !this.config.apps || !this.config.apps[appId]) {
          if (this.debug) {
            console.log(`[FileStorage] App config not found for ${appId}`);
          }
          return null;
        }

        const rawConfig = this.config.apps[appId];
        const config = this.deserializeAppConfig(rawConfig, appId);

        if (this.debug) {
          console.log(`[FileStorage] Loaded app config for ${appId}`);
        }

        return config;
      } catch (error) {
        if (this.debug) {
          console.error(`[FileStorage] Error loading app config for ${appId}:`, error);
        }

        throw new KeyManagerError(
          `Failed to load app config from file: ${error instanceof Error ? error.message : String(error)}`,
          "STORAGE_ERROR",
          {
            appId,
            configPath: this.configPath,
            operation: "get",
            originalError: error instanceof Error ? error.message : String(error),
          }
        );
      }
    });
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    throw new KeyManagerError(
      "File storage provider is read-only",
      "STORAGE_ERROR",
      { 
        operation: "save", 
        appId: config.appId,
        configPath: this.configPath 
      }
    );
  }

  async deleteAppConfig(appId: string): Promise<void> {
    throw new KeyManagerError(
      "File storage provider is read-only",
      "STORAGE_ERROR",
      { 
        operation: "delete", 
        appId,
        configPath: this.configPath 
      }
    );
  }

  async listAppIds(): Promise<string[]> {
    return this.withRetry(async () => {
      try {
        await this.loadConfig();

        if (!this.config || !this.config.apps) {
          return [];
        }

        const appIds = Object.keys(this.config.apps);

        if (this.debug) {
          console.log(`[FileStorage] Found ${appIds.length} apps in config file`);
        }

        return appIds;
      } catch (error) {
        if (this.debug) {
          console.error("[FileStorage] Error listing app IDs:", error);
        }

        throw new KeyManagerError(
          `Failed to list app IDs from file: ${error instanceof Error ? error.message : String(error)}`,
          "STORAGE_ERROR",
          {
            configPath: this.configPath,
            operation: "list",
            originalError: error instanceof Error ? error.message : String(error),
          }
        );
      }
    });
  }

  async getMultipleAppConfigs(appIds: string[]): Promise<Map<string, AppConfig>> {
    const result = new Map<string, AppConfig>();

    try {
      await this.loadConfig();

      if (!this.config || !this.config.apps) {
        return result;
      }

      for (const appId of appIds) {
        try {
          const config = await this.getAppConfig(appId);
          if (config) {
            result.set(appId, config);
          }
        } catch (error) {
          if (this.debug) {
            console.warn(`[FileStorage] Failed to load config for ${appId}:`, error);
          }
          // 继续处理其他应用，不抛出错误
        }
      }

      if (this.debug) {
        console.log(`[FileStorage] Loaded ${result.size} app configs out of ${appIds.length} requested`);
      }

      return result;
    } catch (error) {
      if (this.debug) {
        console.error("[FileStorage] Error getting multiple app configs:", error);
      }

      throw new KeyManagerError(
        `Failed to get multiple app configs from file: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_ERROR",
        {
          appIds,
          configPath: this.configPath,
          operation: "getMultiple",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  async appExists(appId: string): Promise<boolean> {
    try {
      return this.withRetry(async () => {
        await this.loadConfig();
        const exists = !!(this.config && this.config.apps && this.config.apps[appId]);
        
        if (this.debug) {
          console.log(`[FileStorage] App ${appId} exists: ${exists}`);
        }
        
        return exists;
      });
    } catch (error) {
      if (this.debug) {
        console.error(`[FileStorage] Error checking if app ${appId} exists:`, error);
      }
      return false;
    }
  }

  /**
   * 重新加载配置文件
   */
  async reloadConfig(): Promise<void> {
    this.config = null;
    this.lastModified = 0;
    await this.loadConfig();

    if (this.debug) {
      console.log("[FileStorage] Configuration reloaded");
    }
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 检查配置文件是否已修改
   */
  async isConfigModified(): Promise<boolean> {
    try {
      // 在 Cloudflare Workers 环境中，我们无法检查文件修改时间
      // 这个方法主要用于开发环境
      return false;
    } catch (error) {
      if (this.debug) {
        console.warn("[FileStorage] Cannot check file modification time:", error);
      }
      return false;
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      // 在 Cloudflare Workers 环境中，配置文件通常是静态导入的
      // 这里我们假设配置已经通过其他方式加载
      if (this.config) {
        return;
      }

      // 尝试动态导入配置文件
      let configData: any;
      
      try {
        // 尝试作为 JSON 文件导入
        const response = await fetch(this.configPath);
        if (response.ok) {
          configData = await response.json();
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (fetchError) {
        // 如果 fetch 失败，尝试作为模块导入
        try {
          const module = await import(this.configPath);
          configData = module.default || module;
        } catch (importError) {
          throw new Error(
            `Failed to load config from ${this.configPath}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
          );
        }
      }

      if (!configData || typeof configData !== "object") {
        throw new Error("Invalid configuration format");
      }

      this.config = configData;
      this.lastModified = Date.now();

      if (this.debug) {
        const appCount = configData.apps ? Object.keys(configData.apps).length : 0;
        console.log(`[FileStorage] Loaded configuration with ${appCount} apps from ${this.configPath}`);
      }
    } catch (error) {
      if (this.debug) {
        console.error(`[FileStorage] Error loading config from ${this.configPath}:`, error);
      }

      throw new KeyManagerError(
        `Failed to load configuration file: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_ERROR",
        {
          configPath: this.configPath,
          operation: "load",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private deserializeAppConfig(data: any, appId: string): AppConfig {
    if (!data || typeof data !== "object") {
      throw new KeyManagerError(
        "Invalid app config data format",
        "VALIDATION_ERROR",
        { appId, data }
      );
    }

    // 处理密钥对
    let keyPairs: KeyPair[] = [];

    if (data.keyPairs && Array.isArray(data.keyPairs)) {
      // 新格式：直接包含密钥对数组
      keyPairs = data.keyPairs.map((kp: any) => ({
        keyId: kp.keyId || "default",
        publicKey: kp.publicKey,
        algorithm: kp.algorithm || "RS256",
        createdAt: kp.createdAt ? new Date(kp.createdAt) : new Date(),
        expiresAt: kp.expiresAt ? new Date(kp.expiresAt) : undefined,
        enabled: kp.enabled !== false,
      }));
    } else if (data.publicKey) {
      // 旧格式：单个密钥对
      keyPairs = [
        {
          keyId: "default",
          publicKey: data.publicKey,
          algorithm: data.algorithm || "RS256",
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
          enabled: data.enabled !== false,
        },
      ];
    } else {
      throw new KeyManagerError(
        "No key pairs found in app config",
        "VALIDATION_ERROR",
        { appId }
      );
    }

    // 验证密钥对
    for (const keyPair of keyPairs) {
      this.validateKeyPair(keyPair, appId);
    }

    return {
      appId,
      name: data.name || appId,
      keyPairs,
      enabled: data.enabled !== false,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
      description: data.description,
      tags: Array.isArray(data.tags) ? data.tags : undefined,
      accessControl: data.accessControl,
    };
  }

  private validateKeyPair(keyPair: KeyPair, appId: string): void {
    if (!keyPair.keyId || typeof keyPair.keyId !== "string") {
      throw new KeyManagerError(
        "Invalid key ID",
        "VALIDATION_ERROR",
        { appId, keyId: keyPair.keyId }
      );
    }

    if (!keyPair.publicKey || typeof keyPair.publicKey !== "string") {
      throw new KeyManagerError(
        "Invalid public key",
        "VALIDATION_ERROR",
        { appId, keyId: keyPair.keyId }
      );
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
            `[FileStorage] Operation failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`,
            error
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * 示例配置文件格式
 */
export const EXAMPLE_CONFIG = {
  apps: {
    "test-app": {
      name: "Test Application",
      enabled: true,
      description: "Test application for signature authentication",
      permissions: ["read", "write"],
      tags: ["test", "development"],
      keyPairs: [
        {
          keyId: "default",
          publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
          algorithm: "RS256",
          enabled: true,
          createdAt: "2024-01-01T00:00:00.000Z",
          expiresAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      accessControl: {
        allowedPaths: ["/api/test/*"],
        deniedPaths: ["/api/admin/*"],
        allowedIPs: ["127.0.0.1", "::1"],
        rateLimit: {
          requestsPerMinute: 100,
          burstLimit: 10,
        },
        customTimeWindow: 300,
      },
    },
  },
};