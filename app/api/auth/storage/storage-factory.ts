import {
  type KeyStorageProvider,
  type KeyManagerConfig,
  KeyManagerError,
} from "../types.js";
import { EnvStorageProvider } from "./env-storage.js";
import { MemoryStorageProvider } from "./memory-storage.js";
import { KVStorageProvider } from "./kv-storage.js";
import { FileStorageProvider } from "./file-storage.js";

/**
 * 存储提供者配置接口
 */
export interface StorageProviderConfig {
  type: "env" | "kv" | "memory" | "file";
  debug?: boolean;

  // 环境变量存储配置
  env?: Record<string, string | undefined>;

  // KV 存储配置
  kv?: {
    namespace: KVNamespace;
    keyPrefix?: string;
    retryConfig?: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
    };
  };

  // 文件存储配置
  file?: {
    configPath: string;
  };
}

/**
 * 存储提供者工厂类
 * 负责创建和管理不同类型的存储提供者
 */
export class StorageProviderFactory {
  private static providers: Map<string, KeyStorageProvider> = new Map();

  /**
   * 创建存储提供者
   */
  static createProvider(config: StorageProviderConfig): KeyStorageProvider {
    const cacheKey = this.getCacheKey(config);

    // 检查缓存
    const cached = this.providers.get(cacheKey);
    if (cached) {
      return cached;
    }

    let provider: KeyStorageProvider;

    switch (config.type) {
      case "env":
        provider = new EnvStorageProvider(config.env, {
          debug: config.debug,
        });
        break;

      case "memory":
        provider = new MemoryStorageProvider({
          debug: config.debug,
        });
        break;

      case "kv":
        if (!config.kv?.namespace) {
          throw new KeyManagerError(
            "KV namespace is required for KV storage provider",
            "VALIDATION_ERROR",
            { storageType: "kv" }
          );
        }
        provider = new KVStorageProvider(config.kv.namespace, {
          keyPrefix: config.kv.keyPrefix,
          debug: config.debug,
          retryConfig: config.kv.retryConfig,
        });
        break;

      case "file":
        if (!config.file?.configPath) {
          throw new KeyManagerError(
            "Config path is required for file storage provider",
            "VALIDATION_ERROR",
            { storageType: "file" }
          );
        }
        provider = new FileStorageProvider(config.file.configPath, {
          debug: config.debug,
        });
        break;

      default:
        throw new KeyManagerError(
          `Unsupported storage type: ${config.type}`,
          "VALIDATION_ERROR",
          {
            storageType: config.type,
            supportedTypes: ["env", "kv", "memory", "file"],
          }
        );
    }

    // 缓存提供者
    this.providers.set(cacheKey, provider);

    return provider;
  }

  /**
   * 从环境变量创建存储提供者
   */
  static createFromEnv(
    env: Record<string, string | undefined>
  ): KeyStorageProvider {
    const storageTypeRaw = env.KEY_STORAGE_TYPE || "env";
    const debug = env.SIGNATURE_DEBUG === "true";

    // Validate and cast storage type
    const validTypes = ["env", "kv", "memory", "file"] as const;
    type ValidStorageType = (typeof validTypes)[number];

    const isValidStorageType = (type: string): type is ValidStorageType => {
      return validTypes.includes(type as ValidStorageType);
    };

    if (!isValidStorageType(storageTypeRaw)) {
      throw new KeyManagerError(
        `Invalid storage type: ${storageTypeRaw}. Must be one of: ${validTypes.join(
          ", "
        )}`,
        "VALIDATION_ERROR",
        { storageType: storageTypeRaw, validTypes }
      );
    }

    const storageType = storageTypeRaw; // Now TypeScript knows this is a valid type

    const config: StorageProviderConfig = {
      type: storageType,
      debug,
      env,
    };

    switch (storageType) {
      case "kv":
        // KV 存储需要在运行时提供 namespace
        throw new KeyManagerError(
          "KV storage requires runtime configuration with namespace",
          "VALIDATION_ERROR",
          {
            storageType: "kv",
            hint: "Use createProvider() with KV namespace instead",
          }
        );

      case "file":
        const configPath = env.SIGNATURE_CONFIG_PATH;
        if (!configPath) {
          throw new KeyManagerError(
            "SIGNATURE_CONFIG_PATH environment variable is required for file storage",
            "VALIDATION_ERROR",
            { storageType: "file" }
          );
        }
        config.file = { configPath };
        break;

      case "memory":
        // Memory storage doesn't need additional config
        break;

      case "env":
      default:
        // Environment storage uses the provided env
        break;
    }

    return this.createProvider(config);
  }

