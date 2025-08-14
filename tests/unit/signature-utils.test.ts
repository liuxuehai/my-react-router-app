/**
 * 签名工具类单元测试
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  SignatureUtils,
  SignatureGenerator,
  SignatureVerifier,
  type SignatureData,
  type SupportedAlgorithm
} from '../../app/api/auth/signature-utils';

// 测试密钥对 (RSA 2048)
const TEST_RSA_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wjgHm6S4KaYP+9gsr+eCYy4rF8mXADPMxCXpbOhgEQy+37+jqM6xjwwk5c5/qV1j
GT98aZf4I9gmHCGhWiF42VJbGj07qiYQVHPiYzhBnkmn43ewdVasluHkeAjRareV
w9b9nnhQY6XStGWi+APkdQrD8QxXyxtnP4DQjbVlVSjpS2qYz3d31TgHLfsgJvuU
bya+J2+eZdDxtOiI/m9w9kYGADGa4EvVt3+UuU6EYuJSATwfKMbNd1cK+Q8+iFbF
XuarrZ5k4PfgHVvBcU3YkQDpk2jXK6GGRa+Q+fTMBQGBUkMVmS2QHk4KBgGBAgMB
AAECggEBALc2lQACC8cSfh+ozSSqBQ9K1g1lxhkuCwjPfLHVh6SyxwrJR4WpM4ki
MwjqGPpODmu1cHC+7VYXh7VNK2csjHxLoj9+7-AvVfsAoGXK69p+7gqeDPdwUBLs
3+7fqIXnxFRy8DCXtK0+mEHQHQNcUdyoJFqmtrrJVtnKzpXMjMZFOw==
-----END PRIVATE KEY-----`;

const TEST_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
+CPYJhwhoVoheMlSWxo9O6omEFRz4mM4QZ5Jp+N3sHVWrJbh5HgI0Wq3lcPW/Z54
UGOl0rRlovgD5HUKw/EMV8sbZz+A0I21ZVUo6UtqmM93d9U4By37ICb7lG8mvid
vnmXQ8bToiP5vcPZGBgAxmuBL1bd/lLlOhGLiUgE8HyjGzXdXCvkPPohWxV7mq62
eZOD34B1bwXFN2JEA6ZNo1yuhhkWvkPn0zAUBgVJDFZktkB5OCgYBgQIDAQAB
-----END PUBLIC KEY-----`;

describe('SignatureUtils', () => {
  describe('buildSignatureString', () => {
    it('should build correct signature string format', () => {
      const data: SignatureData = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'POST',
        path: '/api/users',
        appId: 'app123',
        body: '{"name":"John"}'
      };

      const result = SignatureUtils.buildSignatureString(data);
      const expected = '2024-01-15T10:30:00.000Z\nPOST\n/api/users\napp123\n{"name":"John"}';
      
      expect(result).toBe(expected);
    });

    it('should handle empty body', () => {
      const data: SignatureData = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'GET',
        path: '/api/users',
        appId: 'app123'
      };

      const result = SignatureUtils.buildSignatureString(data);
      const expected = '2024-01-15T10:30:00.000Z\nGET\n/api/users\napp123\n';
      
      expect(result).toBe(expected);
    });

    it('should normalize method to uppercase', () => {
      const data: SignatureData = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'post',
        path: '/api/users',
        appId: 'app123'
      };

      const result = SignatureUtils.buildSignatureString(data);
      expect(result).toContain('\nPOST\n');
    });
  });

  describe('validateTimestamp', () => {
    it('should validate current timestamp', () => {
      const timestamp = new Date().toISOString();
      expect(SignatureUtils.validateTimestamp(timestamp, 300)).toBe(true);
    });

    it('should reject expired timestamp', () => {
      const expiredTime = new Date(Date.now() - 400 * 1000).toISOString(); // 400 seconds ago
      expect(SignatureUtils.validateTimestamp(expiredTime, 300)).toBe(false);
    });

    it('should reject future timestamp beyond window', () => {
      const futureTime = new Date(Date.now() + 400 * 1000).toISOString(); // 400 seconds in future
      expect(SignatureUtils.validateTimestamp(futureTime, 300)).toBe(false);
    });

    it('should accept timestamp within window', () => {
      const recentTime = new Date(Date.now() - 200 * 1000).toISOString(); // 200 seconds ago
      expect(SignatureUtils.validateTimestamp(recentTime, 300)).toBe(true);
    });

    it('should reject invalid timestamp format', () => {
      expect(SignatureUtils.validateTimestamp('invalid-date', 300)).toBe(false);
      expect(SignatureUtils.validateTimestamp('', 300)).toBe(false);
    });

    it('should use custom time window', () => {
      const timestamp = new Date(Date.now() - 100 * 1000).toISOString(); // 100 seconds ago
      expect(SignatureUtils.validateTimestamp(timestamp, 50)).toBe(false);
      expect(SignatureUtils.validateTimestamp(timestamp, 150)).toBe(true);
    });
  });

  describe('generateTimestamp', () => {
    it('should generate valid ISO 8601 timestamp', () => {
      const timestamp = SignatureUtils.generateTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be parseable as Date
      const date = new Date(timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it('should generate current timestamp', () => {
      const before = Date.now();
      const timestamp = SignatureUtils.generateTimestamp();
      const after = Date.now();
      
      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

  describe('isSupportedAlgorithm', () => {
    it('should validate supported algorithms', () => {
      expect(SignatureUtils.isSupportedAlgorithm('RS256')).toBe(true);
      expect(SignatureUtils.isSupportedAlgorithm('RS512')).toBe(true);
      expect(SignatureUtils.isSupportedAlgorithm('ES256')).toBe(true);
      expect(SignatureUtils.isSupportedAlgorithm('ES512')).toBe(true);
    });

    it('should reject unsupported algorithms', () => {
      expect(SignatureUtils.isSupportedAlgorithm('HS256')).toBe(false);
      expect(SignatureUtils.isSupportedAlgorithm('RS384')).toBe(false);
      expect(SignatureUtils.isSupportedAlgorithm('invalid')).toBe(false);
      expect(SignatureUtils.isSupportedAlgorithm('')).toBe(false);
    });
  });
});

describe('SignatureGenerator', () => {
  it('should create generator with valid parameters', () => {
    expect(() => {
      new SignatureGenerator(TEST_RSA_PRIVATE_KEY, 'RS256', 'test-app');
    }).not.toThrow();
  });

  it('should reject unsupported algorithm', () => {
    expect(() => {
      new SignatureGenerator(TEST_RSA_PRIVATE_KEY, 'HS256' as any, 'test-app');
    }).toThrow('Unsupported algorithm: HS256');
  });
});

describe('SignatureVerifier', () => {
  it('should create verifier with valid parameters', () => {
    expect(() => {
      new SignatureVerifier(TEST_RSA_PUBLIC_KEY, 'RS256', 300);
    }).not.toThrow();
  });

  it('should reject unsupported algorithm', () => {
    expect(() => {
      new SignatureVerifier(TEST_RSA_PUBLIC_KEY, 'HS256' as any, 300);
    }).toThrow('Unsupported algorithm: HS256');
  });

  it('should use default time window', () => {
    const verifier = new SignatureVerifier(TEST_RSA_PUBLIC_KEY, 'RS256');
    expect(verifier).toBeDefined();
  });
});