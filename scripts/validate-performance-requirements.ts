#!/usr/bin/env tsx

/**
 * 验证签名认证性能要求
 * Validate signature authentication performance requirements
 */

import { OptimizedSignatureUtils } from '../app/api/auth/optimized-signature-utils.js';
import { SignatureUtils } from '../app/api/auth/signature-utils.js';
import { PerformanceMonitor } from '../app/api/auth/performance-monitor.js';

// 测试用的密钥对
const TEST_RSA_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfnGs+a8QQge+I6sOWgQIXKjrsp2j0D5QjYoonUtVWqNlC3+dT2pEHiKQDuCO
JN6yHSgQBzcBPaLuBIWUKzsfSFuMmzB6az4Cu2+AiSXUzXg7cmfuaS6Ua2lRnEDf
GsdTwrI5VRdQPpp2CdMP+qjpImr7tbANYsABaKnHlkQvcmS4Gb1jmYYDuP5QQjy9
fxkQGNcP8S1BJ/VnxZl+czVV3wjxJHcLy/OBhAuRMHGpVw4Vt4OQPQ2oEfEEdgAJ
QqrHwqiPtFM2UOhs2NaAotmHdP6OW4mspp2lAVBYcTyWrfQwEHGm3uFgvMbkTrI4
ctWsfmaTAgMBAAECggEBAKTmjaS6tkK8BlPXClTQ2vpz/N6uxDeS35mXpqasqskV
laAidgg/sWqpjXDbXr93otIMLlWsM+X0CqMDgSXKejLS2jx4GDjI1ZTXg++0AMJ8
sJ74pWzVDOfmCEQ/7wXs3+cbnXhKriO8Z036q92Qc1+N87SI38nkGa0ABH9CN83H
mQqt4fB7UdHzuIRe/me2PGhIq5ZBzj6h3BpoPGzEP+x3l9YmK8t/1cN0pqI+dQwY
dgfGjackLu/2qH80MCF7IyQaseZUOJyKrCLtSD/Iixv/hzDEUPfOCjFDgTpzf3cw
ta8+oE4wHCo1iI1/4TlPkwmXx4qSXtmw4aQPz7IDQvECgYEA8KNThCO2gsC2I9PQ
DM/8Cw0O983WCDY+yt7VeKBnD100GWOSIoK0ymgHfW2l5ludFzjHXKb478f/kTdG
dEOb+dcdaKeMKs3+MjJ3nLHwV4bVZLZx+mHHBzHllO/T9H7XjFy5zxFGmNSXrxVU
u+aNTLdR8vlcgfXyISGVH9rK5KECgYEAx0oQs2reBQGMVZnApD1jeq7n4MvNLcPv
t8b/eU9iUv6Y4bh+j07HKSqz+uXcABiQQBvP2DOd+zr8T3eHp/Mb5iZNqzrTaTm
a24k7PiQhd5L7lbGqMzE+26UOtqwV+RQ8gxI+EU9DEqWRNdFQRlCSbOhrsRJSl7
mAcqgYAiHw0vMCgYEA0SqY+dS2LvIzW4cHCe9k9+HFrUjZjFnev/sKyVRzROWB
0onfVdHDiNtNtjZu3UBdw0fROaLDAimr+qg8pdWTNAxzJ8h0lV5ac8mnNyArVoTu
12rlqaAMV0OFX5r7IjUn6DAMBdUAiElnm1dOucsXZPdFgx2uWkVXjyYdFRBBxhECgYEAl2oHpadKiOkvvRaaAiZ/J4Q8qBaQAr8ulrS4T4QbYoIROyQh2+1VqnnAuuGtse4+1XLXBudJNaMvuNiLjj8U
-----END PRIVATE KEY-----`;

const TEST_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcBIjn5x
rPmvEEIHviOrDloECFyo67Kdo9A+UI2KKJ1LVVqjZQt/nU9qRB4ikA7gjiTesh0o
EAc3AT2i7gSFlCs7H0hbjJswems+ArtrgIkl1M14O3Jn7mkqlGtpUZxA3xrHU8Ky
OVUXUDaadgnTD/qo6SJq+7WwDWLAAWipx5ZEL3JkuBm9Y5mGA7j+UEI8vX8ZEBjX
D/EtQSf1Z8WZfnM1Vd8I8SR3C8vzgYQLkTBxqVcOFbeDkD0NqBHxBHYACUKqx8Ko
j7RTNlDobNjWgKLZh3T+jluJrKadpQFQWHE8lq30MBBxpt7hYLzG5E6yOHLVrH5m
kwIDAQAB
-----END PUBLIC KEY-----`;

