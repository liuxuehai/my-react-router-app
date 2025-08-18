/**
 * 密钥生成工具
 * 提供 RSA 和 ECDSA 密钥对的生成功能
 */

import { type KeyPair } from "./types.js";

export interface KeyGenerationOptions {
  /** 密钥 ID，如果不提供则自动生成 */
  keyId?: string;
  /** 密钥过期时间（天数），如果不提供则永不过期 */
  expiryDays?: number;
  /** 是否启用密钥 */
  enabled?: boolean;
  /** RSA 密钥长度（仅 RSA 算法） */
  rsaKeySize?: 2048 | 3072 | 4096;
  /** ECDSA 曲线（仅 ECDSA 算法） */
  ecdsaCurve?: "P-256" | "P-384" | "P-521";
}

export interface GeneratedKeyPair extends KeyPair {
  /** 私钥（PEM 格式） */
  privateKey: string;
}

/**
 * 密钥生成器类
 */
export class KeyGenerator {
  /**
   * 生成 RSA 密钥对
   */
  static async generateRSAKeyPair(
    algorithm: "RS256" | "RS512",
    options: KeyGenerationOptions = {}
  ): Promise<GeneratedKeyPair> {
    const keySize = options.rsaKeySize || (algorithm === "RS256" ? 2048 : 3072);

    try {
      // 使用 Web Crypto API 生成 RSA 密钥对
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: keySize,
          publicExponent: new Uint8Array([1, 0, 1]), // 65537
          hash: algorithm === "RS256" ? "SHA-256" : "SHA-512",
        },
        true, // extractable
        ["sign", "verify"]
      );

