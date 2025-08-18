/**
 * 客户端-服务端集成测试
 * Client-Server integration tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SignatureClient } from "../../../app/api/auth/client/signature-client.js";
import { signatureAuth } from "../../../app/api/middleware/signature-auth.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import type { KeyManager } from "../../../app/api/auth/types.js";

// 测试密钥对
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfnGs+a8QQu+tHkHfzOKMQ2K4+u2NjM1SXmpjNMOLdCJ8P2bLDMaLdcmn6MMD
nTxai+b1AL9Y8yDxC5GtwV4VEKWVz+d1gddSKEgHnez6EAHjIWAnjqtVnYKB0QHu
P06+3brkmdrx6J7kd4sNVTLs+YRu5Wwzg0aTLwmXmLKtgMxS2qkXz1xZxnowkwuX
nNOYxiTw6kzMGHvqHgyxJxCBPnuTOprdGMdRHjF/oQhLDMKtYTuNskdXMmMWjseB
IV+tB2M3M8+UpgEBRBOFmfiOMXXmnAjPaP0ZtZB3N+k6+mINnNxnDqYyMXI5VRcQ
kyGVoKIFAgMBAAECggEBALc2lQAkx+hkHiitlsB+D8Q9aBiCiHRGmdHDMBOTKkI+
dm7IeJXZoAUqurEuVf2/b4o+Di0hkuaQiAuLdMKRAoGBAOm/SN+KEGCWzjVBfzfv
hc5LoP7onVwrMZBP7gjksB+naQKBgQDM4eT3f3EQEcHdxcqCAWBpnGjMAJO/+SDA
quSYtQp5O8k8s0UfS5yTJ8I5o9l0GhTKIrAPpjl5OQdlbvQhp+geZpMlMlgJ8d+v
FwJBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8iJVtb3StI7VAi
VBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgYA5OtXTTAVrjI
6k1XuQAoGBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8iJVtb3S
tI7VAiVBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgYA5OtXT
TAVrjI6k1XuQAoGBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8i
JVtb3StI7VAiVBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgY
A5OtXTTAVrjI6k1XuQ==
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcBIjn5x
rPmvEELvrR5B38zijENiuPrtjYzNUl5qYzTDi3QifD9mywzGi3XJp+jDA508Wov
m9QC/WPMg8QuRrcFeFRCllc/ndYHXUihIB53s+hAB4yFgJ46rVZ2CgdEB7j9Ovt
265JHa8eie5HeLDVUy7PmEbuVsM4NGky8Jl5iyrYDMUtqpF89cWcZ6MJMLl5zTm
MYk8OpMzBh76h4MsScQgT57kzqa3RjHUR4xf6EISwzCrWE7jbJHVzJjFo7HgSFf
rQdjNzPPlKYBAUQThZn4jjF15pwIz2j9GbWQdzfpOvpiDZzcZw6mMjFyOVUXEJM
hlaChBQIDAQAB
-----END PUBLIC KEY-----`;

const TEST_APP_ID = "test-app-123";
const TEST_KEY_ID = "test-key-001";

describe("Client-Server Integration", () => {
  let app: Hono;
  let client: SignatureClient;
  let keyManager: KeyManager;

  beforeEach(async () => {
    // 创建测试应用
    app = new Hono();

    // 创建密钥管理器
    keyManager = createKeyManager({
      storageType: "memory",
      cacheExpiry: 300,
      enableCache: true,
      debug: false,
    });

    await keyManager.addApp({
      appId: TEST_APP_ID,
      name: "Test App",
      keyPairs: [
        {
          keyId: TEST_KEY_ID,
          publicKey: TEST_PUBLIC_KEY,
          algorithm: "RS256",
          createdAt: new Date(),
          enabled: true,
        },
      ],
      enabled: true,
      permissions: ["*"],
      createdAt: new Date(),
    });

    // 添加签名认证中间件
    app.use("*", signatureAuth({
      keyManager,
      timeWindowSeconds: 300,
      debug: false,
    }));

    // 添加测试路由
    app.get("/api/users", (c) => {
      return c.json({ users: [{ id: 1, name: "John" }] });
    });

    app.post("/api/users", async (c) => {
      const body = await c.req.json();
      return c.json({ id: 2, ...body });
    });

    app.put("/api/users/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json();
      return c.json({ id: parseInt(id), ...body });
    });

    app.delete("/api/users/:id", (c) => {
      const id = c.req.param("id");
      return c.json({ deleted: parseInt(id) });
    });

    // 创建客户端
    client = new SignatureClient({
      appId: TEST_APP_ID,
      privateKey: TEST_PRIVATE_KEY,
      algorithm: "RS256",
      keyId: TEST_KEY_ID,
    });
  });

  describe("Successful authentication", () => {
    it("should authenticate GET request successfully", async () => {
      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ users: [{ id: 1, name: "John" }] });
    });

    it("should authenticate POST request successfully", async () => {
      const body = { name: "Jane", email: "jane@example.com" };
      const bodyString = JSON.stringify(body);

      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        bodyString
      );

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ id: 2, name: "Jane", email: "jane@example.com" });
    });

    it("should authenticate PUT request successfully", async () => {
      const body = { name: "Updated Name" };
      const bodyString = JSON.stringify(body);

      const headers = await client.generateSignatureHeaders(
        "PUT",
        "/api/users/123",
        bodyString
      );

      const request = new Request("http://localhost/api/users/123", {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ id: 123, name: "Updated Name" });
    });

    it("should authenticate DELETE request successfully", async () => {
      const headers = await client.generateSignatureHeaders(
        "DELETE",
        "/api/users/123"
      );

      const request = new Request("http://localhost/api/users/123", {
        method: "DELETE",
        headers: headers as any,
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ deleted: 123 });
    });
  });

  describe("Authentication failures", () => {
    it("should reject request with missing signature", async () => {
      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: {
          "X-Timestamp": new Date().toISOString(),
          "X-App-Id": TEST_APP_ID,
        },
      });

      const response = await app.request(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("SIGNATURE_MISSING");
    });

    it("should reject request with invalid signature", async () => {
      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: {
          ...headers,
          "X-Signature": "invalid-signature",
        } as any,
      });

      const response = await app.request(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("SIGNATURE_INVALID");
    });

    it("should reject request with invalid app ID", async () => {
      const invalidClient = new SignatureClient({
        appId: "invalid-app-id",
        privateKey: TEST_PRIVATE_KEY,
        algorithm: "RS256",
      });

      const headers = await invalidClient.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("APP_INVALID");
    });

    it("should reject request with expired timestamp", async () => {
      // 生成过期的时间戳（10分钟前）
      const expiredTimestamp = new Date(
        Date.now() - 10 * 60 * 1000
      ).toISOString();

      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users",
        undefined,
        expiredTimestamp
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("TIMESTAMP_EXPIRED");
    });

    it("should reject request with tampered body", async () => {
      const originalBody = { name: "John" };
      const tamperedBody = { name: "Jane" };

      // 使用原始数据生成签名
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        JSON.stringify(originalBody)
      );

      // 但发送篡改后的数据
      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify(tamperedBody),
      });

      const response = await app.request(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("SIGNATURE_INVALID");
    });
  });

  describe("Edge cases", () => {
    it("should handle requests with query parameters", async () => {
      const path = "/api/users?page=1&limit=10";
      const headers = await client.generateSignatureHeaders("GET", path);

      const request = new Request(`http://localhost${path}`, {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);
      expect(response.status).toBe(200);
    });

    it("should handle requests with special characters in path", async () => {
      const path = "/api/users/张三";
      const headers = await client.generateSignatureHeaders("GET", path);

      // 添加对应的路由
      app.get("/api/users/:name", (c) => {
        const name = c.req.param("name");
        return c.json({ user: { name } });
      });

      const request = new Request(`http://localhost${path}`, {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);
      expect(response.status).toBe(200);
    });

    it("should handle large request bodies", async () => {
      const largeBody = {
        data: "x".repeat(10000),
        array: new Array(100).fill("test data"),
      };

      const bodyString = JSON.stringify(largeBody);
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        bodyString
      );

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      const response = await app.request(request);
      expect(response.status).toBe(200);
    });

    it("should handle empty request body", async () => {
      const headers = await client.generateSignatureHeaders(
        "POST",
        "/api/users",
        ""
      );

      const request = new Request("http://localhost/api/users", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: "",
      });

      const response = await app.request(request);
      expect(response.status).toBe(200);
    });
  });

  describe("Multiple key support", () => {
    beforeEach(async () => {
      // 添加另一个密钥对
      const app2Config = await keyManager.getAppConfig(TEST_APP_ID);
      if (app2Config) {
        app2Config.keyPairs.push({
          keyId: "test-key-002",
          publicKey: TEST_PUBLIC_KEY, // 使用相同的公钥用于测试
          algorithm: "RS256",
          createdAt: new Date(),
          enabled: true,
        });
        await keyManager.updateApp(TEST_APP_ID, app2Config);
      }
    });

    it("should authenticate with different key IDs", async () => {
      // 使用第二个密钥 ID
      const client2 = new SignatureClient({
        appId: TEST_APP_ID,
        privateKey: TEST_PRIVATE_KEY,
        algorithm: "RS256",
        keyId: "test-key-002",
      });

      const headers = await client2.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);
      expect(response.status).toBe(200);
    });

    it("should reject request with non-existent key ID", async () => {
      const clientWithInvalidKey = new SignatureClient({
        appId: TEST_APP_ID,
        privateKey: TEST_PRIVATE_KEY,
        algorithm: "RS256",
        keyId: "non-existent-key",
      });

      const headers = await clientWithInvalidKey.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error.code).toBe("KEY_NOT_FOUND");
    });
  });

  describe("Performance", () => {
    it("should handle concurrent requests efficiently", async () => {
      const concurrentRequests = 10;
      const promises: Promise<Response>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const headers = await client.generateSignatureHeaders(
          "GET",
          `/api/users?id=${i}`
        );

        const promise = app.request(`http://localhost/api/users?id=${i}`, {
          method: "GET",
          headers: headers as any,
        });

        promises.push(promise);
      }

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it("should complete signature verification within time limit", async () => {
      const startTime = Date.now();

      const headers = await client.generateSignatureHeaders(
        "GET",
        "/api/users"
      );

      const request = new Request("http://localhost/api/users", {
        method: "GET",
        headers: headers as any,
      });

      const response = await app.request(request);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100); // 应该在100ms内完成
    });
  });
});
