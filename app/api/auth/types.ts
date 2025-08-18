/**
 * 密钥管理相关的类型定义
 */

export interface KeyPair {
  /** 密钥 ID */
  keyId: string;
  /** 公钥（PEM 格式） */
  publicKey: string;
  /** 私钥（PEM 格式，仅客户端使用） */
  privateKey?: string;
  /** 签名算法 */
  algorithm: "RS256" | "RS512" | "ES256" | "ES512";
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt?: Date;
  /** 是否启用 */
  enabled: boolean;
}

export interface AppConfig {
  /** 应用 ID */
  appId: string;
  /** 应用名称 */
  name: string;
  /** 关联的密钥对 */
  keyPairs: KeyPair[];
  /** 是否启用 */
  enabled: boolean;
  /** 权限配置 */
  permissions: string[];
  /** 创建时间 */
  createdAt: Date;
  /** 应用描述 */
  description?: string;
  /** 访问控制配置 */
  accessControl?: AccessControlConfig;
  /** 应用标签 */
  tags?: string[];
  /** 最后更新时间 */
  updatedAt?: Date;
}

export interface AccessControlConfig {
  /** 允许访问的路径模式 */
  allowedPaths?: string[];
  /** 禁止访问的路径模式 */
  deniedPaths?: string[];
  /** IP 白名单 */
  allowedIPs?: string[];
  /** 速率限制配置 */
  rateLimit?: {
    /** 每分钟最大请求数 */
    requestsPerMinute: number;
    /** 突发请求数 */
    burstLimit?: number;
  };
  /** 时间窗口限制（秒） */
  customTimeWindow?: number;
}

export interface KeyManager {
  /** 获取应用配置 */
  getAppConfig(appId: string): Promise<AppConfig | null>;
  /** 获取公钥 */
  getPublicKey(appId: string, keyId?: string): Promise<string | null>;
  /** 验证应用是否有效 */
  validateApp(appId: string): Promise<boolean>;
  /** 添加应用配置 */
  addApp(config: AppConfig): Promise<void>;
  /** 更新应用配置 */
  updateApp(appId: string, config: Partial<AppConfig>): Promise<void>;
  /** 生成密钥对 */
  generateKeyPair(algorithm: string): Promise<KeyPair>;
  /** 清除缓存 */
  clearCache(): void;
  /** 获取缓存统计信息 */
  getCacheStats(): { size: number; hitRate?: number };
  
  // Multi-channel and multi-key support methods
  /** 列出所有应用 ID */
  listApps(): Promise<string[]>;
  /** 批量获取应用配置 */
  getMultipleAppConfigs(appIds: string[]): Promise<Map<string, AppConfig>>;
  /** 启用/禁用应用 */
  setAppEnabled(appId: string, enabled: boolean): Promise<void>;
  /** 添加密钥对到现有应用 */
  addKeyPair(appId: string, keyPair: KeyPair): Promise<void>;
  /** 更新密钥对 */
  updateKeyPair(appId: string, keyId: string, updates: Partial<KeyPair>): Promise<void>;
  /** 删除密钥对 */
  removeKeyPair(appId: string, keyId: string): Promise<void>;
  /** 启用/禁用密钥对 */
  setKeyPairEnabled(appId: string, keyId: string, enabled: boolean): Promise<void>;
  /** 验证访问权限 */
  validateAccess(appId: string, path: string, method: string, clientIP?: string): Promise<boolean>;
  /** 获取应用的有效密钥对 */
  getValidKeyPairs(appId: string): Promise<KeyPair[]>;
}

export interface KeyStorageProvider {
  /** 获取应用配置 */
  getAppConfig(appId: string): Promise<AppConfig | null>;
  /** 保存应用配置 */
  saveAppConfig(config: AppConfig): Promise<void>;
  /** 删除应用配置 */
  deleteAppConfig(appId: string): Promise<void>;
  /** 列出所有应用 ID */
  listAppIds(): Promise<string[]>;
  /** 批量获取应用配置 */
  getMultipleAppConfigs?(appIds: string[]): Promise<Map<string, AppConfig>>;
  /** 检查应用是否存在 */
  appExists?(appId: string): Promise<boolean>;
}

export interface KeyManagerConfig {
  /** 存储提供者类型 */
  storageType: "env" | "kv" | "memory" | "file";
  /** 缓存过期时间（秒） */
  cacheExpiry: number;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 调试模式 */
  debug: boolean;
  /** 存储特定配置 */
  storageConfig?: {
    /** KV 存储配置 */
    kv?: {
      keyPrefix?: string;
      retryConfig?: {
        maxRetries?: number;
        baseDelay?: number;
        maxDelay?: number;
      };
    };
    /** 文件存储配置 */
    file?: {
      configPath: string;
    };
  };
}

export class KeyManagerError extends Error {
  constructor(
    message: string,
    public code:
      | "KEY_NOT_FOUND"
      | "APP_NOT_FOUND"
      | "INVALID_KEY_FORMAT"
      | "STORAGE_ERROR"
      | "VALIDATION_ERROR",
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "KeyManagerError";
  }
}
