/**
 * 测试配置和工具函数
 * Test configuration and utility functions for end-to-end tests
 */

import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import type { KeyPair, AppConfig } from "../../../app/api/auth/types.js";

export interface TestKeyPair {
  keyId: string;
  publicKey: string;
  privateKey: string;
  algorithm: "RS256" | "RS512" | "ES256" | "ES512";
}

export interface TestAppConfig {
  appId: string;
  name: string;
  keyPairs: TestKeyPair[];
  enabled: boolean;
  permissions: string[];
  accessControl?: {
    allowedPaths?: string[];
    deniedPaths?: string[];
    allowedIPs?: string[];
    customTimeWindow?: number;
  };
}

/**
 * 测试配置常量
 */
export const TEST_CONFIG = {
  // 应用 ID
  APPS: {
    PARTNER_A: "test-partner-a",
    PARTNER_B: "test-partner-b",
    INTERNAL: "test-internal-service",
    DISABLED: "test-disabled-app",
    EXPIRED: "test-expired-app",
  },
  
  // 密钥 ID
  KEYS: {
    PRIMARY: "primary-key",
    BACKUP: "backup-key",
    EXPIRED: "expired-key",
    DISABLED: "disabled-key",
    ROTATION: "rotation-key",
  },
  
  // 支持的算法
  ALGORITHMS: ["RS256", "RS512", "ES256", "ES512"] as const,
  
  // 时间窗口配置
  TIME_WINDOWS: {
    SHORT: 60,    // 1 minute
    NORMAL: 300,  // 5 minutes
    LONG: 900,    // 15 minutes
  },
  
  // 测试路径
  PATHS: {
    USERS: "/api/users",
    HEALTH: "/api/health",
    ADMIN: "/api/admin",
    PUBLIC: "/api/public",
    INTERNAL: "/api/internal",
  },
  
  // 性能基准
  PERFORMANCE: {
    MAX_VERIFICATION_TIME: 100, // ms
    MIN_SUCCESS_RATE: 0.95,     // 95%
    MAX_MEMORY_PER_REQUEST: 50 * 1024, // 50KB
  },
} as const;

/**
 * 测试密钥生成器
 */
export class TestKeyGenerator {
  private static keyCache = new Map<string, TestKeyPair>();

