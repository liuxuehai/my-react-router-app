/**
 * 密钥管理器使用示例
 */

import { createKeyManager, createKeyManagerConfigFromEnv } from "../index.js";

/**
 * 基本使用示例
 */
export async function basicUsageExample() {
  // 创建密钥管理器配置
  const config = createKeyManagerConfigFromEnv({
    KEY_STORAGE_TYPE: "memory",
    KEY_CACHE_EXPIRY: "600",
    KEY_ENABLE_CACHE: "true",
    SIGNATURE_DEBUG: "true",
  });

  // 创建密钥管理器
  const keyManager = createKeyManager(config);

  // 添加应用配置
  await keyManager.addApp({
    appId: "demo-app",
    name: "Demo Application",
    keyPairs: [
      {
        keyId: "default",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
        algorithm: "RS256",
        createdAt: new Date(),
        enabled: true,
      },
    ],
    enabled: true,
    permissions: ["read", "write"],
    createdAt: new Date(),
  });

  // 验证应用
  const isValid = await keyManager.validateApp("demo-app");
  console.log("App is valid:", isValid);

  // 获取公钥
  const publicKey = await keyManager.getPublicKey("demo-app");
  console.log("Public key retrieved:", publicKey ? "Yes" : "No");

  return keyManager;
}

/**
 * 环境变量配置示例
 */
export async function envConfigExample() {
  // 模拟环境变量
  const env = {
    APP_TESTAPP_PUBLIC_KEY:
      "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
    APP_TESTAPP_ALGORITHM: "RS256",
    APP_TESTAPP_ENABLED: "true",
    APP_TESTAPP_NAME: "Test Application",
    APP_TESTAPP_PERMISSIONS: "read,write,admin",
  };

  // 创建使用环境变量的密钥管理器
  const keyManager = createKeyManager({ storageType: "env" }, env);

  // 获取应用配置
  const appConfig = await keyManager.getAppConfig("testapp");
  console.log("App config from env:", appConfig);

  return keyManager;
}

/**
 * 错误处理示例
 */
export async function errorHandlingExample() {
  const keyManager = createKeyManager({ storageType: "memory" });

  try {
    // 尝试获取不存在的应用的公钥
    await keyManager.getPublicKey("non-existent-app");
  } catch (error) {
    console.log(
      "Expected error for non-existent app:",
      (error as Error).message
    );
  }

  try {
    // 尝试使用不支持的算法生成密钥对
    await keyManager.generateKeyPair("INVALID_ALGORITHM");
  } catch (error) {
    console.log(
      "Expected error for invalid algorithm:",
      (error as Error).message
    );
  }
}

/**
 * 缓存管理示例
 */
export async function cacheManagementExample() {
  const keyManager = createKeyManager({
    storageType: "memory",
    enableCache: true,
    cacheExpiry: 300,
  });

  // 添加应用
  await keyManager.addApp({
    appId: "cached-app",
    name: "Cached Application",
    keyPairs: [
      {
        keyId: "default",
        publicKey:
          "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
        algorithm: "RS256",
        createdAt: new Date(),
        enabled: true,
      },
    ],
    enabled: true,
    permissions: ["read"],
    createdAt: new Date(),
  });

  // 第一次访问 - 从存储加载
  await keyManager.getAppConfig("cached-app");
  console.log("Cache stats after first access:", keyManager.getCacheStats());

  // 第二次访问 - 从缓存获取
  await keyManager.getAppConfig("cached-app");
  console.log("Cache stats after second access:", keyManager.getCacheStats());

  // 清除缓存
  keyManager.clearCache();
  console.log("Cache stats after clear:", keyManager.getCacheStats());
}

// 如果直接运行此文件，执行示例
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("=== Key Manager Examples ===\n");

  console.log("1. Basic Usage Example:");
  await basicUsageExample();

  console.log("\n2. Environment Config Example:");
  await envConfigExample();

  console.log("\n3. Error Handling Example:");
  await errorHandlingExample();

  console.log("\n4. Cache Management Example:");
  await cacheManagementExample();

  console.log("\n=== Examples Complete ===");
}