      // 导出公钥和私钥
      const publicKeyBuffer = await crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
      );
      const privateKeyBuffer = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
      );

      // 转换为 PEM 格式
      const publicKeyPem = this.bufferToPem(publicKeyBuffer, "PUBLIC KEY");
      const privateKeyPem = this.bufferToPem(privateKeyBuffer, "PRIVATE KEY");

      return this.createKeyPairObject(
        algorithm,
        publicKeyPem,
        privateKeyPem,
        options
      );
    } catch (error) {
      throw new Error(
        `Failed to generate RSA key pair: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 生成 ECDSA 密钥对
   */
  static async generateECDSAKeyPair(
    algorithm: "ES256" | "ES512",
    options: KeyGenerationOptions = {}
  ): Promise<GeneratedKeyPair> {
    const curve =
      options.ecdsaCurve || (algorithm === "ES256" ? "P-256" : "P-521");

    try {
      // 使用 Web Crypto API 生成 ECDSA 密钥对
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: curve,
        },
        true, // extractable
        ["sign", "verify"]
      );

      // 导出公钥和私钥
      const publicKeyBuffer = await crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey
      );
      const privateKeyBuffer = await crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey
      );

      // 转换为 PEM 格式
      const publicKeyPem = this.bufferToPem(publicKeyBuffer, "PUBLIC KEY");
      const privateKeyPem = this.bufferToPem(privateKeyBuffer, "PRIVATE KEY");

      return this.createKeyPairObject(
        algorithm,
        publicKeyPem,
        privateKeyPem,
        options
      );
    } catch (error) {
      throw new Error(
        `Failed to generate ECDSA key pair: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 根据算法生成密钥对
   */
  static async generateKeyPair(
    algorithm: "RS256" | "RS512" | "ES256" | "ES512",
    options: KeyGenerationOptions = {}
  ): Promise<GeneratedKeyPair> {
    switch (algorithm) {
      case "RS256":
      case "RS512":
        return this.generateRSAKeyPair(algorithm, options);
      case "ES256":
      case "ES512":
        return this.generateECDSAKeyPair(algorithm, options);
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 批量生成密钥对
   */
  static async generateMultipleKeyPairs(
    configs: Array<{
      algorithm: "RS256" | "RS512" | "ES256" | "ES512";
      options?: KeyGenerationOptions;
    }>
  ): Promise<GeneratedKeyPair[]> {
    const promises = configs.map(({ algorithm, options }) =>
      this.generateKeyPair(algorithm, options)
    );

    return Promise.all(promises);
  }

  /**
   * 验证密钥对的有效性
   */
  static async validateKeyPair(keyPair: GeneratedKeyPair): Promise<boolean> {
    try {
      // 创建测试数据
      const testData = "test-signature-validation";
      const encoder = new TextEncoder();
      const data = encoder.encode(testData);

      // 导入密钥
      const privateKey = await this.importPrivateKey(
        keyPair.privateKey,
        keyPair.algorithm
      );
      const publicKey = await this.importPublicKey(
        keyPair.publicKey,
        keyPair.algorithm
      );

      // 使用私钥签名
      const signature = await crypto.subtle.sign(
        this.getSignAlgorithm(keyPair.algorithm),
        privateKey,
        data
      );

      // 使用公钥验证
      const isValid = await crypto.subtle.verify(
        this.getSignAlgorithm(keyPair.algorithm),
        publicKey,
        signature,
        data
      );

      return isValid;
    } catch (error) {
      console.error("Key pair validation failed:", error);
      return false;
    }
  }

  /**
   * 从 PEM 格式导入私钥
   */
  static async importPrivateKey(
    pemKey: string,
    algorithm: "RS256" | "RS512" | "ES256" | "ES512"
  ): Promise<CryptoKey> {
    const keyData = this.pemToBuffer(pemKey);

    return crypto.subtle.importKey(
      "pkcs8",
      keyData,
      this.getKeyAlgorithm(algorithm),
      false,
      ["sign"]
    );
  }

  /**
   * 从 PEM 格式导入公钥
   */
  static async importPublicKey(
    pemKey: string,
    algorithm: "RS256" | "RS512" | "ES256" | "ES512"
  ): Promise<CryptoKey> {
    const keyData = this.pemToBuffer(pemKey);

    return crypto.subtle.importKey(
      "spki",
      keyData,
      this.getKeyAlgorithm(algorithm),
      false,
      ["verify"]
    );
  }

  /**
   * 获取密钥信息
   */
  static async getKeyInfo(keyPair: GeneratedKeyPair): Promise<{
    algorithm: string;
    keySize?: number;
    curve?: string;
    fingerprint: string;
    createdAt: Date;
    expiresAt?: Date;
  }> {
    try {
      const publicKey = await this.importPublicKey(
        keyPair.publicKey,
        keyPair.algorithm
      );
      const keyData = this.pemToBuffer(keyPair.publicKey);

      // 生成指纹
      const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
      const fingerprint = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":")
        .toUpperCase();

      const info: any = {
        algorithm: keyPair.algorithm,
        fingerprint,
        createdAt: keyPair.createdAt,
      };

      if (keyPair.expiresAt) {
        info.expiresAt = keyPair.expiresAt;
      }

      // 尝试获取密钥大小信息（这在 Web Crypto API 中比较有限）
      if (keyPair.algorithm.startsWith("RS")) {
        // RSA 密钥，从 PEM 内容估算大小
        const keyContent = keyPair.publicKey
          .replace(/-----[^-]+-----/g, "")
          .replace(/\s/g, "");
        const keyLength = Math.floor((keyContent.length * 3) / 4); // Base64 解码后的大小
        info.keySize = keyLength > 400 ? 4096 : keyLength > 300 ? 3072 : 2048;
      } else {
        // ECDSA 密钥
        info.curve = keyPair.algorithm === "ES256" ? "P-256" : "P-521";
      }

      return info;
    } catch (error) {
      throw new Error(
        `Failed to get key info: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 将 ArrayBuffer 转换为 PEM 格式
   */
  private static bufferToPem(buffer: ArrayBuffer, type: string): string {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const formatted = base64.match(/.{1,64}/g)?.join("\n") || base64;
    return `-----BEGIN ${type}-----\n${formatted}\n-----END ${type}-----`;
  }

  /**
   * 将 PEM 格式转换为 ArrayBuffer
   */
  private static pemToBuffer(pem: string): ArrayBuffer {
    const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes.buffer;
  }

  /**
   * 创建密钥对对象
   */
  private static createKeyPairObject(
    algorithm: "RS256" | "RS512" | "ES256" | "ES512",
    publicKey: string,
    privateKey: string,
    options: KeyGenerationOptions
  ): GeneratedKeyPair {
    const now = new Date();
    const keyId =
      options.keyId ||
      `key_${now.getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    let expiresAt: Date | undefined;
    if (options.expiryDays && options.expiryDays > 0) {
      expiresAt = new Date(
        now.getTime() + options.expiryDays * 24 * 60 * 60 * 1000
      );
    }

    return {
      keyId,
      publicKey,
      privateKey,
      algorithm,
      createdAt: now,
      expiresAt,
      enabled: options.enabled !== false,
    };
  }

  /**
   * 获取签名算法配置
   */
  private static getSignAlgorithm(
    algorithm: "RS256" | "RS512" | "ES256" | "ES512"
  ): any {
    switch (algorithm) {
      case "RS256":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      case "RS512":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
      case "ES256":
        return { name: "ECDSA", hash: "SHA-256" };
      case "ES512":
        return { name: "ECDSA", hash: "SHA-512" };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }

  /**
   * 获取密钥算法配置
   */
  private static getKeyAlgorithm(
    algorithm: "RS256" | "RS512" | "ES256" | "ES512"
  ): RsaHashedImportParams | EcKeyImportParams {
    switch (algorithm) {
      case "RS256":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
      case "RS512":
        return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" };
      case "ES256":
        return { name: "ECDSA", namedCurve: "P-256" };
      case "ES512":
        return { name: "ECDSA", namedCurve: "P-521" };
      default:
        throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
  }
}

/**
 * 便捷函数：生成 RSA-SHA256 密钥对
 */
export async function generateRS256KeyPair(
  options?: KeyGenerationOptions
): Promise<GeneratedKeyPair> {
  return KeyGenerator.generateRSAKeyPair("RS256", options);
}

/**
 * 便捷函数：生成 RSA-SHA512 密钥对
 */
export async function generateRS512KeyPair(
  options?: KeyGenerationOptions
): Promise<GeneratedKeyPair> {
  return KeyGenerator.generateRSAKeyPair("RS512", options);
}

/**
 * 便捷函数：生成 ECDSA-SHA256 密钥对
 */
export async function generateES256KeyPair(
  options?: KeyGenerationOptions
): Promise<GeneratedKeyPair> {
  return KeyGenerator.generateECDSAKeyPair("ES256", options);
}

/**
 * 便捷函数：生成 ECDSA-SHA512 密钥对
 */
export async function generateES512KeyPair(
  options?: KeyGenerationOptions
): Promise<GeneratedKeyPair> {
  return KeyGenerator.generateECDSAKeyPair("ES512", options);
}