  /**
   * 生成或获取缓存的测试密钥对
   */
  static async getOrGenerateKeyPair(algorithm: "RS256" | "RS512" | "ES256" | "ES512", keyId?: string): Promise<TestKeyPair> {
    const cacheKey = `${algorithm}-${keyId || 'default'}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    const keyPair = await KeyGenerator.generateKeyPair(algorithm, {
      keyId: keyId || `test-${algorithm.toLowerCase()}`,
    });

    const testKeyPair: TestKeyPair = {
      keyId: keyPair.keyId,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey!,
      algorithm: keyPair.algorithm,
    };

    this.keyCache.set(cacheKey, testKeyPair);
    return testKeyPair;
  }

  /**
   * 批量生成测试密钥对
   */
  static async generateMultipleKeyPairs(configs: Array<{ algorithm: "RS256" | "RS512" | "ES256" | "ES512"; keyId: string }>): Promise<TestKeyPair[]> {
    const promises = configs.map(config => 
      this.getOrGenerateKeyPair(config.algorithm, config.keyId)
    );
    return Promise.all(promises);
  }

  /**
   * 清除密钥缓存
   */
  static clearCache(): void {
    this.keyCache.clear();
  }
}

/**
 * 测试应用配置生成器
 */
export class TestAppConfigGenerator {
  /**
   * 生成标准测试应用配置
   */
  static async generateStandardApps(): Promise<TestAppConfig[]> {
    const apps: TestAppConfig[] = [];

    // Partner A - 多密钥，全权限
    const partnerAKeys = await TestKeyGenerator.generateMultipleKeyPairs([
      { algorithm: "RS256", keyId: TEST_CONFIG.KEYS.PRIMARY },
      { algorithm: "ES256", keyId: TEST_CONFIG.KEYS.BACKUP },
    ]);

    apps.push({
      appId: TEST_CONFIG.APPS.PARTNER_A,
      name: "Test Partner A",
      keyPairs: partnerAKeys,
      enabled: true,
      permissions: ["read", "write", "admin"],
      accessControl: {
        allowedPaths: ["/api/*"],
        customTimeWindow: TEST_CONFIG.TIME_WINDOWS.NORMAL,
      },
    });

    // Partner B - 单密钥，受限权限
    const partnerBKeys = await TestKeyGenerator.generateMultipleKeyPairs([
      { algorithm: "ES256", keyId: TEST_CONFIG.KEYS.BACKUP },
    ]);

    apps.push({
      appId: TEST_CONFIG.APPS.PARTNER_B,
      name: "Test Partner B",
      keyPairs: partnerBKeys,
      enabled: true,
      permissions: ["read"],
      accessControl: {
        allowedPaths: ["/api/public/*", "/api/users"],
        deniedPaths: ["/api/admin/*", "/api/internal/*"],
        customTimeWindow: TEST_CONFIG.TIME_WINDOWS.SHORT,
      },
    });

    // Internal Service - 高权限
    const internalKeys = await TestKeyGenerator.generateMultipleKeyPairs([
      { algorithm: "RS512", keyId: TEST_CONFIG.KEYS.PRIMARY },
    ]);

    apps.push({
      appId: TEST_CONFIG.APPS.INTERNAL,
      name: "Test Internal Service",
      keyPairs: internalKeys,
      enabled: true,
      permissions: ["read", "write", "admin", "internal"],
      accessControl: {
        allowedPaths: ["/api/**"],
        customTimeWindow: TEST_CONFIG.TIME_WINDOWS.LONG,
      },
    });

    return apps;
  }

  /**
   * 生成特殊测试场景的应用配置
   */
  static async generateSpecialScenarioApps(): Promise<TestAppConfig[]> {
    const apps: TestAppConfig[] = [];

    // 禁用的应用
    const disabledKeys = await TestKeyGenerator.generateMultipleKeyPairs([
      { algorithm: "RS256", keyId: TEST_CONFIG.KEYS.PRIMARY },
    ]);

    apps.push({
      appId: TEST_CONFIG.APPS.DISABLED,
      name: "Test Disabled App",
      keyPairs: disabledKeys,
      enabled: false, // 禁用状态
      permissions: ["read"],
    });

    // 过期密钥的应用
    const expiredKeys = await TestKeyGenerator.generateMultipleKeyPairs([
      { algorithm: "ES256", keyId: TEST_CONFIG.KEYS.EXPIRED },
    ]);

    apps.push({
      appId: TEST_CONFIG.APPS.EXPIRED,
      name: "Test Expired Key App",
      keyPairs: expiredKeys,
      enabled: true,
      permissions: ["read"],
    });

    return apps;
  }

  /**
   * 转换为 KeyManager 兼容的配置
   */
  static convertToAppConfig(testConfig: TestAppConfig): AppConfig {
    return {
      appId: testConfig.appId,
      name: testConfig.name,
      keyPairs: testConfig.keyPairs.map(kp => ({
        keyId: kp.keyId,
        publicKey: kp.publicKey,
        algorithm: kp.algorithm,
        createdAt: new Date(),
        enabled: true,
      })),
      enabled: testConfig.enabled,
      permissions: testConfig.permissions,
      createdAt: new Date(),
      accessControl: testConfig.accessControl,
    };
  }
}

/**
 * 测试工具函数
 */
export class TestUtils {
  /**
   * 等待指定时间
   */
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 生成随机字符串
   */
  static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 生成大型测试数据
   */
  static generateLargeTestData(sizeKB: number): any {
    const targetSize = sizeKB * 1024;
    const baseString = "test data ".repeat(100); // ~900 bytes
    const repeatCount = Math.ceil(targetSize / baseString.length);
    
    return {
      id: this.generateRandomString(10),
      timestamp: new Date().toISOString(),
      data: baseString.repeat(repeatCount).substring(0, targetSize),
      metadata: {
        size: targetSize,
        generated: true,
      },
    };
  }

  /**
   * 测量函数执行时间
   */
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    
    return {
      result,
      duration: endTime - startTime,
    };
  }

  /**
   * 批量执行函数并收集统计信息
   */
  static async executeBatch<T>(
    fn: (index: number) => Promise<T>,
    count: number,
    concurrency: number = 10
  ): Promise<{
    results: T[];
    stats: {
      totalTime: number;
      avgTime: number;
      minTime: number;
      maxTime: number;
      successCount: number;
      errorCount: number;
    };
  }> {
    const startTime = performance.now();
    const results: T[] = [];
    const durations: number[] = [];
    let successCount = 0;
    let errorCount = 0;

    // 分批执行以控制并发
    for (let i = 0; i < count; i += concurrency) {
      const batch = Array.from(
        { length: Math.min(concurrency, count - i) },
        (_, j) => i + j
      );

      const batchPromises = batch.map(async (index) => {
        const itemStartTime = performance.now();
        try {
          const result = await fn(index);
          const itemDuration = performance.now() - itemStartTime;
          durations.push(itemDuration);
          successCount++;
          return result;
        } catch (error) {
          const itemDuration = performance.now() - itemStartTime;
          durations.push(itemDuration);
          errorCount++;
          throw error;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      });
    }

    const totalTime = performance.now() - startTime;
    const avgTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const minTime = Math.min(...durations);
    const maxTime = Math.max(...durations);

    return {
      results,
      stats: {
        totalTime,
        avgTime,
        minTime,
        maxTime,
        successCount,
        errorCount,
      },
    };
  }

  /**
   * 验证性能指标
   */
  static validatePerformanceMetrics(
    stats: { avgTime: number; maxTime: number; successCount: number; errorCount: number },
    requirements: { maxAvgTime?: number; maxTime?: number; minSuccessRate?: number }
  ): { passed: boolean; violations: string[] } {
    const violations: string[] = [];
    const totalRequests = stats.successCount + stats.errorCount;
    const successRate = stats.successCount / totalRequests;

    if (requirements.maxAvgTime && stats.avgTime > requirements.maxAvgTime) {
      violations.push(`Average time ${stats.avgTime.toFixed(2)}ms exceeds limit ${requirements.maxAvgTime}ms`);
    }

    if (requirements.maxTime && stats.maxTime > requirements.maxTime) {
      violations.push(`Maximum time ${stats.maxTime.toFixed(2)}ms exceeds limit ${requirements.maxTime}ms`);
    }

    if (requirements.minSuccessRate && successRate < requirements.minSuccessRate) {
      violations.push(`Success rate ${(successRate * 100).toFixed(1)}% below minimum ${(requirements.minSuccessRate * 100).toFixed(1)}%`);
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  /**
   * 生成测试用户数据
   */
  static generateUser(id?: number): any {
    return {
      id: id || Math.floor(Math.random() * 10000),
      name: `Test User ${TestUtils.generateRandomString(5)}`,
      email: `test${TestUtils.generateRandomString(8)}@example.com`,
      createdAt: new Date().toISOString(),
      active: Math.random() > 0.1, // 90% active
    };
  }

  /**
   * 生成批量用户数据
   */
  static generateUsers(count: number): any[] {
    return Array.from({ length: count }, (_, i) => this.generateUser(i + 1));
  }

  /**
   * 生成复杂的嵌套数据结构
   */
  static generateComplexData(depth: number = 3, breadth: number = 5): any {
    if (depth <= 0) {
      return TestUtils.generateRandomString(20);
    }

    const data: any = {};
    
    for (let i = 0; i < breadth; i++) {
      const key = `field_${i}`;
      
      if (Math.random() > 0.5) {
        data[key] = this.generateComplexData(depth - 1, breadth);
      } else {
        data[key] = TestUtils.generateRandomString(10);
      }
    }

    return data;
  }

  /**
   * 生成不同类型的测试路径
   */
  static generateTestPaths(): string[] {
    return [
      "/api/users",
      "/api/users/123",
      "/api/users/123/profile",
      "/api/orders?status=active",
      "/api/search?q=test&limit=10",
      "/api/data/export.json",
      "/api/files/upload",
      "/api/admin/settings",
      "/api/internal/metrics",
      "/api/public/health",
    ];
  }
}

export default {
  TEST_CONFIG,
  TestKeyGenerator,
  TestAppConfigGenerator,
  TestUtils,
  TestDataGenerator,
};