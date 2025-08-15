/**
 * 性能优化集成测试
 * Integration tests for performance optimization features
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { signatureAuth } from '../../app/api/middleware/signature-auth.js';
import { createKeyManager } from '../../app/api/auth/key-manager.js';
import { OptimizedSignatureUtils } from '../../app/api/auth/optimized-signature-utils.js';
import { globalPerformanceMonitor } from '../../app/api/auth/performance-monitor.js';
import type { KeyManager, AppConfig } from '../../app/api/auth/types.js';

describe('Performance Optimization Integration', () => {
  let app: Hono;
  let keyManager: KeyManager;

  beforeAll(async () => {
    // 创建测试应用配置
    const testAppConfig: AppConfig = {
      appId: 'test-app',
      name: 'Test Application',
      keyPairs: [
        {
          keyId: 'default',
          publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
+CPYJhwhoVoheMlSWxo9O6omEFRz4mM4QZ5Jp+N3sHVWrJbh5HgI0Wq3lcPW/Z54
UGOl0rRlovgD5HUKw/EMV8sbZz+A0I21ZVUo6UtqmM93d9U4By37ICb7lG8mvid
vnmXQ8bToiP5vcPZGBgAxmuBL1bd/lLlOhGLiUgE8HyjGzXdXCvkPPohWxV7mq62
eZOD34B1bwXFN2JEA6ZNo1yuhhkWvkPn0zAUBgVJDFZktkB5OCgYBgQIDAQAB
-----END PUBLIC KEY-----`,
          algorithm: 'RS256',
          createdAt: new Date('2024-01-01'),
          enabled: true,
        },
      ],
      enabled: true,
      createdAt: new Date('2024-01-01'),
    };

    // 创建密钥管理器
    keyManager = createKeyManager({
      storageType: 'memory',
      cacheExpiry: 300,
      enableCache: true,
      debug: false,
    });

    await keyManager.addApp(testAppConfig);

    // 创建 Hono 应用
    app = new Hono();

    // 添加性能优化的签名认证中间件
    app.use('*', signatureAuth({
      keyManager,
      timeWindowSeconds: 300,
      debug: false,
      enableOptimization: true,
      enablePerformanceMonitoring: true,
    }));

    app.get('/test', (c) => c.json({ message: 'success' }));
    app.post('/test', (c) => c.json({ message: 'success' }));
  });

  afterAll(() => {
    OptimizedSignatureUtils.destroy();
  });

  describe('Middleware Performance Optimization', () => {
    it('should initialize optimized signature utils correctly', async () => {
      const config = OptimizedSignatureUtils.getConfig();
      
      expect(config.enableKeyCache).toBe(true);
      expect(config.enableMetrics).toBe(true);
      expect(config.enableFastFail).toBe(true);
      expect(config.keyCacheTTL).toBeGreaterThan(0);
      expect(config.maxCacheSize).toBeGreaterThan(0);

      console.log('Optimized Utils Configuration:', config);
    });

    it('should handle missing signature headers efficiently', async () => {
      const startTime = performance.now();

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          // 缺少签名头
        },
      });

      const res = await app.request(req);
      const duration = performance.now() - startTime;

      expect(res.status).toBe(400); // 缺少必需头部
      expect(duration).toBeLessThan(10); // 快速失败

      console.log(`Missing headers handled in: ${duration.toFixed(2)}ms`);
    });

    it('should handle invalid app ID efficiently', async () => {
      const startTime = performance.now();

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'invalid-signature',
          'X-Timestamp': new Date().toISOString(),
          'X-App-Id': 'non-existent-app',
        },
      });

      const res = await app.request(req);
      const duration = performance.now() - startTime;

      expect(res.status).toBe(403); // App not found
      expect(duration).toBeLessThan(50); // 快速失败

      console.log(`Invalid app ID handled in: ${duration.toFixed(2)}ms`);
    });

    it('should handle invalid timestamp efficiently', async () => {
      const startTime = performance.now();

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': 'invalid-timestamp',
          'X-App-Id': 'test-app',
        },
      });

      const res = await app.request(req);
      const duration = performance.now() - startTime;

      expect(res.status).toBe(401); // Invalid timestamp
      expect(duration).toBeLessThan(50); // 快速失败

      console.log(`Invalid timestamp handled in: ${duration.toFixed(2)}ms`);
    });

    it('should handle expired timestamp efficiently', async () => {
      const startTime = performance.now();

      // 创建过期的时间戳（1小时前）
      const expiredTimestamp = new Date(Date.now() - 3600000).toISOString();

      const req = new Request('http://localhost/test', {
        method: 'GET',
        headers: {
          'X-Signature': 'some-signature',
          'X-Timestamp': expiredTimestamp,
          'X-App-Id': 'test-app',
        },
      });

      const res = await app.request(req);
      const duration = performance.now() - startTime;

      expect(res.status).toBe(401); // Expired timestamp
      expect(duration).toBeLessThan(100); // 相对快速

      console.log(`Expired timestamp handled in: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Performance Monitoring Integration', () => {
    it('should track performance metrics during request processing', async () => {
      // 重置性能监控
      globalPerformanceMonitor.reset();

      // 发送一些请求来生成指标
      const requests = [
        { method: 'GET', path: '/test' },
        { method: 'POST', path: '/test' },
        { method: 'GET', path: '/test' },
      ];

      for (const { method, path } of requests) {
        const req = new Request(`http://localhost${path}`, {
          method,
          headers: {
            'X-Signature': 'invalid-signature',
            'X-Timestamp': new Date().toISOString(),
            'X-App-Id': 'test-app',
          },
        });

        await app.request(req);
      }

      // 检查是否有性能指标被记录
      const stats = globalPerformanceMonitor.getOperationStats('signature_verification', 60000);
      
      expect(stats.count).toBeGreaterThan(0);
      expect(stats.avgDuration).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThanOrEqual(1);

      console.log('Performance Stats:', {
        count: stats.count,
        avgDuration: `${stats.avgDuration.toFixed(2)}ms`,
        successRate: `${(stats.successRate * 100).toFixed(1)}%`,
      });
    });

    it('should generate meaningful performance reports', async () => {
      // 生成性能报告
      const report = globalPerformanceMonitor.generateReport(60000);

      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.metrics).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.alerts).toBeInstanceOf(Array);
      expect(report.recommendations).toBeInstanceOf(Array);

      console.log('Performance Report Summary:', {
        overallScore: report.overallScore,
        avgVerificationTime: `${report.metrics.avgVerificationTime.toFixed(2)}ms`,
        requestsPerSecond: report.metrics.requestsPerSecond.toFixed(2),
        alertsCount: report.alerts.length,
        recommendationsCount: report.recommendations.length,
      });
    });
  });

  describe('Cache Performance Integration', () => {
    it('should demonstrate cache effectiveness in key manager', async () => {
      // 清除缓存统计
      keyManager.clearCache();

      const appId = 'test-app';
      
      // 第一次访问（冷缓存）
      const startTime1 = performance.now();
      const config1 = await keyManager.getAppConfig(appId);
      const duration1 = performance.now() - startTime1;

      // 第二次访问（热缓存）
      const startTime2 = performance.now();
      const config2 = await keyManager.getAppConfig(appId);
      const duration2 = performance.now() - startTime2;

      expect(config1).toBeDefined();
      expect(config2).toBeDefined();
      expect(config1?.appId).toBe(appId);
      expect(config2?.appId).toBe(appId);

      // 缓存应该提供性能提升
      expect(duration2).toBeLessThanOrEqual(duration1);

      const cacheStats = keyManager.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);

      console.log('Key Manager Cache Performance:', {
        coldCache: `${duration1.toFixed(2)}ms`,
        hotCache: `${duration2.toFixed(2)}ms`,
        improvement: `${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`,
        cacheSize: cacheStats.size,
      });
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrency = 10;
      const startTime = performance.now();

      // 并发请求相同的应用配置
      const promises = Array(concurrency).fill(null).map(() =>
        keyManager.getAppConfig('test-app')
      );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;
      const avgTime = totalTime / concurrency;

      expect(results.length).toBe(concurrency);
      expect(results.every(r => r?.appId === 'test-app')).toBe(true);
      expect(avgTime).toBeLessThan(10); // 平均每个请求应该很快

      console.log('Concurrent Cache Access:', {
        concurrency,
        totalTime: `${totalTime.toFixed(2)}ms`,
        avgTime: `${avgTime.toFixed(2)}ms`,
      });
    });
  });

  describe('Memory Usage Optimization', () => {
    it('should maintain reasonable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // 模拟大量请求
      const iterations = 100;
      for (let i = 0; i < iterations; i++) {
        const req = new Request('http://localhost/test', {
          method: 'GET',
          headers: {
            'X-Signature': `signature-${i}`,
            'X-Timestamp': new Date().toISOString(),
            'X-App-Id': 'test-app',
          },
        });

        await app.request(req);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // 内存增长应该是合理的
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 小于 50MB

      console.log('Memory Usage After Load Test:', {
        iterations,
        memoryIncrease: `${memoryIncreaseMB.toFixed(2)}MB`,
        heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      });
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle various error scenarios efficiently', async () => {
      const errorScenarios = [
        {
          name: 'Missing signature',
          headers: {
            'X-Timestamp': new Date().toISOString(),
            'X-App-Id': 'test-app',
          },
          expectedStatus: 400,
        },
        {
          name: 'Missing timestamp',
          headers: {
            'X-Signature': 'some-signature',
            'X-App-Id': 'test-app',
          },
          expectedStatus: 400,
        },
        {
          name: 'Missing app ID',
          headers: {
            'X-Signature': 'some-signature',
            'X-Timestamp': new Date().toISOString(),
          },
          expectedStatus: 400,
        },
        {
          name: 'Invalid app ID',
          headers: {
            'X-Signature': 'some-signature',
            'X-Timestamp': new Date().toISOString(),
            'X-App-Id': 'invalid-app',
          },
          expectedStatus: 403,
        },
      ];

      const results = [];

      for (const scenario of errorScenarios) {
        const startTime = performance.now();

        const req = new Request('http://localhost/test', {
          method: 'GET',
          headers: scenario.headers,
        });

        const res = await app.request(req);
        const duration = performance.now() - startTime;

        expect(res.status).toBe(scenario.expectedStatus);
        expect(duration).toBeLessThan(50); // 所有错误场景都应该快速处理

        results.push({
          scenario: scenario.name,
          duration: duration.toFixed(2),
          status: res.status,
        });
      }

      console.log('Error Handling Performance:', results);
    });
  });

  describe('Overall Performance Requirements', () => {
    it('should meet the 100ms performance requirement', async () => {
      // 测试多种请求场景的性能
      const scenarios = [
        { name: 'GET request', method: 'GET', path: '/test' },
        { name: 'POST request', method: 'POST', path: '/test' },
      ];

      const performanceResults = [];

      for (const scenario of scenarios) {
        const iterations = 5;
        const times = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();

          const req = new Request(`http://localhost${scenario.path}`, {
            method: scenario.method,
            headers: {
              'X-Signature': 'test-signature',
              'X-Timestamp': new Date().toISOString(),
              'X-App-Id': 'test-app',
            },
          });

          await app.request(req);
          const duration = performance.now() - startTime;
          times.push(duration);
        }

        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const maxTime = Math.max(...times);

        performanceResults.push({
          scenario: scenario.name,
          avgTime: avgTime.toFixed(2),
          maxTime: maxTime.toFixed(2),
        });

        // 验证性能要求
        expect(avgTime).toBeLessThan(100);
        expect(maxTime).toBeLessThan(100);
      }

      console.log('Performance Requirements Validation:', performanceResults);
      console.log('✅ All scenarios meet the 100ms requirement');
    });
  });
});