  /**
   * 从 KeyManagerConfig 创建存储提供者
   */
  static createFromKeyManagerConfig(
    config: KeyManagerConfig,
    env?: Record<string, string | undefined>,
    kvNamespace?: KVNamespace
  ): KeyStorageProvider {
    const storageConfig: StorageProviderConfig = {
      type: config.storageType,
      debug: config.debug,
      env,
    };

    if (config.storageType === "kv") {
      if (!kvNamespace) {
        throw new KeyManagerError(
          "KV namespace is required for KV storage type",
          "VALIDATION_ERROR",
          { storageType: "kv" }
        );
      }
      storageConfig.kv = { namespace: kvNamespace };
    }

    return this.createProvider(storageConfig);
  }

  /**
   * 创建多层存储提供者
   * 支持主存储和备用存储的组合
   */
  static createMultiLayerProvider(
    primaryConfig: StorageProviderConfig,
    fallbackConfig?: StorageProviderConfig
  ): KeyStorageProvider {
    const primary = this.createProvider(primaryConfig);

    if (!fallbackConfig) {
      return primary;
    }

    const fallback = this.createProvider(fallbackConfig);
    return new MultiLayerStorageProvider(primary, fallback, {
      debug: primaryConfig.debug || fallbackConfig.debug,
    });
  }

  /**
   * 清除缓存的提供者
   */
  static clearCache(): void {
    this.providers.clear();
  }

  /**
   * 获取缓存统计信息
   */
  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.providers.size,
      keys: Array.from(this.providers.keys()),
    };
  }

  private static getCacheKey(config: StorageProviderConfig): string {
    const parts: string[] = [config.type];

    switch (config.type) {
      case "kv":
        parts.push(config.kv?.keyPrefix || "default");
        break;
      case "file":
        parts.push(config.file?.configPath || "default");
        break;
      case "env":
        // 环境变量存储使用环境变量的哈希作为缓存键
        const envKeys = Object.keys(config.env || {}).sort();
        const envHash = envKeys.join(",");
        parts.push(envHash);
        break;
    }

    return parts.join(":");
  }
}

/**
 * 多层存储提供者
 * 支持主存储失败时自动切换到备用存储
 */
class MultiLayerStorageProvider implements KeyStorageProvider {
  private primary: KeyStorageProvider;
  private fallback: KeyStorageProvider;
  private debug: boolean;

  constructor(
    primary: KeyStorageProvider,
    fallback: KeyStorageProvider,
    options: { debug?: boolean } = {}
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.debug = options.debug || false;
  }

