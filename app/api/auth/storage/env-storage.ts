import {
  type KeyStorageProvider,
  type AppConfig,
  type KeyPair,
  type AccessControlConfig,
  KeyManagerError,
} from "../types.js";

/**
 * 重试配置接口
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

/**
 * 基于环境变量的密钥存储提供者
 *
 * 环境变量格式:
 * APP_{APP_ID}_PUBLIC_KEY - 公钥内容
 * APP_{APP_ID}_ALGORITHM - 签名算法
 * APP_{APP_ID}_ENABLED - 是否启用
 * APP_{APP_ID}_NAME - 应用名称
 * APP_{APP_ID}_PERMISSIONS - 权限列表（逗号分隔）
 * APP_{APP_ID}_DESCRIPTION - 应用描述
 * APP_{APP_ID}_TAGS - 应用标签（逗号分隔）
 * APP_{APP_ID}_ALLOWED_PATHS - 允许访问的路径（逗号分隔）
 * APP_{APP_ID}_DENIED_PATHS - 禁止访问的路径（逗号分隔）
 * APP_{APP_ID}_ALLOWED_IPS - IP白名单（逗号分隔）
 * APP_{APP_ID}_RATE_LIMIT - 速率限制（格式：requests_per_minute:burst_limit）
 * APP_{APP_ID}_TIME_WINDOW - 自定义时间窗口（秒）
 *
 * 多密钥支持:
 * APP_{APP_ID}_KEY_{KEY_ID}_PUBLIC_KEY - 特定密钥的公钥
 * APP_{APP_ID}_KEY_{KEY_ID}_ALGORITHM - 特定密钥的算法
 * APP_{APP_ID}_KEY_{KEY_ID}_ENABLED - 特定密钥是否启用
 * APP_{APP_ID}_KEY_{KEY_ID}_EXPIRES_AT - 特定密钥的过期时间（ISO格式）
 */
export class EnvStorageProvider implements KeyStorageProvider {
  private env: Record<string, string | undefined>;
  private debug: boolean;
  private retryConfig: RetryConfig;

  constructor(
    env: Record<string, string | undefined> = process.env,
    options: {
      debug?: boolean;
      retryConfig?: Partial<RetryConfig>;
    } = {}
  ) {
    this.env = env;
    this.debug = options.debug || false;
    this.retryConfig = {
      maxRetries: options.retryConfig?.maxRetries || 3,
      baseDelay: options.retryConfig?.baseDelay || 100,
      maxDelay: options.retryConfig?.maxDelay || 2000,
    };
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    return this.withRetry(async () => {
      const prefix = `APP_${appId.toUpperCase()}_`;

      // 检查是否存在默认公钥或任何密钥
      const hasDefaultKey = !!this.env[`${prefix}PUBLIC_KEY`];
      const hasAnyKey = hasDefaultKey || this.hasAnyKeyForApp(appId);

      if (!hasAnyKey) {
        if (this.debug) {
          console.log(`[EnvStorage] App config not found for ${appId}`);
        }
        return null;
      }

    const enabled = this.env[`${prefix}ENABLED`] !== "false";
    const name = this.env[`${prefix}NAME`] || appId;
    const permissions =
      this.env[`${prefix}PERMISSIONS`]?.split(",").map((p) => p.trim()) || [];
    const description = this.env[`${prefix}DESCRIPTION`];
    const tags =
      this.env[`${prefix}TAGS`]?.split(",").map((t) => t.trim()) || [];

    // 构建密钥对列表
    const keyPairs: KeyPair[] = [];

    // 添加默认密钥（如果存在）
    if (hasDefaultKey) {
      const publicKey = this.env[`${prefix}PUBLIC_KEY`]!;
      const algorithm =
        (this.env[`${prefix}ALGORITHM`] as KeyPair["algorithm"]) || "RS256";

      // 验证公钥格式
      if (!this.validatePublicKeyFormat(publicKey)) {
        throw new KeyManagerError(
          `Invalid public key format for app ${appId}`,
          "INVALID_KEY_FORMAT",
          { appId, keyId: "default", keyFormat: "PEM" }
        );
      }

      // 验证算法
      if (!["RS256", "RS512", "ES256", "ES512"].includes(algorithm)) {
        throw new KeyManagerError(
          `Unsupported algorithm ${algorithm} for app ${appId}`,
          "VALIDATION_ERROR",
          {
            appId,
            keyId: "default",
            algorithm,
            supportedAlgorithms: ["RS256", "RS512", "ES256", "ES512"],
          }
        );
      }

      keyPairs.push({
        keyId: "default",
        publicKey,
        algorithm,
        createdAt: new Date(),
        enabled: true,
      });
    }

    // 添加其他密钥
    const additionalKeys = this.getAdditionalKeysForApp(appId);
    keyPairs.push(...additionalKeys);

      // 构建访问控制配置
      const accessControl = this.buildAccessControlConfig(prefix);

      if (this.debug) {
        console.log(`[EnvStorage] Loaded app config for ${appId} with ${keyPairs.length} key pairs`);
      }

      return {
        appId,
        name,
        keyPairs,
        enabled,
        permissions,
        createdAt: new Date(),
        description,
        tags,
        accessControl,
      };
    });
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    throw new KeyManagerError(
      "Environment storage provider is read-only",
      "STORAGE_ERROR",
      { operation: "save", appId: config.appId }
    );
  }

