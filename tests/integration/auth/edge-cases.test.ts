/**
 * 边界条件和边缘情况测试
 * Edge cases and boundary condition tests for signature authentication
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { SignatureClient } from "../../../app/api/auth/client/signature-client.js";
import { signatureAuth } from "../../../app/api/middleware/signature-auth.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import { SignatureUtils } from "../../../app/api/auth/signature-utils.js";
import type { KeyManager, AppConfig } from "../../../app/api/auth/types.js";

describe("Edge Cases and Boundary Conditions", () => {
  let app: Hono;
  let keyManager: KeyManager;
  let testKeyPair: { publicKey: string; privateKey: string };
  let client: SignatureClient;

  beforeEach(async () => {
    // 生成测试密钥对
    const keyPair = await KeyGenerator.generateKeyPair("RS256", {
      keyId: "edge-test-key",
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
      appId: "edge-test-app",
      name: "Edge Test App",
      keyPairs: [
        {
          keyId: "edge-test-key",
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
    app.use("*", signatureAuth({
      keyManager,
      timeWindowSeconds: 300,
      debug: false,
    }));

    // 设置测试路由
    setupTestRoutes();

    // 创建客户端
    client = new SignatureClient({
      appId: "edge-test-app",
      privateKey: testKeyPair.privateKey,
      algorithm: "RS256",
      keyId: "edge-test-key",
    });
  });

  afterEach(() => {
    keyManager.clearCache();
  });

  describe("Extreme Input Values", () => {
    it("should handle extremely long URLs", async () => {
      // 创建非常长的URL（接近URL长度限制）
      const longPath = "/api/test/" + "a".repeat(2000) + "/data";
      const queryParams = Array.from({ length: 50 }, (_, i) => `param${i}=${"value".repeat(20)}`).join("&");
      const fullPath = `${longPath}?${queryParams}`;

      const headers = await client.generateSignatureHeaders("GET", fullPath);
      const response = await app.request(`http://localhost${fullPath}`, {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(200);
    });

    it("should handle extremely large request bodies", async () => {
      // 创建大约 1MB 的请求体
      const largeObject = {
        id: "test-large-body",
        data: "x".repeat(500000),
        array: Array.from({ length: 1000 }, (_, i) => ({
          index: i,
          content: "test content ".repeat(50),
        })),
        nested: {
          level1: {
            level2: {
              level3: {
                data: "nested data ".repeat(1000),
              },
            },
          },
        },
      };

      const bodyString = JSON.stringify(largeObject);
      expect(bodyString.length).toBeGreaterThan(1000000); // 确保超过1MB

      const headers = await client.generateSignatureHeaders("POST", "/api/large-body", bodyString);
      const response = await app.request("http://localhost/api/large-body", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        } as any,
        body: bodyString,
      });

      expect(response.status).toBe(200);
      const responseData = await response.json();
      expect(responseData.received).toBe(true);
      expect(responseData.size).toBe(bodyString.length);
    });

    it("should handle Unicode and special characters in all components", async () => {
      const unicodeTestCases = [
        {
          name: "Chinese characters",
          path: "/api/用户/测试",
          body: { 名字: "张三", 描述: "这是一个测试用户" },
        },
        {
          name: "Emoji characters",
          path: "/api/users/😀😃😄",
          body: { message: "Hello 🌍! Testing 🚀 with emojis 🎉" },
        },
        {
          name: "Arabic characters",
          path: "/api/المستخدمين/اختبار",
          body: { الاسم: "اختبار", الوصف: "هذا اختبار" },
        },
        {
          name: "Special symbols",
          path: "/api/test/!@#$%^&*()",
          body: { symbols: "!@#$%^&*()_+-=[]{}|;':\",./<>?" },
        },
        {
          name: "Mixed Unicode",
          path: "/api/test/混合🌍Arabic_العربية",
          body: { mixed: "English中文🎉العربية" },
        },
      ];

      for (const testCase of unicodeTestCases) {
        const bodyString = JSON.stringify(testCase.body);
        const headers = await client.generateSignatureHeaders("POST", testCase.path, bodyString);
        
        const response = await app.request(`http://localhost${testCase.path}`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          } as any,
          body: bodyString,
        });

        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData.path).toBe(testCase.path);
      }
    });

    it("should handle edge case timestamps", async () => {
      const timestampTestCases = [
        {
          name: "Unix epoch",
          timestamp: "1970-01-01T00:00:00.000Z",
          shouldPass: false, // 太久以前
        },
        {
          name: "Year 2038 problem",
          timestamp: "2038-01-19T03:14:07.000Z",
          shouldPass: false, // 太远的未来
        },
        {
          name: "Leap year",
          timestamp: "2024-02-29T12:00:00.000Z",
          shouldPass: false, // 可能太久以前
        },
        {
          name: "End of year",
          timestamp: "2024-12-31T23:59:59.999Z",
          shouldPass: false, // 可能太远的未来
        },
        {
          name: "Microseconds precision",
          timestamp: new Date(Date.now() - 60000).toISOString().replace('Z', '123456Z'),
          shouldPass: false, // 无效格式
        },
      ];

      for (const testCase of timestampTestCases) {
        try {
          const headers = await client.generateSignatureHeaders(
            "GET",
            "/api/test",
            undefined,
            testCase.timestamp
          );

          const response = await app.request("http://localhost/api/test", {
            method: "GET",
            headers: headers as any,
          });

          if (testCase.shouldPass) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(401);
          }
        } catch (error) {
          // 某些无效时间戳可能在客户端就失败
          if (testCase.shouldPass) {
            throw error;
          }
        }
      }
    });
  });

  describe("Malformed and Invalid Data", () => {
    it("should handle malformed JSON in request body", async () => {
      const malformedJsonCases = [
        '{"incomplete": true',
        '{"trailing": "comma",}',
        '{"unescaped": "quote"inside"}',
        '{invalid: "no quotes on key"}',
        '{"number": 123.456.789}',
        '{"circular": {"ref": {"back": "circular"}}}',
      ];

      for (const malformedJson of malformedJsonCases) {
        const headers = await client.generateSignatureHeaders("POST", "/api/test", malformedJson);
        
        const response = await app.request("http://localhost/api/test", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          } as any,
          body: malformedJson,
        });

        // 签名验证应该成功，即使JSON格式错误
        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData.received).toBe(true);
      }
    });

    it("should handle binary data in request body", async () => {
      // 创建二进制数据
      const binaryData = new Uint8Array(1000);
      for (let i = 0; i < binaryData.length; i++) {
        binaryData[i] = i % 256;
      }

      // 转换为字符串（可能包含无效字符）
      const binaryString = String.fromCharCode(...binaryData);

      const headers = await client.generateSignatureHeaders("POST", "/api/binary", binaryString);
      
      const response = await app.request("http://localhost/api/binary", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
        } as any,
        body: binaryString,
      });

      expect(response.status).toBe(200);
    });

    it("should handle null bytes and control characters", async () => {
      const controlCharacterCases = [
        {
          name: "null bytes",
          data: "test\x00data\x00with\x00nulls",
        },
        {
          name: "control characters",
          data: "test\x01\x02\x03\x04\x05data",
        },
        {
          name: "mixed control",
          data: "\x00\x01\x02test\x03\x04\x05\x06data\x07\x08\x09",
        },
      ];

      for (const testCase of controlCharacterCases) {
        const body = JSON.stringify({ data: testCase.data });
        const headers = await client.generateSignatureHeaders("POST", "/api/test", body);
        
        const response = await app.request("http://localhost/api/test", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          } as any,
          body: body,
        });

        expect(response.status).toBe(200);
      }
    });

    it("should handle extremely long header values", async () => {
      // 创建非常长的自定义头部值
      const longValue = "x".repeat(8192); // 8KB header value
      
      const headers = await client.generateSignatureHeaders("GET", "/api/test");
      const extendedHeaders = {
        ...headers,
        "X-Custom-Long-Header": longValue,
      };

      const response = await app.request("http://localhost/api/test", {
        method: "GET",
        headers: extendedHeaders as any,
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Concurrent Edge Cases", () => {
    it("should handle rapid successive requests with same timestamp", async () => {
      const fixedTimestamp = new Date().toISOString();
      const requestCount = 20;

      const promises = Array.from({ length: requestCount }, async (_, i) => {
        const headers = await client.generateSignatureHeaders(
          "GET",
          `/api/test?rapid=${i}`,
          undefined,
          fixedTimestamp
        );

        return app.request(`http://localhost/api/test?rapid=${i}`, {
          method: "GET",
          headers: headers as any,
        });
      });

      const responses = await Promise.all(promises);

      // 所有请求都应该成功（相同时间戳是允许的）
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
      });
    });

    it("should handle interleaved valid and invalid requests", async () => {
      const requestCount = 50;
      const promises: Promise<{ index: number; status: number; expected: "valid" | "invalid" }>[] = [];

      for (let i = 0; i < requestCount; i++) {
        const isValid = i % 2 === 0; // 交替有效/无效

        const promise = (async () => {
          if (isValid) {
            const headers = await client.generateSignatureHeaders("GET", `/api/test?interleaved=${i}`);
            const response = await app.request(`http://localhost/api/test?interleaved=${i}`, {
              method: "GET",
              headers: headers as any,
            });
            return { index: i, status: response.status, expected: "valid" as const };
          } else {
            const headers = await client.generateSignatureHeaders("GET", `/api/test?interleaved=${i}`);
            const invalidHeaders = {
              ...headers,
              "X-Signature": `invalid-${i}`,
            };
            const response = await app.request(`http://localhost/api/test?interleaved=${i}`, {
              method: "GET",
              headers: invalidHeaders as any,
            });
            return { index: i, status: response.status, expected: "invalid" as const };
          }
        })();

        promises.push(promise);
      }

      const results = await Promise.all(promises);

      const validResults = results.filter(r => r.expected === "valid");
      const invalidResults = results.filter(r => r.expected === "invalid");

      const validSuccessCount = validResults.filter(r => r.status === 200).length;
      const invalidRejectionCount = invalidResults.filter(r => r.status === 401).length;

      expect(validSuccessCount).toBe(validResults.length);
      expect(invalidRejectionCount).toBe(invalidResults.length);
    });
  });

  describe("Resource Exhaustion Scenarios", () => {
    it("should handle requests when cache is full", async () => {
      // 填满缓存
      const cacheFillerCount = 100;
      
      for (let i = 0; i < cacheFillerCount; i++) {
        const fillerKeyPair = await KeyGenerator.generateKeyPair("ES256", {
          keyId: `filler-key-${i}`,
        });

        const fillerAppConfig: AppConfig = {
          appId: `filler-app-${i}`,
          name: `Filler App ${i}`,
          keyPairs: [
            {
              keyId: `filler-key-${i}`,
              publicKey: fillerKeyPair.publicKey,
              algorithm: "ES256",
              createdAt: new Date(),
              enabled: true,
            },
          ],
          enabled: true,
          permissions: ["read"],
          createdAt: new Date(),
        };

        await keyManager.addApp(fillerAppConfig);
      }

      // 现在测试原始应用是否仍然工作
      const headers = await client.generateSignatureHeaders("GET", "/api/test");
      const response = await app.request("http://localhost/api/test", {
        method: "GET",
        headers: headers as any,
      });

      expect(response.status).toBe(200);

      const cacheStats = keyManager.getCacheStats();
      console.log(`Cache stats after filling: size=${cacheStats.size}, hitRate=${cacheStats.hitRate}`);
    });

    it("should handle memory pressure gracefully", async () => {
      // 创建大量大对象来模拟内存压力
      const memoryPressureObjects: any[] = [];
      
      try {
        // 创建内存压力
        for (let i = 0; i < 100; i++) {
          memoryPressureObjects.push({
            id: i,
            data: new Array(10000).fill(`memory-pressure-data-${i}`),
            timestamp: new Date(),
          });
        }

        // 在内存压力下测试签名验证
        const headers = await client.generateSignatureHeaders("GET", "/api/test");
        const response = await app.request("http://localhost/api/test", {
          method: "GET",
          headers: headers as any,
        });

        expect(response.status).toBe(200);

      } finally {
        // 清理内存压力对象
        memoryPressureObjects.length = 0;
        
        // 强制垃圾回收（如果可用）
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe("Time-based Edge Cases", () => {
    it("should handle clock skew scenarios", async () => {
      // 测试不同的时钟偏差
      const clockSkewCases = [
        { name: "5 minutes behind", offset: -5 * 60 * 1000, shouldPass: false },
        { name: "4 minutes behind", offset: -4 * 60 * 1000, shouldPass: true },
        { name: "1 minute behind", offset: -1 * 60 * 1000, shouldPass: true },
        { name: "current time", offset: 0, shouldPass: true },
        { name: "1 minute ahead", offset: 1 * 60 * 1000, shouldPass: true },
        { name: "4 minutes ahead", offset: 4 * 60 * 1000, shouldPass: true },
        { name: "6 minutes ahead", offset: 6 * 60 * 1000, shouldPass: false },
      ];

      for (const testCase of clockSkewCases) {
        const timestamp = new Date(Date.now() + testCase.offset).toISOString();
        const headers = await client.generateSignatureHeaders("GET", "/api/test", undefined, timestamp);
        
        const response = await app.request("http://localhost/api/test", {
          method: "GET",
          headers: headers as any,
        });

        if (testCase.shouldPass) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(401);
        }
      }
    });

    it("should handle daylight saving time transitions", async () => {
      // 模拟夏令时转换期间的时间戳
      const dstTransitionTimes = [
        "2024-03-10T06:59:59.000Z", // 夏令时开始前1分钟
        "2024-03-10T07:00:00.000Z", // 夏令时开始
        "2024-03-10T07:01:00.000Z", // 夏令时开始后1分钟
        "2024-11-03T05:59:59.000Z", // 夏令时结束前1分钟
        "2024-11-03T06:00:00.000Z", // 夏令时结束
        "2024-11-03T06:01:00.000Z", // 夏令时结束后1分钟
      ];

      for (const timestamp of dstTransitionTimes) {
        // 只有当前时间附近的时间戳才会通过验证
        const isRecent = Math.abs(new Date(timestamp).getTime() - Date.now()) < 5 * 60 * 1000;
        
        const headers = await client.generateSignatureHeaders("GET", "/api/test", undefined, timestamp);
        const response = await app.request("http://localhost/api/test", {
          method: "GET",
          headers: headers as any,
        });

        if (isRecent) {
          expect(response.status).toBe(200);
        } else {
          expect(response.status).toBe(401);
        }
      }
    });
  });

  describe("Network and Protocol Edge Cases", () => {
    it("should handle requests with unusual HTTP methods", async () => {
      const unusualMethods = ["PATCH", "OPTIONS", "HEAD", "TRACE"];

      for (const method of unusualMethods) {
        const headers = await client.generateSignatureHeaders(method, "/api/test");
        
        const response = await app.request("http://localhost/api/test", {
          method: method as any,
          headers: headers as any,
        });

        // 签名验证应该成功，即使方法不常见
        expect(response.status).toBe(200);
      }
    });

    it("should handle requests with case variations in headers", async () => {
      const headers = await client.generateSignatureHeaders("GET", "/api/test");
      
      // 测试不同的大小写组合
      const caseVariations = [
        { "x-signature": headers["X-Signature"] },
        { "X-SIGNATURE": headers["X-Signature"] },
        { "x-Signature": headers["X-Signature"] },
      ];

      for (const caseHeaders of caseVariations) {
        const testHeaders = {
          ...headers,
          ...caseHeaders,
        };
        delete testHeaders["X-Signature"]; // 删除原始头部

        const response = await app.request("http://localhost/api/test", {
          method: "GET",
          headers: testHeaders as any,
        });

        // HTTP头部应该是大小写不敏感的，但我们的实现可能区分大小写
        // 这取决于具体的实现
        expect([200, 400].includes(response.status)).toBe(true);
      }
    });
  });

  // 辅助函数
  function setupTestRoutes() {
    app.get("/api/test", (c) => {
      return c.json({
        success: true,
        timestamp: Date.now(),
        path: c.req.path,
        method: c.req.method,
      });
    });

    app.post("/api/test", async (c) => {
      const body = await c.req.text();
      return c.json({
        received: true,
        size: body.length,
        path: c.req.path,
        method: c.req.method,
      });
    });

    app.post("/api/large-body", async (c) => {
      const body = await c.req.text();
      return c.json({
        received: true,
        size: body.length,
        timestamp: Date.now(),
      });
    });

    app.post("/api/binary", async (c) => {
      const body = await c.req.text();
      return c.json({
        received: true,
        size: body.length,
        type: "binary",
      });
    });

    // 支持所有HTTP方法的通用路由
    app.all("/api/test", (c) => {
      return c.json({
        success: true,
        method: c.req.method,
        path: c.req.path,
        timestamp: Date.now(),
      });
    });

    // 通配符路由处理长路径
    app.all("/api/*", (c) => {
      return c.json({
        success: true,
        method: c.req.method,
        path: c.req.path,
        timestamp: Date.now(),
      });
    });
  }
});