  async getAppConfig(appId: string) {
    try {
      return await this.primary.getAppConfig(appId);
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[MultiLayerStorage] Primary storage failed for ${appId}, trying fallback:`,
          error
        );
      }
      return await this.fallback.getAppConfig(appId);
    }
  }

  async saveAppConfig(config: any) {
    try {
      await this.primary.saveAppConfig(config);
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[MultiLayerStorage] Primary storage save failed for ${config.appId}, trying fallback:`,
          error
        );
      }
      await this.fallback.saveAppConfig(config);
    }
  }

  async deleteAppConfig(appId: string) {
    const errors: Error[] = [];

    try {
      await this.primary.deleteAppConfig(appId);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      await this.fallback.deleteAppConfig(appId);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (errors.length === 2) {
      throw new KeyManagerError(
        `Failed to delete from both primary and fallback storage: ${errors
          .map((e) => e.message)
          .join(", ")}`,
        "STORAGE_ERROR",
        { appId, errors: errors.map((e) => e.message) }
      );
    }
  }

  async listAppIds() {
    try {
      return await this.primary.listAppIds();
    } catch (error) {
      if (this.debug) {
        console.warn(
          "[MultiLayerStorage] Primary storage list failed, trying fallback:",
          error
        );
      }
      return await this.fallback.listAppIds();
    }
  }

  async getMultipleAppConfigs(appIds: string[]) {
    try {
      return (await this.primary.getMultipleAppConfigs?.(appIds)) || new Map();
    } catch (error) {
      if (this.debug) {
        console.warn(
          "[MultiLayerStorage] Primary storage batch get failed, trying fallback:",
          error
        );
      }
      return (await this.fallback.getMultipleAppConfigs?.(appIds)) || new Map();
    }
  }

  async appExists(appId: string) {
    try {
      return (await this.primary.appExists?.(appId)) || false;
    } catch (error) {
      if (this.debug) {
        console.warn(
          `[MultiLayerStorage] Primary storage exists check failed for ${appId}, trying fallback:`,
          error
        );
      }
      return (await this.fallback.appExists?.(appId)) || false;
    }
  }
}

/**
 * 存储提供者工具函数
 */
export const StorageUtils = {
  /**
   * 测试存储提供者连接
   */
  async testConnection(provider: KeyStorageProvider): Promise<boolean> {
    try {
      await provider.listAppIds();
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * 获取存储提供者信息
   */
  getProviderInfo(provider: KeyStorageProvider): {
    type: string;
    features: string[];
  } {
    const features: string[] = [];

    if (provider.getMultipleAppConfigs) {
      features.push("batch-operations");
    }

    if (provider.appExists) {
      features.push("existence-check");
    }

    // 检查是否为只读存储
    try {
      // 这是一个简单的检查，实际实现可能需要更复杂的逻辑
      const isReadOnly =
        provider.constructor.name.includes("Env") ||
        provider.constructor.name.includes("File");
      if (isReadOnly) {
        features.push("read-only");
      } else {
        features.push("read-write");
      }
    } catch (error) {
      // 忽略错误
    }

    return {
      type: provider.constructor.name
        .replace("StorageProvider", "")
        .toLowerCase(),
      features,
    };
  },

  /**
   * 迁移数据从一个存储提供者到另一个
   */
  async migrateData(
    source: KeyStorageProvider,
    target: KeyStorageProvider,
    options: {
      dryRun?: boolean;
      debug?: boolean;
    } = {}
  ): Promise<{
    migrated: number;
    failed: number;
    errors: Array<{ appId: string; error: string }>;
  }> {
    const result = {
      migrated: 0,
      failed: 0,
      errors: [] as Array<{ appId: string; error: string }>,
    };

    try {
      const appIds = await source.listAppIds();

      if (options.debug) {
        console.log(
          `[StorageUtils] Starting migration of ${appIds.length} apps`
        );
      }

      for (const appId of appIds) {
        try {
          const config = await source.getAppConfig(appId);
          if (!config) {
            continue;
          }

          if (!options.dryRun) {
            await target.saveAppConfig(config);
          }

          result.migrated++;

          if (options.debug) {
            console.log(`[StorageUtils] Migrated app ${appId}`);
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            appId,
            error: error instanceof Error ? error.message : String(error),
          });

          if (options.debug) {
            console.error(
              `[StorageUtils] Failed to migrate app ${appId}:`,
              error
            );
          }
        }
      }

      if (options.debug) {
        console.log(
          `[StorageUtils] Migration completed: ${result.migrated} migrated, ${result.failed} failed`
        );
      }

      return result;
    } catch (error) {
      throw new KeyManagerError(
        `Migration failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STORAGE_ERROR",
        {
          operation: "migrate",
          originalError: error instanceof Error ? error.message : String(error),
        }
      );
    }
  },
};
