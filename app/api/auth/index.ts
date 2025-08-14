/**
 * API 签名认证模块导出
 */

// 类型定义
export type {
  KeyPair,
  AppConfig,
  KeyManager,
  KeyStorageProvider,
  KeyManagerConfig,
} from "./types.js";

export { KeyManagerError } from "./types.js";

// 密钥管理器
export { KeyManagerImpl, createKeyManager } from "./key-manager.js";

// 存储提供者
export { EnvStorageProvider } from "./storage/env-storage.js";
export { MemoryStorageProvider } from "./storage/memory-storage.js";

// 配置管理
export { AuthConfigManager, createKeyManagerConfigFromEnv } from "./config.js";
export type { SignatureAuthEnvironment } from "./config.js";

// 签名工具（从之前的任务）
export { SignatureUtils } from "./signature-utils.js";
