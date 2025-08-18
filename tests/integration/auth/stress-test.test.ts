/**
 * 压力测试和负载测试
 * Stress tests and load tests for signature authentication
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { SignatureClient } from "../../../app/api/auth/client/signature-client.js";
import { signatureAuth } from "../../../app/api/middleware/signature-auth.js";
import { createKeyManager } from "../../../app/api/auth/key-manager.js";
import { KeyGenerator } from "../../../app/api/auth/key-generator.js";
import type { KeyManager, AppConfig } from "../../../app/api/auth/types.js";

describe("Stress and Load Testing", () => {
  let app: Hono;
  let keyManager: KeyManager;
  let testKeyPair: { publicKey: string; privateKey: string };
  let client: SignatureClient;

  beforeEach(async () => {
    // 生成测试密钥对
    const keyPair = await KeyGenerator.generateKeyPair("ES256", {
      keyId: "stress-test-key",
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
      appId: "stress-test-app",
      name: "Stress Test App",
      keyPairs: [
        {
          keyId: "stress-test-key",
          publicKey: testKeyPair.publicKey,
          algorithm: "ES256",
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
      enableOptimization: true,
      enablePerformanceMonitoring: true,
    }));

    // 设置测试路由
    app.get("/api/test", (c) => c.json({ success: true, timestamp: Date.now() }));
    app.post("/api/test", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      return c.json({ success: true, received: body, timestamp: Date.now() });
    });

    // 创建客户端
    client = new SignatureClient({
      appId: "stress-test-app",
      privateKey: testKeyPair.privateKey,
      algorithm: "ES256",
      keyId: "stress-test-key",
    });
  });

  afterEach(() => {
    keyManager.clearCache();
  });

  describe("High Volume Request Testing", () => {
    it("should handle 1000 sequential requests", async () => {
      const requestCount = 1000;
      const startTime = performance.now();
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < requestCount; i++) {
        try {
          const headers = await client.generateSignatureHeaders("GET", `/api/test?seq=${i}`);
          const response = await app.request(`http://localhost/api/test?seq=${i}`, {
            method: "GET",
            headers: headers as any,
          });

          if (response.status === 200) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }

        // 每100个请求报告一次进度
        if ((i + 1) % 100 === 0) {
          console.log(`Processed ${i + 1}/${requestCount} requests`);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerRequest = totalTime / requestCount;
      const requestsPerSecond = (requestCount / (totalTime / 1000));

      console.log(`Sequential Load Test Results:
        Total requests: ${requestCount}
        Successful: ${successCount}
        Failed: ${errorCount}
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms
        Requests per second: ${requestsPerSecond.toFixed(2)}`);

      expect(successCount).toBeGreaterThan(requestCount * 0.95); // 95% success rate
      expect(avgTimePerRequest).toBeLessThan(100); // Average under 100ms
    });

    it("should handle 500 concurrent requests", async () => {
      const concurrentCount = 500;
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentCount }, async (_, i) => {
        try {
          const headers = await client.generateSignatureHeaders("GET", `/api/test?concurrent=${i}`);
          const response = await app.request(`http://localhost/api/test?concurrent=${i}`, {
            method: "GET",
            headers: headers as any,
          });
          return { success: response.status === 200, status: response.status };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const avgTimePerRequest = totalTime / concurrentCount;
      const requestsPerSecond = (concurrentCount / (totalTime / 1000));

      console.log(`Concurrent Load Test Results:
        Total requests: ${concurrentCount}
        Successful: ${successCount}
        Failed: ${errorCount}
        Total time: ${totalTime.toFixed(2)}ms
        Average per request: ${avgTimePerRequest.toFixed(2)}ms
        Requests per second: ${requestsPerSecond.toFixed(2)}`);

      expect(successCount).toBeGreaterThan(concurrentCount * 0.90); // 90% success rate for concurrent
      expect(totalTime).toBeLessThan(30000); // Complete within 30 seconds
    });

    it("should handle mixed request types under load", async () => {
      const totalRequests = 200;
      const requestTypes = [
        { method: "GET", path: "/api/test", weight: 0.4 },
        { method: "POST", path: "/api/test", weight: 0.3, body: { data: "test" } },
        { method: "GET", path: "/api/test?param=value", weight: 0.3 },
      ];

      const startTime = performance.now();
      const promises: Promise<{ success: boolean; method: string; status?: number }>[] = [];

      for (let i = 0; i < totalRequests; i++) {
        // 根据权重选择请求类型
        const random = Math.random();
        let cumulativeWeight = 0;
        let selectedType = requestTypes[0];

        for (const type of requestTypes) {
          cumulativeWeight += type.weight;
          if (random <= cumulativeWeight) {
            selectedType = type;
            break;
          }
        }

        const promise = (async () => {
          try {
            const bodyString = selectedType.body ? JSON.stringify(selectedType.body) : undefined;
            const headers = await client.generateSignatureHeaders(
              selectedType.method,
              `${selectedType.path}&i=${i}`,
              bodyString
            );

            const response = await app.request(`http://localhost${selectedType.path}&i=${i}`, {
              method: selectedType.method,
              headers: {
                ...headers,
                ...(bodyString ? { "Content-Type": "application/json" } : {}),
              } as any,
              body: bodyString,
            });

            return {
              success: response.status >= 200 && response.status < 300,
              method: selectedType.method,
              status: response.status,
            };
          } catch (error) {
            return {
              success: false,
              method: selectedType.method,
            };
          }
        })();

        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const successCount = results.filter(r => r.success).length;
      const methodStats = requestTypes.reduce((stats, type) => {
        const methodResults = results.filter(r => r.method === type.method);
        stats[type.method] = {
          total: methodResults.length,
          successful: methodResults.filter(r => r.success).length,
        };
        return stats;
      }, {} as Record<string, { total: number; successful: number }>);

      console.log(`Mixed Request Load Test Results:
        Total requests: ${totalRequests}
        Successful: ${successCount}
        Total time: ${totalTime.toFixed(2)}ms
        Requests per second: ${(totalRequests / (totalTime / 1000)).toFixed(2)}`);

      console.log("Method breakdown:");
      for (const [method, stats] of Object.entries(methodStats)) {
        console.log(`  ${method}: ${stats.successful}/${stats.total} (${((stats.successful / stats.total) * 100).toFixed(1)}%)`);
      }

      expect(successCount).toBeGreaterThan(totalRequests * 0.90);
    });
  });

  describe("Memory and Resource Usage", () => {
    it("should maintain stable memory usage under sustained load", async () => {
      const iterations = 100;
      const batchSize = 20;
      const memorySnapshots: number[] = [];

      // 记录初始内存
      const initialMemory = process.memoryUsage().heapUsed;
      memorySnapshots.push(initialMemory);

      for (let batch = 0; batch < iterations / batchSize; batch++) {
        const batchPromises: Promise<Response>[] = [];

        // 创建批次请求
        for (let i = 0; i < batchSize; i++) {
          const requestIndex = batch * batchSize + i;
          const headers = await client.generateSignatureHeaders("GET", `/api/test?batch=${batch}&i=${i}`);
          
          const promise = app.request(`http://localhost/api/test?batch=${batch}&i=${i}`, {
            method: "GET",
            headers: headers as any,
          });

          batchPromises.push(promise);
        }

        // 等待批次完成
        const responses = await Promise.all(batchPromises);
        
        // 验证响应
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        // 记录内存使用
        const currentMemory = process.memoryUsage().heapUsed;
        memorySnapshots.push(currentMemory);

        // 强制垃圾回收（如果可用）
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const avgMemoryPerRequest = memoryIncrease / iterations;

      console.log(`Memory Usage Analysis:
        Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)}MB
        Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)}MB
        Total increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB
        Per request: ${(avgMemoryPerRequest / 1024).toFixed(2)}KB`);

      // 内存增长应该合理
      expect(avgMemoryPerRequest).toBeLessThan(50 * 1024); // 每个请求少于50KB
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 总增长少于100MB
    });

    it("should handle cache pressure efficiently", async () => {
      // 创建多个应用以测试缓存压力
      const appCount = 50;
      const requestsPerApp = 10;

      // 创建多个应用
      for (let i = 0; i < appCount; i++) {
        const appKeyPair = await KeyGenerator.generateKeyPair("ES256", {
          keyId: `cache-test-key-${i}`,
        });

        const appConfig: AppConfig = {
          appId: `cache-test-app-${i}`,
          name: `Cache Test App ${i}`,
          keyPairs: [
            {
              keyId: `cache-test-key-${i}`,
              publicKey: appKeyPair.publicKey,
              algorithm: "ES256",
              createdAt: new Date(),
              enabled: true,
            },
          ],
          enabled: true,
          permissions: ["read"],
          createdAt: new Date(),
        };

        await keyManager.addApp(appConfig);
      }

      const startTime = performance.now();
      let totalRequests = 0;
      let successfulRequests = 0;

      // 对每个应用发送请求
      for (let appIndex = 0; appIndex < appCount; appIndex++) {
        const appKeyPair = await KeyGenerator.generateKeyPair("ES256", {
          keyId: `cache-test-key-${appIndex}`,
        });

        const appClient = new SignatureClient({
          appId: `cache-test-app-${appIndex}`,
          privateKey: appKeyPair.privateKey!,
          algorithm: "ES256",
          keyId: `cache-test-key-${appIndex}`,
        });

        for (let reqIndex = 0; reqIndex < requestsPerApp; reqIndex++) {
          try {
            const headers = await appClient.generateSignatureHeaders("GET", `/api/test?app=${appIndex}&req=${reqIndex}`);
            const response = await app.request(`http://localhost/api/test?app=${appIndex}&req=${reqIndex}`, {
              method: "GET",
              headers: headers as any,
            });

            totalRequests++;
            if (response.status === 200) {
              successfulRequests++;
            }
          } catch (error) {
            totalRequests++;
          }
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const cacheStats = keyManager.getCacheStats();

      console.log(`Cache Pressure Test Results:
        Total apps: ${appCount}
        Requests per app: ${requestsPerApp}
        Total requests: ${totalRequests}
        Successful: ${successfulRequests}
        Success rate: ${((successfulRequests / totalRequests) * 100).toFixed(1)}%
        Total time: ${totalTime.toFixed(2)}ms
        Cache size: ${cacheStats.size}
        Cache hit rate: ${cacheStats.hitRate ? (cacheStats.hitRate * 100).toFixed(1) : 'N/A'}%`);

      expect(successfulRequests).toBeGreaterThan(totalRequests * 0.85); // 85% success rate
      expect(cacheStats.size).toBeGreaterThan(0);
    });
  });

  describe("Error Handling Under Load", () => {
    it("should handle mixed valid and invalid requests", async () => {
      const totalRequests = 200;
      const invalidRequestRatio = 0.3; // 30% invalid requests

      const promises = Array.from({ length: totalRequests }, async (_, i) => {
        const isInvalid = Math.random() < invalidRequestRatio;

        try {
          if (isInvalid) {
            // 创建无效请求（错误的签名）
            const headers = await client.generateSignatureHeaders("GET", `/api/test?invalid=${i}`);
            const invalidHeaders = {
              ...headers,
              "X-Signature": "invalid-signature-" + i,
            };

            const response = await app.request(`http://localhost/api/test?invalid=${i}`, {
              method: "GET",
              headers: invalidHeaders as any,
            });

            return {
              expected: "invalid",
              success: response.status === 401,
              status: response.status,
            };
          } else {
            // 创建有效请求
            const headers = await client.generateSignatureHeaders("GET", `/api/test?valid=${i}`);
            const response = await app.request(`http://localhost/api/test?valid=${i}`, {
              method: "GET",
              headers: headers as any,
            });

            return {
              expected: "valid",
              success: response.status === 200,
              status: response.status,
            };
          }
        } catch (error) {
          return {
            expected: isInvalid ? "invalid" : "valid",
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      const results = await Promise.all(promises);

      const validRequests = results.filter(r => r.expected === "valid");
      const invalidRequests = results.filter(r => r.expected === "invalid");
      const validSuccessCount = validRequests.filter(r => r.success).length;
      const invalidSuccessCount = invalidRequests.filter(r => r.success).length;

      console.log(`Mixed Valid/Invalid Request Test:
        Total requests: ${totalRequests}
        Valid requests: ${validRequests.length} (${validSuccessCount} handled correctly)
        Invalid requests: ${invalidRequests.length} (${invalidSuccessCount} rejected correctly)
        Valid success rate: ${((validSuccessCount / validRequests.length) * 100).toFixed(1)}%
        Invalid rejection rate: ${((invalidSuccessCount / invalidRequests.length) * 100).toFixed(1)}%`);

      expect(validSuccessCount).toBeGreaterThan(validRequests.length * 0.95);
      expect(invalidSuccessCount).toBeGreaterThan(invalidRequests.length * 0.95);
    });

    it("should recover from temporary failures", async () => {
      const requestCount = 100;
      let successCount = 0;
      let retryCount = 0;

      for (let i = 0; i < requestCount; i++) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            const headers = await client.generateSignatureHeaders("GET", `/api/test?retry=${i}&attempt=${attempts}`);
            const response = await app.request(`http://localhost/api/test?retry=${i}&attempt=${attempts}`, {
              method: "GET",
              headers: headers as any,
            });

            if (response.status === 200) {
              successCount++;
              break;
            } else if (attempts < maxAttempts - 1) {
              retryCount++;
              attempts++;
              // 短暂延迟后重试
              await new Promise(resolve => setTimeout(resolve, 10));
            } else {
              attempts++;
            }
          } catch (error) {
            if (attempts < maxAttempts - 1) {
              retryCount++;
              attempts++;
              await new Promise(resolve => setTimeout(resolve, 10));
            } else {
              attempts++;
            }
          }
        }
      }

      console.log(`Recovery Test Results:
        Total requests: ${requestCount}
        Successful: ${successCount}
        Total retries: ${retryCount}
        Success rate: ${((successCount / requestCount) * 100).toFixed(1)}%
        Average retries per request: ${(retryCount / requestCount).toFixed(2)}`);

      expect(successCount).toBeGreaterThan(requestCount * 0.90);
    });
  });

  describe("Performance Degradation Testing", () => {
    it("should maintain performance under increasing load", async () => {
      const loadLevels = [10, 25, 50, 100, 200];
      const performanceResults: Array<{
        load: number;
        avgTime: number;
        successRate: number;
        requestsPerSecond: number;
      }> = [];

      for (const load of loadLevels) {
        const startTime = performance.now();
        let successCount = 0;

        const promises = Array.from({ length: load }, async (_, i) => {
          try {
            const headers = await client.generateSignatureHeaders("GET", `/api/test?load=${load}&i=${i}`);
            const response = await app.request(`http://localhost/api/test?load=${load}&i=${i}`, {
              method: "GET",
              headers: headers as any,
            });

            return response.status === 200;
          } catch (error) {
            return false;
          }
        });

        const results = await Promise.all(promises);
        const endTime = performance.now();

        successCount = results.filter(Boolean).length;
        const totalTime = endTime - startTime;
        const avgTime = totalTime / load;
        const successRate = successCount / load;
        const requestsPerSecond = load / (totalTime / 1000);

        performanceResults.push({
          load,
          avgTime,
          successRate,
          requestsPerSecond,
        });

        console.log(`Load ${load}: avg=${avgTime.toFixed(2)}ms, success=${(successRate * 100).toFixed(1)}%, rps=${requestsPerSecond.toFixed(2)}`);
      }

      // 验证性能不会显著降级
      const baselinePerformance = performanceResults[0];
      const highestLoadPerformance = performanceResults[performanceResults.length - 1];

      const performanceDegradation = (highestLoadPerformance.avgTime - baselinePerformance.avgTime) / baselinePerformance.avgTime;
      const successRateDrop = baselinePerformance.successRate - highestLoadPerformance.successRate;

      console.log(`Performance Analysis:
        Baseline (${baselinePerformance.load} requests): ${baselinePerformance.avgTime.toFixed(2)}ms avg
        Highest load (${highestLoadPerformance.load} requests): ${highestLoadPerformance.avgTime.toFixed(2)}ms avg
        Performance degradation: ${(performanceDegradation * 100).toFixed(1)}%
        Success rate drop: ${(successRateDrop * 100).toFixed(1)}%`);

      expect(performanceDegradation).toBeLessThan(2.0); // 性能降级不超过200%
      expect(successRateDrop).toBeLessThan(0.1); // 成功率下降不超过10%
      expect(highestLoadPerformance.successRate).toBeGreaterThan(0.85); // 最高负载下仍有85%成功率
    });
  });
});