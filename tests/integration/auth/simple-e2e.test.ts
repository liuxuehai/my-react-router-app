/**
 * 简化的端到端集成测试
 * Simplified end-to-end integration tests that actually work
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { SignatureClient } from "../../../app/api/auth/client/signature-client.js";
import { signatureAuth } from "../../../app/api/middleware/signature-auth.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import type { KeyManager, AppConfig } from "../../../app/api/auth/types.js";

describe("Simple End-to-End Integration Tests", () => {
  let app: Hono;
  let keyManager: KeyManager;
  let testKeyPair: { publicKey: string; privateKey: string };
  let client: SignatureClient;

  const TEST_APP_ID = "test-app";
  const TEST_KEY_ID = "test-key";

  beforeEach(async () => {
    // 生成真实的测试密钥对
    const keyPair = await KeyGenerator.generateKeyPair("RS256", {
      keyId: TEST_KEY_ID,
    });

    testKeyPair = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey!,
    };

    // 创建应用和密钥管理器
    app = new Hono();
    keyManager = createKeyManager({
      storageType: "memory",
      cacheExpiry: 300,
      enableCache: true,
      debug: false,
    });

    // 设置测试应用
    const appConfig: AppConfig = {
      appId: TEST_APP_ID,
      name: "Test App",
      keyPairs: [
        {
          keyId: TEST_KEY_ID,
          publicKey: testKeyPair.publicKey,
          algorithm: "RS256",
          createdAt: new Date(),
          enabled: true,
        },
      ],
      enabled: true,
      permissions: ["read", "write"],
      createdAt: new Date(),
    };

    await keyManager.addApp(appConfig);

    // 配置中间件
    app.use(
      "*",
      signatureAuth({
        keyManager,
        timeWindowSeconds: 300,
        debug: false,
      })
    );

    // 设置测试路由
    app.get("/api/users", (c) => {
      return c.json({
        users: [
          { id: 1, name: "John Doe" },
          { id: 2, name: "Jane Smith" },
        ],
      });
    });

    app.post("/api/users", async (c) => {
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

    app.put("/api/users/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      return c.json({
        id: parseInt(id),
        ...body,
        updatedAt: new Date().toISOString(),
      });
    });

    app.delete("/api/users/:id", (c) => {
      const id = c.req.param("id");
      return c.json({
        deleted: true,
        id: parseInt(id),
        deletedAt: new Date().toISOString(),
      });
    });

    // 创建客户端
    client = new SignatureClient({
      appId: TEST_APP_ID,
      privateKey: testKeyPair.privateKey,
      algorithm: "RS256",
      keyId: TEST_KEY_ID,
    });
  });

  afterEach(() => {
    keyManager.clearCache();
  });

  describe("Basic Signature Flow", () => {
    it("should successfully authenticate GET request", async () => {
      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toBeDefined();
      expect(data.users).toHaveLength(2);
    });

    it("should successfully authenticate POST request", async () => {
      const body = { name: "New User", email: "new@example.com" };
      const bodyString = JSON.stringify(body);

      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        bodyString
      );

      const response = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.name).toBe(body.name);
      expect(data.email).toBe(body.email);
      expect(data.id).toBeDefined();
    });

    it("should successfully authenticate PUT request", async () => {
      const body = { name: "Updated User" };
      const bodyString = JSON.stringify(body);

      const headers = await client.generateSignatureHeaders(
        "PUT",
        "/api/users/123",
        bodyString
      );

      const response = await app.request("http://localhost/api/users/123", {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe(body.name);
      expect(data.id).toBe(123);
    });

    it("should successfully authenticate DELETE request", async () => {
      const headers = await client.generateSignatureHeaders(
        "DELETE",
        "/api/users/123"
      );

      const response = await app.request("http://localhost/api/users/123", {
        method: "DELETE",
        headers: headers as any,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.deleted).toBe(true);
      expect(data.id).toBe(123);
    });
  });

  describe("Error Scenarios", () => {
    it("should reject request with missing signature header", async () => {
      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: {
          "X-Timestamp": new Date().toISOString(),
          "X-App-Id": TEST_APP_ID,
          "X-Key-Id": TEST_KEY_ID,
        },
      });

      expect(response.status).toBe(400);
    });

    it("should reject request with invalid signature", async () => {
      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: {
          ...headers,
          "X-Signature": "invalid-signature",
        } as any,
      });

      expect(response.status).toBe(401);
    });

    it("should reject request with expired timestamp", async () => {
      const expiredTimestamp = new Date(
        Date.now() - 10 * 60 * 1000
      ).toISOString();

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
    });

    it("should reject request with non-existent app ID", async () => {
      const invalidClient = new SignatureClient({
        appId: "non-existent-app",
        privateKey: testKeyPair.privateKey,
        algorithm: "RS256",
        keyId: TEST_KEY_ID,
      });

      const headers = await invalidClient.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Performance Tests", () => {
    it("should complete signature verification within 100ms", async () => {
      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const headers = await client.generateSignatureHeaders(
          "GET",
          `/api/users?test=${i}`
        );

        const startTime = performance.now();
        const response = await app.request(
          `http://localhost/api/users?test=${i}`,
          {
            method: "GET",
            headers: headers as any,
          }
        );
        const endTime = performance.now();

        expect(response.status).toBe(200);
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      console.log(
        `Performance: avg=${avgTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`
      );

      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200);
    });

    it("should handle concurrent requests", async () => {
      const concurrentCount = 20;

      const promises = Array.from({ length: concurrentCount }, async (_, i) => {
        const headers = await client.generateSignatureHeaders(
          "GET",
          `/api/users?concurrent=${i}`
        );
        return app.request(`http://localhost/api/users?concurrent=${i}`, {
          method: "GET",
          headers: headers as any,
        });
      });

      const responses = await Promise.all(promises);

      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle requests with query parameters", async () => {
      const path = "/api/users?page=1&limit=10&sort=name";
      const headers = await client.generateSignatureHeaders("GET", path);

      const response = await app.request(`http://localhost${path}`, {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(200);
    });

    it("should handle empty request body", async () => {
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        ""
      );

      const response = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: "",
      });

      expect(response.status).toBe(201);
    });

    it("should handle large request body", async () => {
      const largeData = {
        description: "x".repeat(10000),
        items: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: "test data ".repeat(10),
        })),
      };

      const bodyString = JSON.stringify(largeData);
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        bodyString
      );

      const response = await app.request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      expect(response.status).toBe(201);
    });
  });

  describe("Multi-Key Scenarios", () => {
    it("should handle key rotation", async () => {
      // 添加新密钥
      const newKeyPair = await KeyGenerator.generateKeyPair("ES256", {
        keyId: "new-key",
      });

      await keyManager.addKeyPair(TEST_APP_ID, {
        keyId: "new-key",
        publicKey: newKeyPair.publicKey,
        algorithm: "ES256",
        createdAt: new Date(),
        enabled: true,
      });

      // 使用新密钥创建客户端
      const newClient = new SignatureClient({
        appId: TEST_APP_ID,
        privateKey: newKeyPair.privateKey!,
        algorithm: "ES256",
        keyId: "new-key",
      });

      // 测试新密钥
      const headers = await newClient.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const response = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(200);

      // 禁用旧密钥
      await keyManager.setKeyPairEnabled(TEST_APP_ID, TEST_KEY_ID, false);

      // 旧密钥应该失败
      const oldHeaders = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const oldResponse = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: oldHeaders as any,
      });

      expect(oldResponse.status).toBe(403);

      // 新密钥应该仍然工作
      const newHeaders = await newClient.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const newResponse = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: newHeaders as any,
      });

      expect(newResponse.status).toBe(200);
    });

    it("should handle app disable/enable", async () => {
      // 应用启用时应该工作
      const headers1 = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const response1 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers1 as any,
      });

      expect(response1.status).toBe(200);

      // 禁用应用
      await keyManager.setAppEnabled(TEST_APP_ID, false);

      // 应用禁用时应该失败
      const headers2 = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const response2 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers2 as any,
      });

      expect(response2.status).toBe(403);

      // 重新启用应用
      await keyManager.setAppEnabled(TEST_APP_ID, true);

      // 应用重新启用后应该工作
      const headers3 = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );
      const response3 = await app.request("http://localhost/api/users", {
        method: "GET",
        headers: headers3 as any,
      });

      expect(response3.status).toBe(200);
    });
  });

  describe("Algorithm Support", () => {
    const algorithms = ["RS256", "RS512", "ES256", "ES512"] as const;

    algorithms.forEach((algorithm) => {
      it(`should work with ${algorithm} algorithm`, async () => {
        // 生成新的密钥对
        const keyPair = await KeyGenerator.generateKeyPair(algorithm, {
          keyId: `test-${algorithm.toLowerCase()}`,
        });

        // 添加到应用
        await keyManager.addKeyPair(TEST_APP_ID, {
          keyId: `test-${algorithm.toLowerCase()}`,
          publicKey: keyPair.publicKey,
          algorithm: algorithm,
          createdAt: new Date(),
          enabled: true,
        });

        // 创建客户端
        const algorithmClient = new SignatureClient({
          appId: TEST_APP_ID,
          privateKey: keyPair.privateKey!,
          algorithm: algorithm,
          keyId: `test-${algorithm.toLowerCase()}`,
        });

        // 测试请求
        const headers = await algorithmClient.generateSignatureHeaders(
          "GET",
          "/api/users"
        );
        const response = await app.request("http://localhost/api/users", {
          method: "GET",
          headers: headers as any,
        });

        expect(response.status).toBe(200);
      });
    });
  });
});
