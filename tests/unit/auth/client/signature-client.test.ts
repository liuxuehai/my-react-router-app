/**
 * 客户端签名生成工具测试
 * Client signature generation tools tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignatureClient, createSignatureClient, generateSignature, generateBatchSignatures } from '../../../../app/api/auth/client/signature-client.js';
import { SignatureUtils } from '../../../../app/api/auth/signature-utils.js';

// Mock the crypto.subtle for testing since we're in Node.js environment
const mockCrypto = {
  subtle: {
    importKey: vi.fn().mockResolvedValue({}),
    sign: vi.fn().mockResolvedValue(new ArrayBuffer(256)),
    verify: vi.fn().mockResolvedValue(true)
  }
};

// @ts-ignore
global.crypto = mockCrypto;

// 测试密钥对 - 使用简化的测试密钥
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

const TEST_CONFIG = {
  appId: 'test-app-123',
  privateKey: TEST_PRIVATE_KEY,
  algorithm: 'RS256' as const,
  keyId: 'test-key-001',
  baseUrl: 'https://api.test.com'
};

// Mock fetch
global.fetch = vi.fn();

describe('SignatureClient', () => {
  let client: SignatureClient;

  beforeEach(() => {
    client = new SignatureClient(TEST_CONFIG);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(SignatureClient);
      expect(client.getConfig().appId).toBe(TEST_CONFIG.appId);
    });

    it('should throw error for missing appId', () => {
      expect(() => {
        new SignatureClient({
          ...TEST_CONFIG,
          appId: ''
        });
      }).toThrow('App ID is required');
    });

    it('should throw error for missing private key', () => {
      expect(() => {
        new SignatureClient({
          ...TEST_CONFIG,
          privateKey: ''
        });
      }).toThrow('Private key is required');
    });

    it('should throw error for unsupported algorithm', () => {
      expect(() => {
        new SignatureClient({
          ...TEST_CONFIG,
          algorithm: 'INVALID' as any
        });
      }).toThrow('Unsupported algorithm: INVALID');
    });

    it('should throw error for invalid private key format', () => {
      expect(() => {
        new SignatureClient({
          ...TEST_CONFIG,
          privateKey: 'invalid-key-format'
        });
      }).toThrow('Private key must be in PEM format');
    });
  });

  describe('generateSignatureHeaders', () => {
    it('should generate valid signature headers', async () => {
      const headers = await client.generateSignatureHeaders('GET', '/api/users');

      expect(headers).toHaveProperty('X-Signature');
      expect(headers).toHaveProperty('X-Timestamp');
      expect(headers).toHaveProperty('X-App-Id', TEST_CONFIG.appId);
      expect(headers).toHaveProperty('X-Key-Id', TEST_CONFIG.keyId);
      
      // 验证时间戳格式
      expect(headers['X-Timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // 验证签名不为空
      expect(headers['X-Signature']).toBeTruthy();
      expect(typeof headers['X-Signature']).toBe('string');
    });

    it('should generate consistent signatures for same input', async () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      
      const headers1 = await client.generateSignatureHeaders('POST', '/api/users', '{"name":"test"}', timestamp);
      const headers2 = await client.generateSignatureHeaders('POST', '/api/users', '{"name":"test"}', timestamp);

      expect(headers1['X-Signature']).toBe(headers2['X-Signature']);
      expect(headers1['X-Timestamp']).toBe(headers2['X-Timestamp']);
    });

    it('should generate different signatures for different inputs', async () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      
      const headers1 = await client.generateSignatureHeaders('GET', '/api/users', undefined, timestamp);
      const headers2 = await client.generateSignatureHeaders('POST', '/api/users', undefined, timestamp);

      expect(headers1['X-Signature']).not.toBe(headers2['X-Signature']);
    });

    it('should include custom headers when configured', async () => {
      const clientWithCustomHeaders = new SignatureClient({
        ...TEST_CONFIG,
        customHeaders: {
          'X-Custom': 'value',
          'Accept-Language': 'zh-CN'
        }
      });

      const headers = await clientWithCustomHeaders.generateSignatureHeaders('GET', '/api/users');

      expect(headers['X-Custom']).toBe('value');
      expect(headers['Accept-Language']).toBe('zh-CN');
    });

    it('should not include Key-Id when not configured', async () => {
      const clientWithoutKeyId = new SignatureClient({
        ...TEST_CONFIG,
        keyId: undefined
      });

      const headers = await clientWithoutKeyId.generateSignatureHeaders('GET', '/api/users');

      expect(headers['X-Key-Id']).toBeUndefined();
    });
  });

  describe('createSignedRequest', () => {
    it('should create signed request with all required fields', async () => {
      const request = await client.createSignedRequest('POST', '/api/users', { name: 'John' });

      expect(request.url).toBe('https://api.test.com/api/users');
      expect(request.method).toBe('POST');
      expect(request.body).toBe('{"name":"John"}');
      expect(request.headers).toHaveProperty('X-Signature');
      expect(request.headers).toHaveProperty('X-Timestamp');
      expect(request.headers).toHaveProperty('X-App-Id');
      expect(request.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should handle string body correctly', async () => {
      const request = await client.createSignedRequest('POST', '/api/data', 'raw string data');

      expect(request.body).toBe('raw string data');
      expect(request.headers['Content-Type']).toBeUndefined();
    });

    it('should handle empty body correctly', async () => {
      const request = await client.createSignedRequest('GET', '/api/users');

      expect(request.body).toBeUndefined();
      expect(request.headers['Content-Type']).toBeUndefined();
    });

    it('should merge additional headers', async () => {
      const request = await client.createSignedRequest('GET', '/api/users', undefined, {
        headers: {
          'Authorization': 'Bearer token',
          'Accept': 'application/json'
        }
      });

      expect(request.headers['Authorization']).toBe('Bearer token');
      expect(request.headers['Accept']).toBe('application/json');
    });

    it('should use custom timestamp when provided', async () => {
      const customTimestamp = '2024-01-15T10:30:00.000Z';
      const request = await client.createSignedRequest('GET', '/api/users', undefined, {
        timestamp: customTimestamp
      });

      expect(request.headers['X-Timestamp']).toBe(customTimestamp);
    });
  });

  describe('HTTP methods', () => {
    beforeEach(() => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });
    });

    it('should send GET request correctly', async () => {
      await client.get('/api/users');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Signature': expect.any(String),
            'X-Timestamp': expect.any(String),
            'X-App-Id': TEST_CONFIG.appId
          })
        })
      );
    });

    it('should send POST request correctly', async () => {
      const data = { name: 'John', email: 'john@example.com' };
      await client.post('/api/users', data);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
          headers: expect.objectContaining({
            'X-Signature': expect.any(String),
            'X-Timestamp': expect.any(String),
            'X-App-Id': TEST_CONFIG.appId,
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should send PUT request correctly', async () => {
      const data = { name: 'Jane' };
      await client.put('/api/users/123', data);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/users/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data)
        })
      );
    });

    it('should send DELETE request correctly', async () => {
      await client.delete('/api/users/123');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/users/123',
        expect.objectContaining({
          method: 'DELETE',
          body: undefined
        })
      );
    });

    it('should send PATCH request correctly', async () => {
      const data = { email: 'newemail@example.com' };
      await client.patch('/api/users/123', data);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/users/123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data)
        })
      );
    });
  });

  describe('updateConfig', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        appId: 'new-app-id',
        baseUrl: 'https://new-api.com'
      };

      client.updateConfig(newConfig);

      const config = client.getConfig();
      expect(config.appId).toBe('new-app-id');
      expect(config.baseUrl).toBe('https://new-api.com');
      expect(config.privateKey).toBe(TEST_CONFIG.privateKey); // 保持不变
    });

    it('should validate updated configuration', () => {
      expect(() => {
        client.updateConfig({ appId: '' });
      }).toThrow('App ID is required');
    });
  });

  describe('getConfig', () => {
    it('should return readonly copy of configuration', () => {
      const config = client.getConfig();
      
      expect(config).toEqual(TEST_CONFIG);
      
      // 尝试修改返回的配置不应影响原始配置
      (config as any).appId = 'modified';
      expect(client.getConfig().appId).toBe(TEST_CONFIG.appId);
    });
  });
});

describe('Factory functions', () => {
  describe('createSignatureClient', () => {
    it('should create client instance', () => {
      const client = createSignatureClient(TEST_CONFIG);
      expect(client).toBeInstanceOf(SignatureClient);
    });
  });

  describe('generateSignature', () => {
    it('should generate signature headers', async () => {
      const headers = await generateSignature(
        TEST_CONFIG.appId,
        TEST_CONFIG.privateKey,
        TEST_CONFIG.algorithm,
        'GET',
        '/api/users'
      );

      expect(headers).toHaveProperty('X-Signature');
      expect(headers).toHaveProperty('X-Timestamp');
      expect(headers).toHaveProperty('X-App-Id', TEST_CONFIG.appId);
    });
  });

  describe('generateBatchSignatures', () => {
    it('should generate multiple signatures', async () => {
      const requests = [
        { method: 'GET', path: '/api/users' },
        { method: 'POST', path: '/api/orders', body: '{"item":"book"}' },
        { method: 'DELETE', path: '/api/items/123' }
      ];

      const signatures = await generateBatchSignatures(TEST_CONFIG, requests);

      expect(signatures).toHaveLength(3);
      signatures.forEach(sig => {
        expect(sig).toHaveProperty('X-Signature');
        expect(sig).toHaveProperty('X-Timestamp');
        expect(sig).toHaveProperty('X-App-Id', TEST_CONFIG.appId);
      });

      // 每个签名应该不同
      expect(signatures[0]['X-Signature']).not.toBe(signatures[1]['X-Signature']);
      expect(signatures[1]['X-Signature']).not.toBe(signatures[2]['X-Signature']);
    });

    it('should handle custom timestamps in batch', async () => {
      const timestamp = '2024-01-15T10:30:00.000Z';
      const requests = [
        { method: 'GET', path: '/api/users', timestamp },
        { method: 'POST', path: '/api/orders', body: '{"item":"book"}', timestamp }
      ];

      const signatures = await generateBatchSignatures(TEST_CONFIG, requests);

      expect(signatures[0]['X-Timestamp']).toBe(timestamp);
      expect(signatures[1]['X-Timestamp']).toBe(timestamp);
    });
  });
});

describe('Integration with SignatureUtils', () => {
  it('should generate verifiable signatures', async () => {
    const timestamp = '2024-01-15T10:30:00.000Z';
    const method = 'POST';
    const path = '/api/users';
    const body = '{"name":"John"}';

    const headers = await client.generateSignatureHeaders(method, path, body, timestamp);

    // 使用 SignatureUtils 验证生成的签名
    const signatureData = {
      timestamp,
      method,
      path,
      appId: TEST_CONFIG.appId,
      body
    };

    const dataString = SignatureUtils.buildSignatureString(signatureData);
    const isValid = await SignatureUtils.verifySignature(
      dataString,
      headers['X-Signature'],
      TEST_PUBLIC_KEY,
      TEST_CONFIG.algorithm
    );

    expect(isValid).toBe(true);
  });

  it('should fail verification with wrong public key', async () => {
    const wrongPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwrong+public+key+here
-----END PUBLIC KEY-----`;

    const headers = await client.generateSignatureHeaders('GET', '/api/test');

    const signatureData = {
      timestamp: headers['X-Timestamp'],
      method: 'GET',
      path: '/api/test',
      appId: TEST_CONFIG.appId,
      body: undefined
    };

    const dataString = SignatureUtils.buildSignatureString(signatureData);
    
    // 这应该抛出错误或返回 false，因为公钥不匹配
    await expect(
      SignatureUtils.verifySignature(
        dataString,
        headers['X-Signature'],
        wrongPublicKey,
        TEST_CONFIG.algorithm
      )
    ).resolves.toBe(false);
  });
});

describe('Error handling', () => {
  it('should handle network errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(client.get('/api/users')).rejects.toThrow('Network error');
  });

  it('should handle invalid signature generation', async () => {
    const invalidClient = new SignatureClient({
      ...TEST_CONFIG,
      privateKey: TEST_PRIVATE_KEY.replace('PRIVATE', 'INVALID')
    });

    await expect(
      invalidClient.generateSignatureHeaders('GET', '/api/users')
    ).rejects.toThrow();
  });
});

describe('Edge cases', () => {
  it('should handle empty paths', async () => {
    const headers = await client.generateSignatureHeaders('GET', '');
    expect(headers['X-Signature']).toBeTruthy();
  });

  it('should handle special characters in paths', async () => {
    const path = '/api/users?name=张三&email=test@example.com';
    const headers = await client.generateSignatureHeaders('GET', path);
    expect(headers['X-Signature']).toBeTruthy();
  });

  it('should handle large request bodies', async () => {
    const largeBody = JSON.stringify({
      data: 'x'.repeat(10000),
      array: new Array(1000).fill('test')
    });

    const headers = await client.generateSignatureHeaders('POST', '/api/data', largeBody);
    expect(headers['X-Signature']).toBeTruthy();
  });

  it('should handle unicode in request body', async () => {
    const unicodeBody = JSON.stringify({
      name: '张三',
      description: '这是一个测试用户 🚀',
      emoji: '😀😃😄😁'
    });

    const headers = await client.generateSignatureHeaders('POST', '/api/users', unicodeBody);
    expect(headers['X-Signature']).toBeTruthy();
  });
});