  async deleteAppConfig(appId: string): Promise<void> {
    throw new KeyManagerError(
      "Environment storage provider is read-only",
      "STORAGE_ERROR",
      { operation: "delete", appId }
    );
  }

  async listAppIds(): Promise<string[]> {
    return this.withRetry(async () => {
      const appIds = new Set<string>();

      for (const key of Object.keys(this.env)) {
        if (
          key.startsWith("APP_") &&
          (key.endsWith("_PUBLIC_KEY") ||
            (key.includes("_KEY_") && key.endsWith("_PUBLIC_KEY")))
        ) {
          let appId: string;
          if (key.includes("_KEY_")) {
            // Extract app ID from APP_{APP_ID}_KEY_{KEY_ID}_PUBLIC_KEY
            const match = key.match(/^APP_(.+?)_KEY_/);
            if (match) {
              appId = match[1].toLowerCase();
            } else {
              continue;
            }
          } else {
            // Extract app ID from APP_{APP_ID}_PUBLIC_KEY
            appId = key.slice(4, -11).toLowerCase(); // Remove APP_ prefix and _PUBLIC_KEY suffix
          }
          appIds.add(appId);
        }
      }

      const result = Array.from(appIds);
      if (this.debug) {
        console.log(`[EnvStorage] Found ${result.length} apps in environment variables`);
      }

      return result;
    });
  }

  async getMultipleAppConfigs(
    appIds: string[]
  ): Promise<Map<string, AppConfig>> {
    return this.withRetry(async () => {
      const result = new Map<string, AppConfig>();

      for (const appId of appIds) {
        try {
          const config = await this.getAppConfig(appId);
          if (config) {
            result.set(appId, config);
          }
        } catch (error) {
          if (this.debug) {
            console.warn(`[EnvStorage] Failed to load config for ${appId}:`, error);
          }
          // 继续处理其他应用，不抛出错误
        }
      }

      if (this.debug) {
        console.log(`[EnvStorage] Loaded ${result.size} app configs out of ${appIds.length} requested`);
      }

      return result;
    });
  }

  async appExists(appId: string): Promise<boolean> {
    try {
      return this.withRetry(async () => {
        const prefix = `APP_${appId.toUpperCase()}_`;
        const exists = !!this.env[`${prefix}PUBLIC_KEY`] || this.hasAnyKeyForApp(appId);
        
        if (this.debug) {
          console.log(`[EnvStorage] App ${appId} exists: ${exists}`);
        }
        
        return exists;
      });
    } catch (error) {
      if (this.debug) {
        console.error(`[EnvStorage] Error checking if app ${appId} exists:`, error);
      }
      return false;
    }
  }

  private validatePublicKeyFormat(publicKey: string): boolean {
    // 基本的 PEM 格式验证
    const pemRegex =
      /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    return pemRegex.test(publicKey.trim());
  }

