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
}

export interface KeyManagerConfig {
  /** 存储提供者类型 */
  storageType: "env" | "kv" | "memory";
  /** 缓存过期时间（秒） */
  cacheExpiry: number;
  /** 是否启用缓存 */
  enableCache: boolean;
  /** 调试模式 */
  debug: boolean;
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
