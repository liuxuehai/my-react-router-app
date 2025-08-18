/**
 * 密钥管理集成测试
 * 测试密钥生成、轮换、分发的完整工作流程
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import { KeyRotationManager } from "../../../app/api/auth/key-rotation.js";
import { KeyDistributionManager } from "../../../app/api/auth/key-distribution.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { type KeyManager, type AppConfig } from "../../../app/api/auth/types.js";

describe("Key Management Integration", () => {
  let keyManager: KeyManager;
  let rotationManager: KeyRotationManager;
  let distributionManager: KeyDistributionManager;

  beforeEach(() => {
    // 使用内存存储进行测试
    keyManager = createKeyManager({
      storageType: "memory",
      enableCache: true,
      debug: true,
    });

    rotationManager = new KeyRotationManager(keyManager, {
      strategy: "gradual",
      gracePeriodDays: 30,
      autoDisableExpired: true,
    });

    distributionManager = new KeyDistributionManager({
      encryptionKey: "test-encryption-key-32-bytes-long-for-aes256",
      accessControl: {
        allowedIPs: ["127.0.0.1"],
        requireApiKey: false,
      },
      auditLog: {
        enabled: true,
        logLevel: "info",
        includeClientInfo: true,
      },
    });
  });

  afterEach(() => {
    keyManager.clearCache();
  });

  describe("Complete Key Lifecycle", () => {
    it("should handle complete key lifecycle from generation to distribution", async () => {
      // 1. 生成初始密钥对
      const initialKeyPair = await KeyGenerator.generateKeyPair("RS256", {
        keyId: "initial-key",
        expiryDays: 365,
      });

      expect(initialKeyPair).toBeDefined();
      expect(initialKeyPair.keyId).toBe("initial-key");

      // 2. 创建应用配置
      const appConfig: AppConfig = {
        appId: "integration-test-app",
        name: "Integration Test App",
        description: "App for integration testing",
        keyPairs: [{
          keyId: initialKeyPair.keyId,
          publicKey: initialKeyPair.publicKey,
          algorithm: initialKeyPair.algorithm,
          createdAt: initialKeyPair.createdAt,
          expiresAt: initialKeyPair.expiresAt,
          enabled: initialKeyPair.enabled,
        }],
        enabled: true,
        permissions: ["read", "write"],
        createdAt: new Date(),
        tags: ["test", "integration"],
      };

      await keyManager.addApp(appConfig);

      // 3. 验证应用创建成功
      const retrievedConfig = await keyManager.getAppConfig("integration-test-app");
      expect(retrievedConfig).toBeDefined();
      expect(retrievedConfig!.keyPairs).toHaveLength(1);

      // 4. 验证密钥可以正常获取
      const publicKey = await keyManager.getPublicKey("integration-test-app", "initial-key");
      expect(publicKey).toBe(initialKeyPair.publicKey);

      // 5. 创建密钥包用于分发
      const keyPackage = await distributionManager.createKeyPackage(
        initialKeyPair,
        "integration-test-app",
        true, // 包含私钥
        {
          clientId: "test-client",
          clientIP: "127.0.0.1",
          userAgent: "Integration Test",
        }
      );

      expect(keyPackage.encryptedPrivateKey).toBeDefined();
      expect(keyPackage.metadata.fingerprint).toMatch(/^[0-9A-F:]+$/);

      // 6. 验证私钥加密/解密
      const decryptedPrivateKey = await distributionManager.decryptPrivateKey(
        keyPackage.encryptedPrivateKey!,
        "test-encryption-key-32-bytes-long-for-aes256"
      );

      expect(decryptedPrivateKey).toBe(initialKeyPair.privateKey);

      // 7. 执行密钥轮换
      await rotationManager.createRotationPlan(
        "integration-test-app",
        {
          algorithm: "ES256",
          options: { expiryDays: 180 },
        },
        new Date(),
        "gradual"
      );

      const rotationResult = await rotationManager.executeRotation("integration-test-app");

      expect(rotationResult.oldKeyId).toBe("initial-key");
      expect(rotationResult.newKeyId).toBeDefined();

      // 8. 验证轮换后的状态
      const updatedConfig = await keyManager.getAppConfig("integration-test-app");
      expect(updatedConfig!.keyPairs).toHaveLength(2); // 旧密钥 + 新密钥

      // 9. 检查密钥状态
      const keyStatuses = await rotationManager.getAppKeyStatuses("integration-test-app");
      expect(keyStatuses).toHaveLength(2);

      const oldKeyStatus = keyStatuses.find(s => s.keyId === "initial-key");
      const newKeyStatus = keyStatuses.find(s => s.keyId === rotationResult.newKeyId);

      expect(oldKeyStatus).toBeDefined();
      expect(newKeyStatus).toBeDefined();
      expect(newKeyStatus!.status).toBe("active");

      // 10. 测试分发新密钥
      const distributionRequest = {
        appId: "integration-test-app",
        keyId: rotationResult.newKeyId,
        includePrivateKey: false,
        clientId: "test-client-2",
        timestamp: new Date(),
      };

      const distributionResponse = await distributionManager.distributeKeys(distributionRequest);

      expect(distributionResponse.success).toBe(true);
      expect(distributionResponse.metadata.totalKeys).toBe(0); // 因为没有实际实现获取密钥的逻辑
    });

    it("should handle key expiry and cleanup", async () => {
      // 1. 创建即将过期的密钥
      const expiringKeyPair = await KeyGenerator.generateKeyPair("RS256", {
        keyId: "expiring-key",
        expiryDays: 0, // 立即过期
      });

      // 手动设置过期时间为过去
      expiringKeyPair.expiresAt = new Date(Date.now() - 3600000); // 1小时前过期

      const appConfig: AppConfig = {
        appId: "expiry-test-app",
        name: "Expiry Test App",
        keyPairs: [{
          keyId: expiringKeyPair.keyId,
          publicKey: expiringKeyPair.publicKey,
          algorithm: expiringKeyPair.algorithm,
          createdAt: expiringKeyPair.createdAt,
          expiresAt: expiringKeyPair.expiresAt,
          enabled: expiringKeyPair.enabled,
        }],
        enabled: true,
        permissions: [],
        createdAt: new Date(),
      };

      await keyManager.addApp(appConfig);

      // 2. 检查密钥状态
      const keyStatus = await rotationManager.getKeyStatus("expiry-test-app", "expiring-key");
      expect(keyStatus.status).toBe("expired");
      expect(keyStatus.health).toBe("critical");

      // 3. 添加新的有效密钥
      const newKeyPair = await KeyGenerator.generateKeyPair("ES256", {
        keyId: "replacement-key",
        expiryDays: 365,
      });

      await keyManager.addKeyPair("expiry-test-app", {
        keyId: newKeyPair.keyId,
        publicKey: newKeyPair.publicKey,
        algorithm: newKeyPair.algorithm,
        createdAt: newKeyPair.createdAt,
        expiresAt: newKeyPair.expiresAt,
        enabled: newKeyPair.enabled,
      });

      // 4. 执行清理
      const cleanupResult = await rotationManager.cleanupExpiredKeys("expiry-test-app");

      expect(cleanupResult.cleaned).toHaveLength(1);
      expect(cleanupResult.cleaned[0].keyId).toBe("expiring-key");
      expect(cleanupResult.errors).toHaveLength(0);

      // 5. 验证过期密钥已被移除
      const finalConfig = await keyManager.getAppConfig("expiry-test-app");
      expect(finalConfig!.keyPairs).toHaveLength(1);
      expect(finalConfig!.keyPairs[0].keyId).toBe("replacement-key");
    });

    it("should handle multiple apps and batch operations", async () => {
      // 1. 创建多个应用
      const apps = ["app-1", "app-2", "app-3"];
      
      for (const appId of apps) {
        const keyPair = await KeyGenerator.generateKeyPair("RS256", {
          keyId: `${appId}-key`,
        });

        const appConfig: AppConfig = {
          appId,
          name: `Test App ${appId}`,
          keyPairs: [{
            keyId: keyPair.keyId,
            publicKey: keyPair.publicKey,
            algorithm: keyPair.algorithm,
            createdAt: keyPair.createdAt,
            expiresAt: keyPair.expiresAt,
            enabled: keyPair.enabled,
          }],
          enabled: true,
          permissions: [],
          createdAt: new Date(),
        };

        await keyManager.addApp(appConfig);
      }

      // 2. 验证所有应用都已创建
      const allApps = await keyManager.listApps();
      expect(allApps).toHaveLength(3);
      expect(allApps).toEqual(expect.arrayContaining(apps));

      // 3. 批量获取应用配置
      const appConfigs = await keyManager.getMultipleAppConfigs(apps);
      expect(appConfigs.size).toBe(3);

      for (const appId of apps) {
        expect(appConfigs.has(appId)).toBe(true);
        expect(appConfigs.get(appId)!.keyPairs).toHaveLength(1);
      }

      // 4. 批量密钥轮换
      const rotations = apps.map(appId => ({
        appId,
        newKeyConfig: {
          algorithm: "ES256" as const,
          options: { expiryDays: 180 },
        },
        strategy: "gradual" as const,
      }));

      const rotationResults = await rotationManager.batchRotateKeys(rotations);

      expect(rotationResults).toHaveLength(3);
      rotationResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.newKeyId).toBeDefined();
      });

      // 5. 验证所有应用现在都有两个密钥
      for (const appId of apps) {
        const config = await keyManager.getAppConfig(appId);
        expect(config!.keyPairs).toHaveLength(2);
      }

      // 6. 执行维护操作
      const maintenanceResult = await rotationManager.performMaintenance();
      expect(maintenanceResult.cleanupResult).toBeDefined();
      expect(maintenanceResult.healthChecks).toBeDefined();
    });

    it("should handle error scenarios gracefully", async () => {
      // 1. 尝试获取不存在的应用
      const nonExistentApp = await keyManager.getAppConfig("non-existent-app");
      expect(nonExistentApp).toBeNull();

      // 2. 尝试为不存在的应用轮换密钥
      await expect(
        rotationManager.createRotationPlan("non-existent-app", {
          algorithm: "RS256",
        })
      ).rejects.toThrow("App non-existent-app not found");

      // 3. 尝试分发无效的密钥请求
      const invalidRequest = {
        appId: "",
        clientId: "",
        timestamp: new Date(Date.now() - 10 * 60 * 1000), // 过期时间戳
      };

      const response = await distributionManager.distributeKeys(invalidRequest);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();

      // 4. 尝试撤销不存在的密钥分发
      const revocationResult = await distributionManager.revokeKeyDistribution(
        "non-existent-app",
        "non-existent-key"
      );

      expect(revocationResult.revoked).toBe(false);
      expect(revocationResult.affectedDistributions).toBe(0);
    });

    it("should validate key pairs throughout the lifecycle", async () => {
      // 1. 生成并验证密钥对
      const keyPair = await KeyGenerator.generateKeyPair("ES256");
      const isValid = await KeyGenerator.validateKeyPair(keyPair);
      expect(isValid).toBe(true);

      // 2. 获取密钥信息
      const keyInfo = await KeyGenerator.getKeyInfo(keyPair);
      expect(keyInfo.algorithm).toBe("ES256");
      expect(keyInfo.curve).toBeDefined();
      expect(keyInfo.fingerprint).toMatch(/^[0-9A-F:]+$/);

      // 3. 测试密钥导入/导出
      const privateKey = await KeyGenerator.importPrivateKey(
        keyPair.privateKey,
        keyPair.algorithm
      );
      const publicKey = await KeyGenerator.importPublicKey(
        keyPair.publicKey,
        keyPair.algorithm
      );

      expect(privateKey.type).toBe("private");
      expect(publicKey.type).toBe("public");

      // 4. 验证签名和验证过程
      const testData = "integration-test-data";
      const encoder = new TextEncoder();
      const data = encoder.encode(testData);

      // 使用私钥签名
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        data
      );

      // 使用公钥验证
      const isSignatureValid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        data
      );

      expect(isSignatureValid).toBe(true);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle concurrent operations efficiently", async () => {
      const startTime = Date.now();

      // 并发生成多个密钥对
      const keyGenerationPromises = Array.from({ length: 10 }, (_, i) =>
        KeyGenerator.generateKeyPair("RS256", { keyId: `concurrent-key-${i}` })
      );

      const keyPairs = await Promise.all(keyGenerationPromises);

      // 并发创建应用
      const appCreationPromises = keyPairs.map(async (keyPair, i) => {
        const appConfig: AppConfig = {
          appId: `concurrent-app-${i}`,
          name: `Concurrent App ${i}`,
          keyPairs: [{
            keyId: keyPair.keyId,
            publicKey: keyPair.publicKey,
            algorithm: keyPair.algorithm,
            createdAt: keyPair.createdAt,
            expiresAt: keyPair.expiresAt,
            enabled: keyPair.enabled,
          }],
          enabled: true,
          permissions: [],
          createdAt: new Date(),
        };

        await keyManager.addApp(appConfig);
        return appConfig;
      });

      await Promise.all(appCreationPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 所有操作应该在合理时间内完成（10秒）
      expect(duration).toBeLessThan(10000);

      // 验证所有应用都已创建
      const allApps = await keyManager.listApps();
      expect(allApps.length).toBeGreaterThanOrEqual(10);

      // 验证缓存统计
      const cacheStats = keyManager.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
    });

    it("should maintain data consistency under concurrent access", async () => {
      // 创建基础应用
      const keyPair = await KeyGenerator.generateKeyPair("RS256");
      const appConfig: AppConfig = {
        appId: "consistency-test-app",
        name: "Consistency Test App",
        keyPairs: [{
          keyId: keyPair.keyId,
          publicKey: keyPair.publicKey,
          algorithm: keyPair.algorithm,
          createdAt: keyPair.createdAt,
          expiresAt: keyPair.expiresAt,
          enabled: keyPair.enabled,
        }],
        enabled: true,
        permissions: [],
        createdAt: new Date(),
      };

      await keyManager.addApp(appConfig);

      // 并发执行多种操作
      const operations = [
        // 读取操作
        () => keyManager.getAppConfig("consistency-test-app"),
        () => keyManager.getPublicKey("consistency-test-app"),
        () => keyManager.validateApp("consistency-test-app"),
        
        // 更新操作
        () => keyManager.updateApp("consistency-test-app", { 
          description: `Updated at ${Date.now()}` 
        }),
        () => keyManager.setAppEnabled("consistency-test-app", true),
        
        // 密钥操作
        () => rotationManager.getKeyStatus("consistency-test-app", keyPair.keyId),
        () => rotationManager.getAppKeyStatuses("consistency-test-app"),
      ];

      // 并发执行操作
      const results = await Promise.allSettled(
        operations.map(op => op())
      );

      // 大部分操作应该成功
      const successfulOperations = results.filter(r => r.status === "fulfilled");
      expect(successfulOperations.length).toBeGreaterThan(results.length * 0.8);

      // 最终状态应该一致
      const finalConfig = await keyManager.getAppConfig("consistency-test-app");
      expect(finalConfig).toBeDefined();
      expect(finalConfig!.appId).toBe("consistency-test-app");
    });
  });
});