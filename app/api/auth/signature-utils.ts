/**
 * 签名工具类 - 提供数字签名生成和验证功能
 * Signature utilities for digital signature generation and verification
 */

export interface SignatureData {
  /** 时间戳 (ISO 8601 格式) */
  timestamp: string;
  /** HTTP 方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 请求体（可选） */
  body?: string;
  /** 应用 ID */
  appId: string;
}

export interface SignatureResult {
  /** 生成的签名 */
  signature: string;
  /** 签名算法 */
  algorithm: string;
  /** 时间戳 */
  timestamp: string;
}

export type SupportedAlgorithm = "RS256" | "RS512" | "ES256" | "ES512";

/**
 * 签名工具类
 */
export class SignatureUtils {
  private static readonly SUPPORTED_ALGORITHMS: SupportedAlgorithm[] = [
    "RS256",
    "RS512",
    "ES256",
    "ES512",
  ];

  /**
   * 构建签名数据字符串
   * 格式: {timestamp}\n{method}\n{path}\n{appId}\n{body}
   */
  static buildSignatureString(data: SignatureData): string {
    const parts = [
      data.timestamp,
      data.method.toUpperCase(),
      data.path,
      data.appId,
      data.body || "",
    ];

    return parts.join("\n");
  }

  /**
   * 使用私钥生成签名
   */
  static async generateSignature(
    data: string,
    privateKey: string,
    algorithm: SupportedAlgorithm
  ): Promise<string> {
    if (!this.SUPPORTED_ALGORITHMS.includes(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    try {
      // 导入私钥
      const keyData = await this.importPrivateKey(privateKey, algorithm);

      // 生成签名
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const signatureBuffer = await crypto.subtle.sign(
        this.getAlgorithmParams(algorithm),
        keyData,
        dataBuffer
      );

      // 转换为 base64
      return this.arrayBufferToBase64(signatureBuffer);
    } catch (error) {
      throw new Error(
        `Failed to generate signature: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 使用公钥验证签名
   */
  static async verifySignature(
    data: string,
    signature: string,
    publicKey: string,
    algorithm: SupportedAlgorithm
  ): Promise<boolean> {
    if (!this.SUPPORTED_ALGORITHMS.includes(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    try {
      // 导入公钥
      const keyData = await this.importPublicKey(publicKey, algorithm);

      // 准备数据
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // 验证签名
      return await crypto.subtle.verify(
        this.getAlgorithmParams(algorithm),
        keyData,
        signatureBuffer,
        dataBuffer
      );
    } catch (error) {
      console.error("Signature verification failed:", error);
      return false;
    }
  }

  /**
   * 验证时间戳是否在允许的时间窗口内
   */
  static validateTimestamp(
    timestamp: string,
    windowSeconds: number = 300
  ): boolean {
    try {
      const requestTime = new Date(timestamp);
      const currentTime = new Date();

      // 检查时间戳格式是否有效
      if (isNaN(requestTime.getTime())) {
        return false;
      }

      // 如果时间窗口为0或负数，总是允许（用于测试或特殊场景）
      if (windowSeconds <= 0) {
        return true;
      }

      // 计算时间差（秒）
      const timeDiff =
        Math.abs(currentTime.getTime() - requestTime.getTime()) / 1000;

      // 检查是否在允许的时间窗口内
      return timeDiff <= windowSeconds;
    } catch (error) {
      return false;
    }
  }

  /**
   * 生成当前时间戳 (ISO 8601 格式)
   */
  static generateTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 验证算法是否支持
   */
  static isSupportedAlgorithm(
    algorithm: string
  ): algorithm is SupportedAlgorithm {
    return this.SUPPORTED_ALGORITHMS.includes(algorithm as SupportedAlgorithm);
  }

  /**
   * 获取算法参数
   */
  private static getAlgorithmParams(
    algorithm: SupportedAlgorithm
  ): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
    switch (algorithm) {
      case "RS256":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        };
      case "RS512":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-512",
        };
      case "ES256":
        return {
          name: "ECDSA",
          hash: "SHA-256",
        };
      case "ES512":
        return {
          name: "ECDSA",
          hash: "SHA-512",
        };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 导入私钥
   */
  private static async importPrivateKey(
    privateKey: string,
    algorithm: SupportedAlgorithm
  ): Promise<CryptoKey> {
    // 清理 PEM 格式
    const cleanKey = privateKey
      .replace(/-----BEGIN.*?-----/g, "")
      .replace(/-----END.*?-----/g, "")
      .replace(/\s/g, "");

    const keyBuffer = this.base64ToArrayBuffer(cleanKey);

    const algorithmParams = this.getKeyImportParams(algorithm);

    return await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      algorithmParams,
      false,
      ["sign"]
    );
  }

  /**
   * 导入公钥
   */
  private static async importPublicKey(
    publicKey: string,
    algorithm: SupportedAlgorithm
  ): Promise<CryptoKey> {
    // 清理 PEM 格式
    const cleanKey = publicKey
      .replace(/-----BEGIN.*?-----/g, "")
      .replace(/-----END.*?-----/g, "")
      .replace(/\s/g, "");

    const keyBuffer = this.base64ToArrayBuffer(cleanKey);

    const algorithmParams = this.getKeyImportParams(algorithm);

    return await crypto.subtle.importKey(
      "spki",
      keyBuffer,
      algorithmParams,
      false,
      ["verify"]
    );
  }

  /**
   * 获取密钥导入参数
   */
  private static getKeyImportParams(
    algorithm: SupportedAlgorithm
  ): RsaHashedImportParams | EcKeyImportParams {
    switch (algorithm) {
      case "RS256":
      case "RS512":
        return {
          name: "RSASSA-PKCS1-v1_5",
          hash: algorithm === "RS256" ? "SHA-256" : "SHA-512",
        };
      case "ES256":
        return {
          name: "ECDSA",
          namedCurve: "P-256",
        };
      case "ES512":
        return {
          name: "ECDSA",
          namedCurve: "P-521",
        };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * 签名生成器 - 用于客户端生成签名
 */
export class SignatureGenerator {
  constructor(
    private privateKey: string,
    private algorithm: SupportedAlgorithm,
    private appId: string
  ) {
    if (!SignatureUtils.isSupportedAlgorithm(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 为请求生成签名
   */
  async signRequest(
    method: string,
    path: string,
    body?: string,
    customTimestamp?: string
  ): Promise<SignatureResult> {
    const timestamp = customTimestamp || SignatureUtils.generateTimestamp();

    const signatureData: SignatureData = {
      timestamp,
      method,
      path,
      body,
      appId: this.appId,
    };

    const dataString = SignatureUtils.buildSignatureString(signatureData);
    const signature = await SignatureUtils.generateSignature(
      dataString,
      this.privateKey,
      this.algorithm
    );

    return {
      signature,
      algorithm: this.algorithm,
      timestamp,
    };
  }
}

/**
 * 签名验证器 - 用于服务端验证签名
 */
export class SignatureVerifier {
  constructor(
    private publicKey: string,
    private algorithm: SupportedAlgorithm,
    private timeWindowSeconds: number = 300
  ) {
    if (!SignatureUtils.isSupportedAlgorithm(algorithm)) {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 验证请求签名
   */
  async verifyRequest(
    signature: string,
    timestamp: string,
    method: string,
    path: string,
    appId: string,
    body?: string
  ): Promise<boolean> {
    // 验证时间戳
    if (!SignatureUtils.validateTimestamp(timestamp, this.timeWindowSeconds)) {
      return false;
    }

    // 构建签名数据
    const signatureData: SignatureData = {
      timestamp,
      method,
      path,
      body,
      appId,
    };

    const dataString = SignatureUtils.buildSignatureString(signatureData);

    // 验证签名
    return await SignatureUtils.verifySignature(
      dataString,
      signature,
      this.publicKey,
      this.algorithm
    );
  }
}