interface PerformanceTestResult {
  testName: string;
  passed: boolean;
  actualValue: number;
  expectedValue: number;
  unit: string;
  details?: string;
}

class PerformanceValidator {
  private results: PerformanceTestResult[] = [];
  private monitor: PerformanceMonitor;

  constructor() {
    this.monitor = new PerformanceMonitor({
      maxVerificationTime: 100,
      maxKeyParseTime: 50,
      minCacheHitRate: 0.8,
      maxMemoryUsage: 50 * 1024 * 1024,
    });

    // 初始化优化工具
    OptimizedSignatureUtils.initialize({
      enableKeyCache: true,
      keyCacheTTL: 3600,
      maxCacheSize: 1000,
      enableMetrics: true,
      enableFastFail: true,
    });
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Performance Validation Tests...\n');

    await this.testSingleVerificationTime();
    await this.testCachePerformance();
    await this.testConcurrentPerformance();
    await this.testBatchPerformance();
    await this.testMemoryUsage();
    await this.testPerformanceMonitoring();

    this.printResults();
  }

  private async testSingleVerificationTime(): Promise<void> {
    console.log('📊 Testing single signature verification time...');

    const testData = "performance test data";
    const signature = await SignatureUtils.generateSignature(
      testData,
      TEST_RSA_PRIVATE_KEY,
      'RS256'
    );

    // 测试多次以获得平均值
    const iterations = 10;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await OptimizedSignatureUtils.verifySignatureOptimized(
        testData,
        signature,
        TEST_RSA_PUBLIC_KEY,
        'RS256'
      );
      const duration = performance.now() - startTime;
      times.push(duration);
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const maxTime = Math.max(...times);

    this.results.push({
      testName: 'Single Verification Average Time',
      passed: avgTime < 100,
      actualValue: avgTime,
      expectedValue: 100,
      unit: 'ms',
      details: `Max: ${maxTime.toFixed(2)}ms, Min: ${Math.min(...times).toFixed(2)}ms`,
    });

    console.log(`   ✓ Average time: ${avgTime.toFixed(2)}ms (max: ${maxTime.toFixed(2)}ms)`);
  }

  private async testCachePerformance(): Promise<void> {
    console.log('📊 Testing cache performance...');

    const testData = "cache test data";
    const signature = await SignatureUtils.generateSignature(
      testData,
      TEST_RSA_PRIVATE_KEY,
      'RS256'
    );

    // 第一次验证（冷缓存）
    const startTime1 = performance.now();
    await OptimizedSignatureUtils.verifySignatureOptimized(
      testData,
      signature,
      TEST_RSA_PUBLIC_KEY,
      'RS256'
    );
    const coldCacheTime = performance.now() - startTime1;

    // 第二次验证（热缓存）
    const startTime2 = performance.now();
    await OptimizedSignatureUtils.verifySignatureOptimized(
      testData,
      signature,
      TEST_RSA_PUBLIC_KEY,
      'RS256'
    );
    const hotCacheTime = performance.now() - startTime2;

    const improvement = ((coldCacheTime - hotCacheTime) / coldCacheTime) * 100;

    this.results.push({
      testName: 'Cache Performance Improvement',
      passed: improvement > 10, // 至少 10% 的性能提升
      actualValue: improvement,
      expectedValue: 10,
      unit: '%',
      details: `Cold: ${coldCacheTime.toFixed(2)}ms, Hot: ${hotCacheTime.toFixed(2)}ms`,
    });

    console.log(`   ✓ Performance improvement: ${improvement.toFixed(1)}%`);
  }

  private async testConcurrentPerformance(): Promise<void> {
    console.log('📊 Testing concurrent verification performance...');

    const testData = "concurrent test data";
    const signature = await SignatureUtils.generateSignature(
      testData,
      TEST_RSA_PRIVATE_KEY,
      'RS256'
    );

    const concurrency = 20;
    const startTime = performance.now();

    const promises = Array(concurrency).fill(null).map(() =>
      OptimizedSignatureUtils.verifySignatureOptimized(
        testData,
        signature,
        TEST_RSA_PUBLIC_KEY,
        'RS256'
      )
    );

    const results = await Promise.all(promises);
    const totalTime = performance.now() - startTime;
    const avgTimePerRequest = totalTime / concurrency;

    const allSuccessful = results.every(r => r === true);

    this.results.push({
      testName: 'Concurrent Verification Average Time',
      passed: avgTimePerRequest < 100 && allSuccessful,
      actualValue: avgTimePerRequest,
      expectedValue: 100,
      unit: 'ms',
      details: `${concurrency} concurrent requests, total: ${totalTime.toFixed(2)}ms`,
    });

    console.log(`   ✓ Concurrent average: ${avgTimePerRequest.toFixed(2)}ms per request`);
  }