  /**
   * 检查应用是否有任何密钥配置
   */
  private hasAnyKeyForApp(appId: string): boolean {
    const upperAppId = appId.toUpperCase();

    for (const key of Object.keys(this.env)) {
      if (
        key.startsWith(`APP_${upperAppId}_KEY_`) &&
        key.endsWith("_PUBLIC_KEY")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取应用的额外密钥对
   */
  private getAdditionalKeysForApp(appId: string): KeyPair[] {
    const upperAppId = appId.toUpperCase();
    const keyPairs: KeyPair[] = [];
    const keyIds = new Set<string>();

    // 查找所有密钥 ID
    for (const key of Object.keys(this.env)) {
      const match = key.match(
        new RegExp(`^APP_${upperAppId}_KEY_(.+?)_PUBLIC_KEY$`)
      );
      if (match) {
        keyIds.add(match[1]);
      }
    }

    // 为每个密钥 ID 构建密钥对
    for (const keyId of keyIds) {
      const keyPrefix = `APP_${upperAppId}_KEY_${keyId}_`;
      const publicKey = this.env[`${keyPrefix}PUBLIC_KEY`];

      if (!publicKey) {
        continue;
      }

      const algorithm =
        (this.env[`${keyPrefix}ALGORITHM`] as KeyPair["algorithm"]) || "RS256";
      const enabled = this.env[`${keyPrefix}ENABLED`] !== "false";
      const expiresAtStr = this.env[`${keyPrefix}EXPIRES_AT`];

      // 验证公钥格式
      if (!this.validatePublicKeyFormat(publicKey)) {
        console.warn(
          `[EnvStorage] Invalid public key format for app ${appId}, key ${keyId}`
        );
        continue;
      }

      // 验证算法
      if (!["RS256", "RS512", "ES256", "ES512"].includes(algorithm)) {
        console.warn(
          `[EnvStorage] Unsupported algorithm ${algorithm} for app ${appId}, key ${keyId}`
        );
        continue;
      }

      let expiresAt: Date | undefined;
      if (expiresAtStr) {
        try {
          expiresAt = new Date(expiresAtStr);
          if (isNaN(expiresAt.getTime())) {
            console.warn(
              `[EnvStorage] Invalid expiration date for app ${appId}, key ${keyId}: ${expiresAtStr}`
            );
            expiresAt = undefined;
          }
        } catch (error) {
          console.warn(
            `[EnvStorage] Error parsing expiration date for app ${appId}, key ${keyId}:`,
            error
          );
        }
      }

      keyPairs.push({
        keyId: keyId.toLowerCase(),
        publicKey,
        algorithm,
        createdAt: new Date(),
        enabled,
        expiresAt,
      });
    }

    return keyPairs;
  }

  /**
   * 构建访问控制配置
   */
  private buildAccessControlConfig(
    prefix: string
  ): AccessControlConfig | undefined {
    const allowedPaths = this.env[`${prefix}ALLOWED_PATHS`]
      ?.split(",")
      .map((p) => p.trim())
      .filter((p) => p);
    const deniedPaths = this.env[`${prefix}DENIED_PATHS`]
      ?.split(",")
      .map((p) => p.trim())
      .filter((p) => p);
    const allowedIPs = this.env[`${prefix}ALLOWED_IPS`]
      ?.split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip);
    const rateLimitStr = this.env[`${prefix}RATE_LIMIT`];
    const customTimeWindowStr = this.env[`${prefix}TIME_WINDOW`];

    let rateLimit: AccessControlConfig["rateLimit"];
    if (rateLimitStr) {
      const parts = rateLimitStr.split(":");
      const requestsPerMinute = parseInt(parts[0], 10);
      const burstLimit = parts[1] ? parseInt(parts[1], 10) : undefined;

      if (!isNaN(requestsPerMinute) && requestsPerMinute > 0) {
        rateLimit = {
          requestsPerMinute,
          burstLimit: !isNaN(burstLimit!) ? burstLimit : undefined,
        };
      }
    }

    let customTimeWindow: number | undefined;
    if (customTimeWindowStr) {
      const timeWindow = parseInt(customTimeWindowStr, 10);
      if (!isNaN(timeWindow) && timeWindow > 0) {
        customTimeWindow = timeWindow;
      }
    }

    // 如果没有任何访问控制配置，返回 undefined
    if (
      !allowedPaths?.length &&
      !deniedPaths?.length &&
      !allowedIPs?.length &&
      !rateLimit &&
      !customTimeWindow
    ) {
      return undefined;
    }

    return {
      allowedPaths: allowedPaths?.length ? allowedPaths : undefined,
      deniedPaths: deniedPaths?.length ? deniedPaths : undefined,
      allowedIPs: allowedIPs?.length ? allowedIPs : undefined,
      rateLimit,
      customTimeWindow,
    };
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
            `[EnvStorage] Operation failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`,
            error
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}
