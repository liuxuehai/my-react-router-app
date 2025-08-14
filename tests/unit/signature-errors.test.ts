/**
 * 签名工具错误场景测试
 */
import { describe, it, expect } from 'vitest';
import {
  SignatureUtils,
  SignatureGenerator,
  SignatureVerifier
} from '../../app/api/auth/signature-utils';

describe('Signature Error Scenarios', () => {
  describe('SignatureUtils error handling', () => {
    it('should throw error for unsupported algorithm in generateSignature', async () => {
      await expect(
        SignatureUtils.generateSignature(
          'test data',
          'invalid-key',
          'HS256' as any
        )
      ).rejects.toThrow('Unsupported algorithm: HS256');
    });

    it('should throw error for unsupported algorithm in verifySignature', async () => {
      await expect(
        SignatureUtils.verifySignature(
          'test data',
          'signature',
          'invalid-key',
          'HS256' as any
        )
      ).rejects.toThrow('Unsupported algorithm: HS256');
    });

    it('should throw error for invalid private key format', async () => {
      await expect(
        SignatureUtils.generateSignature(
          'test data',
          'invalid-private-key',
          'RS256'
        )
      ).rejects.toThrow('Failed to generate signature');
    });

    it('should return false for invalid public key format', async () => {
      const result = await SignatureUtils.verifySignature(
        'test data',
        'signature',
        'invalid-public-key',
        'RS256'
      );
      
      expect(result).toBe(false);
    });

    it('should return false for invalid signature format', async () => {
      const validPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
+CPYJhwhoVoheMlSWxo9O6omEFRz4mM4QZ5Jp+N3sHVWrJbh5HgI0Wq3lcPW/Z54
UGOl0rRlovgD5HUKw/EMV8sbZz+A0I21ZVUo6UtqmM93d9U4By37ICb7lG8mvid
vnmXQ8bToiP5vcPZGBgAxmuBL1bd/lLlOhGLiUgE8HyjGzXdXCvkPPohWxV7mq62
eZOD34B1bwXFN2JEA6ZNo1yuhhkWvkPn0zAUBgVJDFZktkB5OCgYBgQIDAQAB
-----END PUBLIC KEY-----`;

      const result = await SignatureUtils.verifySignature(
        'test data',
        'invalid-signature-format',
        validPublicKey,
        'RS256'
      );
      
      expect(result).toBe(false);
    });
  });

  describe('Timestamp validation edge cases', () => {
    it('should handle null timestamp', () => {
      expect(SignatureUtils.validateTimestamp(null as any, 300)).toBe(false);
    });

    it('should handle undefined timestamp', () => {
      expect(SignatureUtils.validateTimestamp(undefined as any, 300)).toBe(false);
    });

    it('should handle empty string timestamp', () => {
      expect(SignatureUtils.validateTimestamp('', 300)).toBe(false);
    });

    it('should handle malformed timestamp', () => {
      expect(SignatureUtils.validateTimestamp('not-a-date', 300)).toBe(false);
      expect(SignatureUtils.validateTimestamp('2024-13-45T25:70:80.000Z', 300)).toBe(false);
    });

    it('should handle zero time window', () => {
      const timestamp = new Date().toISOString();
      expect(SignatureUtils.validateTimestamp(timestamp, 0)).toBe(true);
    });

    it('should handle negative time window', () => {
      const timestamp = new Date().toISOString();
      expect(SignatureUtils.validateTimestamp(timestamp, -100)).toBe(true);
    });
  });

  describe('SignatureGenerator error scenarios', () => {
    it('should throw error for invalid algorithm', () => {
      expect(() => {
        new SignatureGenerator(
          'some-key',
          'INVALID' as any,
          'test-app'
        );
      }).toThrow('Unsupported algorithm: INVALID');
    });

    it('should handle signRequest with invalid private key', async () => {
      const generator = new SignatureGenerator(
        'invalid-private-key',
        'RS256',
        'test-app'
      );

      await expect(
        generator.signRequest('GET', '/api/test')
      ).rejects.toThrow('Failed to generate signature');
    });
  });

  describe('SignatureVerifier error scenarios', () => {
    it('should throw error for invalid algorithm', () => {
      expect(() => {
        new SignatureVerifier(
          'some-key',
          'INVALID' as any,
          300
        );
      }).toThrow('Unsupported algorithm: INVALID');
    });

    it('should return false for verifyRequest with invalid public key', async () => {
      const verifier = new SignatureVerifier(
        'invalid-public-key',
        'RS256',
        300
      );

      const result = await verifier.verifyRequest(
        'signature',
        new Date().toISOString(),
        'GET',
        '/api/test',
        'test-app'
      );

      expect(result).toBe(false);
    });

    it('should return false for expired timestamp in verifyRequest', async () => {
      const validPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
+CPYJhwhoVoheMlSWxo9O6omEFRz4mM4QZ5Jp+N3sHVWrJbh5HgI0Wq3lcPW/Z54
UGOl0rRlovgD5HUKw/EMV8sbZz+A0I21ZVUo6UtqmM93d9U4By37ICb7lG8mvid
vnmXQ8bToiP5vcPZGBgAxmuBL1bd/lLlOhGLiUgE8HyjGzXdXCvkPPohWxV7mq62
eZOD34B1bwXFN2JEA6ZNo1yuhhkWvkPn0zAUBgVJDFZktkB5OCgYBgQIDAQAB
-----END PUBLIC KEY-----`;

      const verifier = new SignatureVerifier(
        validPublicKey,
        'RS256',
        60 // 1 minute window
      );

      // 使用过期的时间戳
      const expiredTimestamp = new Date(Date.now() - 120 * 1000).toISOString();

      const result = await verifier.verifyRequest(
        'some-signature',
        expiredTimestamp,
        'GET',
        '/api/test',
        'test-app'
      );

      expect(result).toBe(false);
    });
  });

  describe('Edge cases for signature data construction', () => {
    it('should handle special characters in path', () => {
      const data = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'GET',
        path: '/api/users?name=John%20Doe&age=30',
        appId: 'test-app'
      };

      const result = SignatureUtils.buildSignatureString(data);
      expect(result).toContain('/api/users?name=John%20Doe&age=30');
    });

    it('should handle unicode characters in body', () => {
      const data = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'POST',
        path: '/api/users',
        appId: 'test-app',
        body: '{"name":"张三","emoji":"😀"}'
      };

      const result = SignatureUtils.buildSignatureString(data);
      expect(result).toContain('{"name":"张三","emoji":"😀"}');
    });

    it('should handle very long request body', () => {
      const longBody = 'x'.repeat(10000);
      const data = {
        timestamp: '2024-01-15T10:30:00.000Z',
        method: 'POST',
        path: '/api/upload',
        appId: 'test-app',
        body: longBody
      };

      const result = SignatureUtils.buildSignatureString(data);
      expect(result).toContain(longBody);
      expect(result.length).toBeGreaterThan(10000);
    });
  });
});