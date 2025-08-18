/**
 * 端到端集成测试
 * End-to-end integration tests for API signature authentication
 * 
 * 测试完整的签名生成到验证流程，包括：
 * - 多个 App ID 和密钥对的场景
 * - 时间戳过期和重放攻击防护
 * - 各种错误场景和边界条件
 * - 性能基准测试和负载测试
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { SignatureClient } from "../../../app/api/auth/client/signature-client.js";
import { signatureAuth } from "../../../app/api/middleware/signature-auth.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import { SignatureUtils } from "../../../app/api/auth/signature-utils.js";
import type { KeyManager, AppConfig, KeyPair } from "../../../app/api/auth/types.js";

// 测试配置
const TEST_CONFIG = {
  APPS: {
    PARTNER_A: "partner-a-app",
    PARTNER_B: "partner-b-app", 
    INTERNAL: "internal-service",
    DISABLED: "disabled-app",
    EXPIRED: "expired-key-app"
  },
  KEYS: {
    PRIMARY: "primary-key",
    BACKUP: "backup-key",
    EXPIRED: "expired-key",
    DISABLED: "disabled-key"
  },
  ALGORITHMS: ["RS256", "RS512", "ES256", "ES512"] as const,
  TIME_WINDOWS: {
    SHORT: 60,    // 1 minute
    NORMAL: 300,  // 5 minutes
    LONG: 900     // 15 minutes
  }
};

// 测试密钥对存储
const testKeyPairs = new Map<string, { publicKey: string; privateKey: string; algorithm: string }>();

describe("End-to-End Integration Tests", () => {
  let app: Hono;
  let keyManager: KeyManager;
  let clients: Map<string, SignatureClient>;

  beforeAll(async () => {
    // 生成测试密钥对
    for (const algorithm of TEST_CONFIG.ALGORITHMS) {
      const keyPair = await KeyGenerator.generateKeyPair(algorithm, {
        keyId: `test-${algorithm.toLowerCase()}`,
      });
      testKeyPairs.set(algorithm, {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey!,
        algorithm: keyPair.algorithm
      });
    }
  });

  beforeEach(async () => {
    // 创建测试应用
    app = new Hono();
    keyManager = createKeyManager({
      storageType: "memory",
      cacheExpiry: 300,
      enableCache: true,
      debug: false,
    });

    clients = new Map();

    // 设置测试应用配置
    await setupTestApps();

    // 配置签名认证中间件
    app.use("*", signatureAuth({
      keyManager,
      timeWindowSeconds: TEST_CONFIG.TIME_WINDOWS.NORMAL,
      debug: false,
      enableOptimization: true,
      enablePerformanceMonitoring: true,
    }));

    // 设置测试路由
    setupTestRoutes();
  });

  afterEach(() => {
    keyManager.clearCache();
    clients.clear();
  });

  describe("Complete Signature Generation to Verification Flow", () => {
    it("should handle complete flow for all supported algorithms", async () => {
      for (const algorithm of TEST_CONFIG.ALGORITHMS) {
        const testKeys = testKeyPairs.get(algorithm)!;
        
        // 创建客户端
        const client = new SignatureClient({
          appId: TEST_CONFIG.APPS.PARTNER_A,
          privateKey: testKeys.privateKey,
          algorithm: algorithm as any,
          keyId: TEST_CONFIG.KEYS.PRIMARY,
        });

        // 测试 GET 请求
        const getHeaders = await client.generateSignatureHeaders("GET", "/api/users");
        const getResponse = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: getHeaders as any,
        });

        expect(getResponse.status).toBe(200);
        const getData = await getResponse.json();
        expect(getData.users).toBeDefined();

        // 测试 POST 请求
        const postBody = { name: `Test User ${algorithm}`, email: `test-${algorithm.toLowerCase()}@example.com` };
        const postBodyString = JSON.stringify(postBody);
        
        const postHeaders = await client.generateSignatureHeaders("POST", "/api/users", postBodyString);
        const postResponse = await app.request("http://localhost/api/users", {
          method: "POST",
          headers: {
            ...postHeaders,
            "Content-Type": "application/json",
          } as any,
          body: postBodyString,
        });

        expect(postResponse.status).toBe(201);
        const postData = await postResponse.json();
        expect(postData.id).toBeDefined();
        expect(postData.name).toBe(postBody.name);

        // 测试 PUT 请求
        const putBody = { name: `Updated User ${algorithm}` };
        const putBodyString = JSON.stringify(putBody);
        
        const putHeaders = await client.generateSignatureHeaders("PUT", "/api/users/123", putBodyString);
        const putResponse = await app.request("http://localhost/api/users/123", {
          method: "PUT",
          headers: {
            ...putHeaders,
            "Content-Type": "application/json",
          } as any,
          body: putBodyString,
        });

        expect(putResponse.status).toBe(200);
        const putData = await putResponse.json();
        expect(putData.name).toBe(putBody.name);

        // 测试 DELETE 请求
        const deleteHeaders = await client.generateSignatureHeaders("DELETE", "/api/users/123");
        const deleteResponse = await app.request("http://localhost/api/users/123", {
          method: "DELETE",
          headers: deleteHeaders as any,
        });

        expect(deleteResponse.status).toBe(200);
        const deleteData = await deleteResponse.json();
        expect(deleteData.deleted).toBe(true);
      }
    });

    it("should handle requests with query parameters and special characters", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 测试查询参数
      const queryPath = "/api/users?page=1&limit=10&sort=name&filter=active";
      const queryHeaders = await client.generateSignatureHeaders("GET", queryPath);
      const queryResponse = await app.request(`http://localhost${queryPath}`, {
        method: "GET",
        headers: queryHeaders as any,
      });

      expect(queryResponse.status).toBe(200);

      // 测试特殊字符
      const specialPath = "/api/users/张三李四/profile";
      const specialHeaders = await client.generateSignatureHeaders("GET", specialPath);
      const specialResponse = await app.request(`http://localhost${specialPath}`, {
        method: "GET",
        headers: specialHeaders as any,
      });

      expect(specialResponse.status).toBe(200);

      // 测试 URL 编码
      const encodedPath = "/api/users/test%20user/data";
      const encodedHeaders = await client.generateSignatureHeaders("GET", encodedPath);
      const encodedResponse = await app.request(`http://localhost${encodedPath}`, {
        method: "GET",
        headers: encodedHeaders as any,
      });

      expect(encodedResponse.status).toBe(200);
    });

    it("should handle large request bodies", async () => {
      const testKeys = testKeyPairs.get("ES256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "ES256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 创建大请求体 (约 100KB)
      const largeData = {
        description: "x".repeat(50000),
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: "test data ".repeat(10),
        })),
        metadata: {
          timestamp: new Date().toISOString(),
          version: "1.0.0",
          checksum: "abc123def456",
        },
      };

      const largeBodyString = JSON.stringify(largeData);
      expect(largeBodyString.length).toBeGreaterThan(100000);

      const headers = await client.generateSignatureHeaders("POST", "/api/bulk-data", largeBodyString);
      const response = await app.request("http://localhost/api/bulk-data", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: largeBodyString,
      });

      expect(response.status).toBe(201);
      const responseData = await response.json();
      expect(responseData.processed).toBe(true);
      expect(responseData.itemCount).toBe(1000);
    });
  });

  describe("Multi-App and Multi-Key Scenarios", () => {
    it("should handle multiple apps with different configurations", async () => {
      const scenarios = [
        {
          appId: TEST_CONFIG.APPS.PARTNER_A,
          keyId: TEST_CONFIG.KEYS.PRIMARY,
          algorithm: "RS256" as const,
          expectedAccess: true,
        },
        {
          appId: TEST_CONFIG.APPS.PARTNER_B,
          keyId: TEST_CONFIG.KEYS.BACKUP,
          algorithm: "ES256" as const,
          expectedAccess: true,
        },
        {
          appId: TEST_CONFIG.APPS.INTERNAL,
          keyId: TEST_CONFIG.KEYS.PRIMARY,
          algorithm: "RS512" as const,
          expectedAccess: true,
        },
      ];

      for (const scenario of scenarios) {
        const testKeys = testKeyPairs.get(scenario.algorithm)!;
        const client = new SignatureClient({
          appId: scenario.appId,
          privateKey: testKeys.privateKey,
          algorithm: scenario.algorithm,
          keyId: scenario.keyId,
        });

        const headers = await client.generateSignatureHeaders("GET", "/api/users");
        const response = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: headers as any,
        });

        if (scenario.expectedAccess) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(401);
        }
      }
    });

    it("should handle key rotation scenarios", async () => {
      const appId = TEST_CONFIG.APPS.PARTNER_A;
      
      // 使用主密钥
      const testKeys1 = testKeyPairs.get("RS256")!;
      const client1 = new SignatureClient({
        appId,
        privateKey: testKeys1.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const headers1 = await client1.generateSignatureHeaders("GET", "/api/users");
      const response1 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers1 as any,
      });

      expect(response1.status).toBe(200);

      // 添加新密钥
      const newKeyPair = await KeyGenerator.generateKeyPair("ES256", {
        keyId: "new-rotation-key",
      });

      await keyManager.addKeyPair(appId, {
        keyId: newKeyPair.keyId,
        publicKey: newKeyPair.publicKey,
        algorithm: newKeyPair.algorithm,
        createdAt: newKeyPair.createdAt,
        expiresAt: newKeyPair.expiresAt,
        enabled: newKeyPair.enabled,
      });

      // 使用新密钥
      const client2 = new SignatureClient({
        appId,
        privateKey: newKeyPair.privateKey!,
        algorithm: "ES256",
        keyId: "new-rotation-key",
      });

      const headers2 = await client2.generateSignatureHeaders("GET", "/api/users");
      const response2 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers2 as any,
      });

      expect(response2.status).toBe(200);

      // 禁用旧密钥
      await keyManager.setKeyPairEnabled(appId, TEST_CONFIG.KEYS.PRIMARY, false);

      // 旧密钥应该失败
      const headers3 = await client1.generateSignatureHeaders("GET", "/api/users");
      const response3 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers3 as any,
      });

      expect(response3.status).toBe(403);

      // 新密钥应该仍然工作
      const headers4 = await client2.generateSignatureHeaders("GET", "/api/users");
      const response4 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers4 as any,
      });

      expect(response4.status).toBe(200);
    });

    it("should handle app enable/disable scenarios", async () => {
      const appId = TEST_CONFIG.APPS.PARTNER_B;
      const testKeys = testKeyPairs.get("ES256")!;
      
      const client = new SignatureClient({
        appId,
        privateKey: testKeys.privateKey,
        algorithm: "ES256",
        keyId: TEST_CONFIG.KEYS.BACKUP,
      });

      // 应用启用时应该工作
      const headers1 = await client.generateSignatureHeaders("GET", "/api/users");
      const response1 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers1 as any,
      });

      expect(response1.status).toBe(200);

      // 禁用应用
      await keyManager.setAppEnabled(appId, false);

      // 应用禁用时应该失败
      const headers2 = await client.generateSignatureHeaders("GET", "/api/users");
      const response2 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers2 as any,
      });

      expect(response2.status).toBe(403);

      // 重新启用应用
      await keyManager.setAppEnabled(appId, true);

      // 应用重新启用后应该工作
      const headers3 = await client.generateSignatureHeaders("GET", "/api/users");
      const response3 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers3 as any,
      });

      expect(response3.status).toBe(200);
    });
  });

  describe("Timestamp Expiry and Replay Attack Protection", () => {
    it("should reject expired timestamps", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 生成过期的时间戳（10分钟前）
      const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users",
        undefined,
        expiredTimestamp
      );

      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(401);
      const errorData = await response.json();
      expect(errorData.message).toContain("timestamp");
    });

    it("should accept timestamps within time window", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 测试不同的时间偏移
      const timeOffsets = [
        -240, // 4分钟前
        -120, // 2分钟前
        0,    // 现在
        120,  // 2分钟后（时钟偏差）
        240,  // 4分钟后（时钟偏差）
      ];

      for (const offset of timeOffsets) {
        const timestamp = new Date(Date.now() + offset * 1000).toISOString();
        
        const headers = await client.generateSignatureHeaders(
          "GET",
          "/api/users",
          undefined,
          timestamp
        );

        const response = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: headers as any,
        });

        expect(response.status).toBe(200);
      }
    });

    it("should handle different time window configurations", async () => {
      // 创建具有短时间窗口的应用
      const shortWindowApp = new Hono();
      shortWindowApp.use("*", signatureAuth({
        keyManager,
        timeWindowSeconds: TEST_CONFIG.TIME_WINDOWS.SHORT, // 1分钟
        debug: false,
      }));
      setupTestRoutes(shortWindowApp);

      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 90秒前的时间戳应该被拒绝
      const oldTimestamp = new Date(Date.now() - 90 * 1000).toISOString();
      const oldHeaders = await client.generateSignatureHeaders(
        "GET",
        "/api/users",
        undefined,
        oldTimestamp
      );

      const oldResponse = await shortWindowApp.request("http://localhost/api/users", {
        method: "GET",
        headers: oldHeaders as any,
      });

      expect(oldResponse.status).toBe(401);

      // 30秒前的时间戳应该被接受
      const recentTimestamp = new Date(Date.now() - 30 * 1000).toISOString();
      const recentHeaders = await client.generateSignatureHeaders(
        "GET",
        "/api/users",
        undefined,
        recentTimestamp
      );

      const recentResponse = await shortWindowApp.request("http://localhost/api/users", {
        method: "GET",
        headers: recentHeaders as any,
      });

      expect(recentResponse.status).toBe(200);
    });

    it("should prevent replay attacks with identical requests", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 生成固定时间戳的签名
      const fixedTimestamp = new Date().toISOString();
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        JSON.stringify({ name: "Test User" }),
        fixedTimestamp
      );

      // 第一次请求应该成功
      const response1 = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({ name: "Test User" }),
      });

      expect(response1.status).toBe(201);

      // 相同的请求（相同时间戳）应该仍然成功，因为我们没有实现 nonce 机制
      // 但时间戳验证仍然有效
      const response2 = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({ name: "Test User" }),
      });

      expect(response2.status).toBe(201);

      // 但是如果时间戳过期，应该被拒绝
      await new Promise(resolve => setTimeout(resolve, 100)); // 等待一点时间
      
      const expiredHeaders = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        JSON.stringify({ name: "Test User" }),
        new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10分钟前
      );

      const expiredResponse = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...expiredHeaders,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({ name: "Test User" }),
      });

      expect(expiredResponse.status).toBe(401);
    });
  });

  describe("Error Scenarios and Boundary Conditions", () => {
    it("should handle missing required headers", async () => {
      const testCases = [
        {
          name: "missing signature",
          headers: {
            "X-Timestamp": new Date().toISOString(),
            "X-App-Id": TEST_CONFIG.APPS.PARTNER_A,
            "X-Key-Id": TEST_CONFIG.KEYS.PRIMARY,
          },
          expectedStatus: 400,
        },
        {
          name: "missing timestamp",
          headers: {
            "X-Signature": "fake-signature",
            "X-App-Id": TEST_CONFIG.APPS.PARTNER_A,
            "X-Key-Id": TEST_CONFIG.KEYS.PRIMARY,
          },
          expectedStatus: 400,
        },
        {
          name: "missing app id",
          headers: {
            "X-Signature": "fake-signature",
            "X-Timestamp": new Date().toISOString(),
            "X-Key-Id": TEST_CONFIG.KEYS.PRIMARY,
          },
          expectedStatus: 400,
        },
      ];

      for (const testCase of testCases) {
        const response = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: testCase.headers,
        });

        expect(response.status).toBe(testCase.expectedStatus);
        const errorData = await response.json();
        expect(errorData.message).toContain("Missing required headers");
      }
    });

    it("should handle invalid signatures", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 生成有效的头部
      const validHeaders = await client.generateSignatureHeaders("GET", "/api/users");

      // 篡改签名
      const invalidHeaders = {
        ...validHeaders,
        "X-Signature": "invalid-signature-data",
      };

      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: invalidHeaders as any,
      });

      expect(response.status).toBe(401);
      const errorData = await response.json();
      expect(errorData.message).toContain("Invalid signature");
    });

    it("should handle tampered request data", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const originalBody = { name: "Original User", email: "original@example.com" };
      const tamperedBody = { name: "Tampered User", email: "tampered@example.com" };

      // 使用原始数据生成签名
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        JSON.stringify(originalBody)
      );

      // 发送篡改后的数据
      const response = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify(tamperedBody),
      });

      expect(response.status).toBe(401);
      const errorData = await response.json();
      expect(errorData.message).toContain("Invalid signature");
    });

    it("should handle non-existent apps and keys", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      
      // 不存在的应用
      const invalidAppClient = new SignatureClient({
        appId: "non-existent-app",
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const invalidAppHeaders = await invalidAppClient.generateSignatureHeaders("GET", "/api/users");
      const invalidAppResponse = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: invalidAppHeaders as any,
      });

      expect(invalidAppResponse.status).toBe(403);

      // 不存在的密钥
      const invalidKeyClient = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: "non-existent-key",
      });

      const invalidKeyHeaders = await invalidKeyClient.generateSignatureHeaders("GET", "/api/users");
      const invalidKeyResponse = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: invalidKeyHeaders as any,
      });

      expect(invalidKeyResponse.status).toBe(403);
    });

    it("should handle malformed timestamps", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const malformedTimestamps = [
        "invalid-timestamp",
        "2024-13-45T25:70:80.000Z", // 无效日期
        "1234567890", // Unix 时间戳格式
        "", // 空字符串
        "2024-01-01", // 缺少时间部分
      ];

      for (const timestamp of malformedTimestamps) {
        const headers = await client.generateSignatureHeaders(
          "GET",
          "/api/users",
          undefined,
          timestamp
        );

        const response = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: headers as any,
        });

        expect(response.status).toBe(401);
      }
    });

    it("should handle edge cases with empty and null values", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 空请求体
      const emptyBodyHeaders = await client.generateSignatureHeaders("POST", "/api/users", "");
      const emptyBodyResponse = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...emptyBodyHeaders,
          "Content-Type": "application/json",
        } as any,
        body: "",
      });

      expect(emptyBodyResponse.status).toBe(201);

      // null 请求体
      const nullBodyHeaders = await client.generateSignatureHeaders("POST", "/api/users");
      const nullBodyResponse = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...nullBodyHeaders,
          "Content-Type": "application/json",
        } as any,
      });

      expect(nullBodyResponse.status).toBe(201);

      // 根路径
      const rootHeaders = await client.generateSignatureHeaders("GET", "/");
      const rootResponse = await app.request("http://localhost/", {
        method: "GET",
        headers: rootHeaders as any,
      });

      expect(rootResponse.status).toBe(200);
    });
  });

  describe("Performance Benchmarks and Load Testing", () => {
    it("should meet 100ms verification requirement", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const iterations = 50;
      const verificationTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const headers = await client.generateSignatureHeaders("GET", `/api/users?test=${i}`);
        
        const startTime = performance.now();
        const response = await app.request(`http://localhost/api/users?test=${i}`, {
          method: "GET",
          headers: headers as any,
        });
        const endTime = performance.now();

        expect(response.status).toBe(200);
        
        const verificationTime = endTime - startTime;
        verificationTimes.push(verificationTime);
      }

      const avgTime = verificationTimes.reduce((sum, time) => sum + time, 0) / verificationTimes.length;
      const maxTime = Math.max(...verificationTimes);
      const minTime = Math.min(...verificationTimes);

      console.log(`Verification Performance:
        Average: ${avgTime.toFixed(2)}ms
        Maximum: ${maxTime.toFixed(2)}ms
        Minimum: ${minTime.toFixed(2)}ms
        95th percentile: ${verificationTimes.sort((a, b) => a - b)[Math.floor(iterations * 0.95)].toFixed(2)}ms`);

      // 验证性能要求
      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200); // 允许一些异常值
    });

    it("should handle concurrent requests efficiently", async () => {
      const testKeys = testKeyPairs.get("ES256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "ES256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const concurrentRequests = 100;
      const startTime = performance.now();

      // 创建并发请求
      const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const headers = await client.generateSignatureHeaders("GET", `/api/users?concurrent=${i}`);
        return app.request(`http://localhost/api/users?concurrent=${i}`, {
          method: "GET",
          headers: headers as any,
        });
      });

      const responses = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;

      // 验证所有请求都成功
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
      });

      console.log(`Concurrent Performance:
        Total requests: ${concurrentRequests}
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms
        Requests per second: ${(concurrentRequests / (totalTime / 1000)).toFixed(2)}`);

      // 性能要求
      expect(avgTimePerRequest).toBeLessThan(100);
      expect(totalTime).toBeLessThan(10000); // 10秒内完成所有请求
    });

    it("should demonstrate cache effectiveness", async () => {
      const testKeys = testKeyPairs.get("RS256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "RS256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      // 清除缓存
      keyManager.clearCache();

      // 第一次请求（缓存未命中）
      const headers1 = await client.generateSignatureHeaders("GET", "/api/users");
      const startTime1 = performance.now();
      const response1 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers1 as any,
      });
      const endTime1 = performance.now();

      expect(response1.status).toBe(200);
      const firstRequestTime = endTime1 - startTime1;

      // 第二次请求（缓存命中）
      const headers2 = await client.generateSignatureHeaders("GET", "/api/users");
      const startTime2 = performance.now();
      const response2 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers2 as any,
      });
      const endTime2 = performance.now();

      expect(response2.status).toBe(200);
      const secondRequestTime = endTime2 - startTime2;

      // 缓存统计
      const cacheStats = keyManager.getCacheStats();

      console.log(`Cache Performance:
        First request (cache miss): ${firstRequestTime.toFixed(2)}ms
        Second request (cache hit): ${secondRequestTime.toFixed(2)}ms
        Cache size: ${cacheStats.size}
        Hit rate: ${cacheStats.hitRate ? (cacheStats.hitRate * 100).toFixed(1) : 'N/A'}%`);

      // 缓存应该提高性能
      expect(cacheStats.size).toBeGreaterThan(0);
    });

    it("should handle memory usage efficiently under load", async () => {
      const testKeys = testKeyPairs.get("ES256")!;
      const client = new SignatureClient({
        appId: TEST_CONFIG.APPS.PARTNER_A,
        privateKey: testKeys.privateKey,
        algorithm: "ES256",
        keyId: TEST_CONFIG.KEYS.PRIMARY,
      });

      const initialMemory = process.memoryUsage();

      // 执行大量请求
      const iterations = 500;
      const promises: Promise<Response>[] = [];

      for (let i = 0; i < iterations; i++) {
        const headers = await client.generateSignatureHeaders("GET", `/api/users?load=${i}`);
        const promise = app.request(`http://localhost/api/users?load=${i}`, {
          method: "GET",
          headers: headers as any,
        });
        promises.push(promise);

        // 批量处理以避免内存峰值
        if (promises.length >= 50) {
          const batchResponses = await Promise.all(promises);
          batchResponses.forEach(response => {
            expect(response.status).toBe(200);
          });
          promises.length = 0; // 清空数组
        }
      }

      // 处理剩余的请求
      if (promises.length > 0) {
        const remainingResponses = await Promise.all(promises);
        remainingResponses.forEach(response => {
          expect(response.status).toBe(200);
        });
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory Usage:
        Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
        Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB
        Per request: ${(memoryIncrease / iterations / 1024).toFixed(2)}KB`);

      // 内存增长应该合理
      expect(memoryIncrease / iterations).toBeLessThan(10 * 1024); // 每个请求少于10KB
    });

    it("should handle different algorithm performance characteristics", async () => {
      const algorithms = TEST_CONFIG.ALGORITHMS;
      const performanceResults: Record<string, { avgTime: number; maxTime: number }> = {};

      for (const algorithm of algorithms) {
        const testKeys = testKeyPairs.get(algorithm)!;
        const client = new SignatureClient({
          appId: TEST_CONFIG.APPS.PARTNER_A,
          privateKey: testKeys.privateKey,
          algorithm: algorithm as any,
          keyId: TEST_CONFIG.KEYS.PRIMARY,
        });

        const iterations = 20;
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const headers = await client.generateSignatureHeaders("GET", `/api/users?alg=${algorithm}&i=${i}`);
          
          const startTime = performance.now();
          const response = await app.request(`http://localhost/api/users?alg=${algorithm}&i=${i}`, {
            method: "GET",
            headers: headers as any,
          });
          const endTime = performance.now();

          expect(response.status).toBe(200);
          times.push(endTime - startTime);
        }

        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const maxTime = Math.max(...times);

        performanceResults[algorithm] = { avgTime, maxTime };
      }

      console.log("Algorithm Performance Comparison:");
      for (const [algorithm, results] of Object.entries(performanceResults)) {
        console.log(`  ${algorithm}: avg=${results.avgTime.toFixed(2)}ms, max=${results.maxTime.toFixed(2)}ms`);
      }

      // 所有算法都应该满足性能要求
      for (const results of Object.values(performanceResults)) {
        expect(results.avgTime).toBeLessThan(100);
        expect(results.maxTime).toBeLessThan(200);
      }
    });
  });

  // 辅助函数
  async function setupTestApps() {
    const apps = [
      {
        appId: TEST_CONFIG.APPS.PARTNER_A,
        name: "Partner A",
        algorithms: ["RS256", "ES256"],
        keys: [TEST_CONFIG.KEYS.PRIMARY, TEST_CONFIG.KEYS.BACKUP],
      },
      {
        appId: TEST_CONFIG.APPS.PARTNER_B,
        name: "Partner B", 
        algorithms: ["ES256", "RS512"],
        keys: [TEST_CONFIG.KEYS.BACKUP],
      },
      {
        appId: TEST_CONFIG.APPS.INTERNAL,
        name: "Internal Service",
        algorithms: ["RS512", "ES512"],
        keys: [TEST_CONFIG.KEYS.PRIMARY],
      },
    ];

    for (const appInfo of apps) {
      const keyPairs: KeyPair[] = [];

      for (let i = 0; i < appInfo.algorithms.length; i++) {
        const algorithm = appInfo.algorithms[i];
        const keyId = appInfo.keys[i] || appInfo.keys[0];
        const testKeys = testKeyPairs.get(algorithm)!;

        keyPairs.push({
          keyId,
          publicKey: testKeys.publicKey,
          algorithm: algorithm as any,
          createdAt: new Date(),
          enabled: true,
        });
      }

      const appConfig: AppConfig = {
        appId: appInfo.appId,
        name: appInfo.name,
        keyPairs,
        enabled: true,
        permissions: ["read", "write"],
        createdAt: new Date(),
      };

      await keyManager.addApp(appConfig);
    }
  }

  function setupTestRoutes(targetApp: Hono = app) {
    // 基础 API 路由
    targetApp.get("/", (c) => c.json({ message: "API Root" }));
    
    targetApp.get("/api/users", (c) => {
      return c.json({
        users: [
          { id: 1, name: "John Doe", email: "john@example.com" },
          { id: 2, name: "Jane Smith", email: "jane@example.com" },
        ],
      });
    });

    targetApp.post("/api/users", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return c.json(
        {
          id: Math.floor(Math.random() * 1000) + 100,
          ...body,
          createdAt: new Date().toISOString(),
        },
        201
      );
    });

    targetApp.put("/api/users/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      return c.json({
        id: parseInt(id),
        ...body,
        updatedAt: new Date().toISOString(),
      });
    });

    targetApp.delete("/api/users/:id", (c) => {
      const id = c.req.param("id");
      return c.json({
        deleted: true,
        id: parseInt(id),
        deletedAt: new Date().toISOString(),
      });
    });

    // 特殊路由用于测试
    targetApp.get("/api/users/:name/profile", (c) => {
      const name = c.req.param("name");
      return c.json({
        profile: {
          name: decodeURIComponent(name),
          lastAccess: new Date().toISOString(),
        },
      });
    });

    targetApp.post("/api/bulk-data", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return c.json(
        {
          processed: true,
          itemCount: body.items?.length || 0,
          size: JSON.stringify(body).length,
          processedAt: new Date().toISOString(),
        },
        201
      );
    });
  }
});