  private async testBatchPerformance(): Promise<void> {
    console.log('📊 Testing batch verification performance...');

    const batchSize = 50;
    const requests = [];

    for (let i = 0; i < batchSize; i++) {
      const testData = `batch test data ${i}`;
      const signature = await SignatureUtils.generateSignature(
        testData,
        TEST_RSA_PRIVATE_KEY,
        'RS256'
      );

      requests.push({
        data: testData,
        signature,
        publicKey: TEST_RSA_PUBLIC_KEY,
        algorithm: 'RS256' as const,
      });
    }

    const startTime = performance.now();
    const results = await OptimizedSignatureUtils.verifySignaturesBatch(requests);
    const totalTime = performance.now() - startTime;
    const avgTimePerRequest = totalTime / batchSize;

    const allSuccessful = results.every(r => r === true);

    this.results.push({
      testName: 'Batch Verification Average Time',
      passed: avgTimePerRequest < 100 && allSuccessful,
      actualValue: avgTimePerRequest,
      expectedValue: 100,
      unit: 'ms',
      details: `${batchSize} batch requests, total: ${totalTime.toFixed(2)}ms`,
    });

    console.log(`   ✓ Batch average: ${avgTimePerRequest.toFixed(2)}ms per request`);
  }

  private async testMemoryUsage(): Promise<void> {
    console.log('📊 Testing memory usage under load...');

    const initialMemory = process.memoryUsage();
    const testData = "memory test data";
    const signature = await SignatureUtils.generateSignature(
      testData,
      TEST_RSA_PRIVATE_KEY,
      'RS256'
    );

    // 执行大量验证操作
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      await OptimizedSignatureUtils.verifySignatureOptimized(
        testData,
        signature,
        TEST_RSA_PUBLIC_KEY,
        'RS256'
      );
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

    this.results.push({
      testName: 'Memory Usage Under Load',
      passed: memoryIncrease < 10 * 1024 * 1024, // 小于 10MB
      actualValue: memoryIncreaseMB,
      expectedValue: 10,
      unit: 'MB',
      details: `After ${iterations} verifications`,
    });

    console.log(`   ✓ Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
  }

  private async testPerformanceMonitoring(): Promise<void> {
    console.log('📊 Testing performance monitoring accuracy...');

    // 重置指标
    OptimizedSignatureUtils.resetMetrics();

    const testData = "monitoring test data";
    const signature = await SignatureUtils.generateSignature(
      testData,
      TEST_RSA_PRIVATE_KEY,
      'RS256'
    );

    const iterations = 20;
    for (let i = 0; i < iterations; i++) {
      await OptimizedSignatureUtils.verifySignatureOptimized(
        testData,
        signature,
        TEST_RSA_PUBLIC_KEY,
        'RS256'
      );
    }

    const metrics = OptimizedSignatureUtils.getPerformanceMetrics();

    this.results.push({
      testName: 'Performance Monitoring Accuracy',
      passed: metrics.verificationCount === iterations && metrics.avgVerificationTime > 0,
      actualValue: metrics.verificationCount,
      expectedValue: iterations,
      unit: 'count',
      details: `Avg time: ${metrics.avgVerificationTime.toFixed(2)}ms, Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`,
    });

    console.log(`   ✓ Monitored ${metrics.verificationCount} verifications`);
    console.log(`   ✓ Average time: ${metrics.avgVerificationTime.toFixed(2)}ms`);
    console.log(`   ✓ Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  }

  private printResults(): void {
    console.log('\n📋 Performance Validation Results:');
    console.log('=' .repeat(80));

    let passedTests = 0;
    let totalTests = this.results.length;

    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const comparison = result.passed ? 
        `${result.actualValue.toFixed(2)} < ${result.expectedValue}` :
        `${result.actualValue.toFixed(2)} >= ${result.expectedValue}`;

      console.log(`${status} ${result.testName}`);
      console.log(`     Expected: < ${result.expectedValue} ${result.unit}`);
      console.log(`     Actual: ${result.actualValue.toFixed(2)} ${result.unit}`);
      
      if (result.details) {
        console.log(`     Details: ${result.details}`);
      }
      
      console.log('');

      if (result.passed) passedTests++;
    }

    console.log('=' .repeat(80));
    console.log(`📊 Summary: ${passedTests}/${totalTests} tests passed`);

    if (passedTests === totalTests) {
      console.log('🎉 All performance requirements met!');
      process.exit(0);
    } else {
      console.log('⚠️  Some performance requirements not met. Review the failed tests above.');
      process.exit(1);
    }
  }
}

// 运行验证
async function main() {
  const validator = new PerformanceValidator();
  await validator.runAllTests();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}