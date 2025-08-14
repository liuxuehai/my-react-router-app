/**
 * 测试工具 - 为签名测试提供模拟实现
 */

// 模拟的签名实现，用于测试环境
export class MockSignatureUtils {
  static buildSignatureString(data: any): string {
    const parts = [
      data.timestamp,
      data.method.toUpperCase(),
      data.path,
      data.appId,
      data.body || ''
    ];
    return parts.join('\n');
  }

  static async generateSignature(
    data: string,
    privateKey: string,
    algorithm: string
  ): Promise<string> {
    // 简单的模拟签名：基于数据和密钥的哈希
    const combined = data + privateKey + algorithm;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(combined);
    
    // 使用 Web Crypto API 的 digest 功能生成模拟签名
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return this.arrayBufferToBase64(hashBuffer);
  }

  static async verifySignature(
    data: string,
    signature: string,
    publicKey: string,
    algorithm: string
  ): Promise<boolean> {
    try {
      // 从公钥推导出对应的私钥（仅用于测试）
      const mockPrivateKey = publicKey.replace('public', 'private');
      const expectedSignature = await this.generateSignature(data, mockPrivateKey, algorithm);
      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  static validateTimestamp(timestamp: string, windowSeconds: number = 300): boolean {
    try {
      const requestTime = new Date(timestamp);
      const currentTime = new Date();
      
      if (isNaN(requestTime.getTime())) {
        return false;
      }
      
      const timeDiff = Math.abs(currentTime.getTime() - requestTime.getTime()) / 1000;
      return timeDiff <= windowSeconds;
    } catch {
      return false;
    }
  }

  static generateTimestamp(): string {
    return new Date().toISOString();
  }

  static isSupportedAlgorithm(algorithm: string): boolean {
    return ['RS256', 'RS512', 'ES256', 'ES512'].includes(algorithm);
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// 测试密钥对
export const TEST_KEYS = {
  rsa: {
    private: 'test-rsa-private-key-for-testing',
    public: 'test-rsa-public-key-for-testing'
  },
  ecdsa: {
    private: 'test-ecdsa-private-key-for-testing',
    public: 'test-ecdsa-public-key-for-testing'
  }
};

// 模拟的签名生成器
export class MockSignatureGenerator {
  constructor(
    private privateKey: string,
    private algorithm: string,
    private appId: string
  ) {
    if (!MockSignatureUtils.isSupportedAlgorithm(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  async signRequest(
    method: string,
    path: string,
    body?: string,
    customTimestamp?: string
  ): Promise<{ signature: string; algorithm: string; timestamp: string }> {
    const timestamp = customTimestamp || MockSignatureUtils.generateTimestamp();
    
    const signatureData = {
      timestamp,
      method,
      path,
      body,
      appId: this.appId
    };

    const dataString = MockSignatureUtils.buildSignatureString(signatureData);
    const signature = await MockSignatureUtils.generateSignature(
      dataString,
      this.privateKey,
      this.algorithm
    );

    return {
      signature,
      algorithm: this.algorithm,
      timestamp
    };
  }
}

// 模拟的签名验证器
export class MockSignatureVerifier {
  constructor(
    private publicKey: string,
    private algorithm: string,
    private timeWindowSeconds: number = 300
  ) {
    if (!MockSignatureUtils.isSupportedAlgorithm(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  async verifyRequest(
    signature: string,
    timestamp: string,
    method: string,
    path: string,
    appId: string,
    body?: string
  ): Promise<boolean> {
    // 验证时间戳
    if (!MockSignatureUtils.validateTimestamp(timestamp, this.timeWindowSeconds)) {
      return false;
    }

    // 构建签名数据
    const signatureData = {
      timestamp,
      method,
      path,
      body,
      appId
    };

    const dataString = MockSignatureUtils.buildSignatureString(signatureData);
    
    // 验证签名
    return await MockSignatureUtils.verifySignature(
      dataString,
      signature,
      this.publicKey,
      this.algorithm
    );
  }
}