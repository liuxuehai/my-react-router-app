/**
 * 签名工具集成测试 - 测试完整的签名生成和验证流程
 */
import { describe, it, expect } from 'vitest';
import { SignatureUtils } from '../../app/api/auth/signature-utils';
import {
  MockSignatureGenerator,
  MockSignatureVerifier,
  TEST_KEYS
} from './signature-test-utils';

describe('Signature Integration Tests', () => {
  describe('End-to-end signature flow', () => {
    it('should generate and verify signature successfully', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256',
        300
      );

      // 生成签名
      const result = await generator.signRequest(
        'POST',
        '/api/users',
        '{"name":"John","email":"john@example.com"}'
      );

      expect(result.signature).toBeDefined();
      expect(result.algorithm).toBe('RS256');
      expect(result.timestamp).toBeDefined();

      // 验证签名
      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'POST',
        '/api/users',
        'test-app',
        '{"name":"John","email":"john@example.com"}'
      );

      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong signature', async () => {
      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256',
        300
      );

      const isValid = await verifier.verifyRequest(
        'invalid-signature',
        new Date().toISOString(),
        'POST',
        '/api/users',
        'test-app',
        '{"name":"John"}'
      );

      expect(isValid).toBe(false);
    });

    it('should fail verification with expired timestamp', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256',
        60 // 1 minute window
      );

      // 使用过期的时间戳
      const expiredTimestamp = new Date(Date.now() - 120 * 1000).toISOString();
      
      const result = await generator.signRequest(
        'GET',
        '/api/users',
        undefined,
        expiredTimestamp
      );

      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'GET',
        '/api/users',
        'test-app'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Data integrity verification', () => {
    it('should detect modified request method', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256'
      );

      const result = await generator.signRequest('POST', '/api/users', '{"name":"John"}');

      // 尝试用不同的方法验证
      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'GET', // 不同的方法
        '/api/users',
        'test-app',
        '{"name":"John"}'
      );

      expect(isValid).toBe(false);
    });

    it('should detect modified request path', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256'
      );

      const result = await generator.signRequest('POST', '/api/users', '{"name":"John"}');

      // 尝试用不同的路径验证
      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'POST',
        '/api/admin', // 不同的路径
        'test-app',
        '{"name":"John"}'
      );

      expect(isValid).toBe(false);
    });

    it('should detect modified request body', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256'
      );

      const result = await generator.signRequest('POST', '/api/users', '{"name":"John"}');

      // 尝试用不同的请求体验证
      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'POST',
        '/api/users',
        'test-app',
        '{"name":"Jane"}' // 不同的请求体
      );

      expect(isValid).toBe(false);
    });

    it('should detect modified app ID', async () => {
      const generator = new MockSignatureGenerator(
        TEST_KEYS.rsa.private,
        'RS256',
        'test-app'
      );

      const verifier = new MockSignatureVerifier(
        TEST_KEYS.rsa.public,
        'RS256'
      );

      const result = await generator.signRequest('POST', '/api/users', '{"name":"John"}');

      // 尝试用不同的 App ID 验证
      const isValid = await verifier.verifyRequest(
        result.signature,
        result.timestamp,
        'POST',
        '/api/users',
        'different-app', // 不同的 App ID
        '{"name":"John"}'
      );

      expect(isValid).toBe(false);
    });
  });
});