/**
 * 密钥安全存储和分发机制
 * 提供密钥的安全存储、分发和访问控制功能
 */

import { type KeyPair, type AppConfig, KeyManagerError } from "./types.js";
import { type GeneratedKeyPair } from "./key-generator.js";

export interface KeyDistributionConfig {
  /** 加密密钥（用于加密存储的私钥） */
  encryptionKey?: string;
  /** 分发端点配置 */
  distributionEndpoints?: {
    /** 公钥分发端点 */
    publicKeys: string;
    /** 密钥元数据端点 */
    keyMetadata: string;
  };
  /** 访问控制配置 */
  accessControl: {
    /** 允许访问的 IP 地址 */
    allowedIPs?: string[];
    /** API 密钥验证 */
    requireApiKey?: boolean;
    /** 速率限制 */
    rateLimit?: {
      requestsPerMinute: number;
      burstLimit: number;
    };
  };
  /** 审计日志配置 */
  auditLog?: {
    enabled: boolean;
    logLevel: "info" | "warn" | "error";
    includeClientInfo: boolean;
  };
}

export interface KeyPackage {
  /** 密钥 ID */
  keyId: string;
  /** 应用 ID */
  appId: string;
  /** 公钥（PEM 格式） */
  publicKey: string;
  /** 加密的私钥（仅用于分发给授权客户端） */
  encryptedPrivateKey?: string;
  /** 密钥元数据 */
  metadata: {
    algorithm: string;
    createdAt: Date;
    expiresAt?: Date;
    fingerprint: string;
    keySize?: number;
    curve?: string;
  };
  /** 分发时间 */
  distributedAt: Date;
  /** 分发给的客户端信息 */
  distributedTo?: {
    clientId: string;
    clientIP: string;
    userAgent?: string;
  };
}

export interface KeyDistributionRequest {
  /** 应用 ID */
  appId: string;
  /** 密钥 ID（可选，不指定则返回所有有效密钥） */
  keyId?: string;
  /** 是否包含私钥 */
  includePrivateKey?: boolean;
  /** 客户端标识 */
  clientId: string;
  /** 请求时间戳 */
  timestamp: Date;
  /** 请求签名（用于验证请求的完整性） */
  signature?: string;
}

export interface KeyDistributionResponse {
  /** 是否成功 */
  success: boolean;
  /** 密钥包列表 */
  keyPackages?: KeyPackage[];
  /** 错误信息 */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** 响应元数据 */
  metadata: {
    timestamp: Date;
    requestId: string;
    totalKeys: number;
  };
}

/**
 * 密钥分发管理器
 */
export class KeyDistributionManager {
  private config: KeyDistributionConfig;
  private distributionLog: Map<string, KeyPackage[]> = new Map();

  constructor(config: KeyDistributionConfig) {
    this.config = config;
  }

  /**
   * 创建密钥包
   */
  async createKeyPackage(
    keyPair: GeneratedKeyPair,
    appId: string,
    includePrivateKey: boolean = false,
    clientInfo?: KeyPackage["distributedTo"]
  ): Promise<KeyPackage> {
    try {
      // 生成密钥指纹
      const fingerprint = await this.generateKeyFingerprint(keyPair.publicKey);

      // 获取密钥信息
      const keyInfo = await this.getKeyInfo(keyPair);

      const keyPackage: KeyPackage = {
        keyId: keyPair.keyId,
        appId,
        publicKey: keyPair.publicKey,
        metadata: {
          algorithm: keyPair.algorithm,
          createdAt: keyPair.createdAt,
          expiresAt: keyPair.expiresAt,
          fingerprint,
          ...keyInfo,
        },
        distributedAt: new Date(),
        distributedTo: clientInfo,
      };

      // 如果需要包含私钥，进行加密处理
      if (includePrivateKey && keyPair.privateKey) {
        if (!this.config.encryptionKey) {
          throw new KeyManagerError(
            "Encryption key not configured for private key distribution",
            "VALIDATION_ERROR",
            { keyId: keyPair.keyId }
          );
        }

        keyPackage.encryptedPrivateKey = await this.encryptPrivateKey(
          keyPair.privateKey,
          this.config.encryptionKey
        );
      }

      return keyPackage;
    } catch (error) {
      throw new KeyManagerError(
        `Failed to create key package: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_ERROR",
        { keyId: keyPair.keyId, appId }
      );
    }
  }

  /**
   * 分发密钥
   */
  async distributeKeys(request: KeyDistributionRequest): Promise<KeyDistributionResponse> {
    const requestId = this.generateRequestId();

    try {
      // 验证请求
      await this.validateDistributionRequest(request);

      // 记录审计日志
      if (this.config.auditLog?.enabled) {
        this.logDistributionRequest(request, requestId);
      }

      // 获取密钥包
      const keyPackages = await this.getKeyPackagesForDistribution(request);

      // 记录分发历史
      this.recordDistribution(request.appId, keyPackages);

      const response: KeyDistributionResponse = {
        success: true,
        keyPackages,
        metadata: {
          timestamp: new Date(),
          requestId,
          totalKeys: keyPackages.length,
        },
      };

      return response;
    } catch (error) {
      const errorResponse: KeyDistributionResponse = {
        success: false,
        error: {
          code: error instanceof KeyManagerError ? error.code : "DISTRIBUTION_ERROR",
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof KeyManagerError ? error.details : undefined,
        },
        metadata: {
          timestamp: new Date(),
          requestId,
          totalKeys: 0,
        },
      };

      // 记录错误日志
      if (this.config.auditLog?.enabled) {
        this.logDistributionError(request, errorResponse, requestId);
      }

      return errorResponse;
    }
  }

  /**
   * 获取公钥（公开端点）
   */
  async getPublicKeys(appId: string, keyId?: string): Promise<{
    keys: Array<{
      keyId: string;
      publicKey: string;
      algorithm: string;
      fingerprint: string;
      expiresAt?: Date;
    }>;
    metadata: {
      appId: string;
      timestamp: Date;
      totalKeys: number;
    };
  }> {
    // 这里应该从密钥管理器获取公钥信息
    // 为了演示，返回一个基本结构
    return {
      keys: [],
      metadata: {
        appId,
        timestamp: new Date(),
        totalKeys: 0,
      },
    };
  }

  /**
   * 撤销密钥分发
   */
  async revokeKeyDistribution(appId: string, keyId: string, clientId?: string): Promise<{
    revoked: boolean;
    affectedDistributions: number;
  }> {
    let affectedDistributions = 0;

    // 从分发日志中移除相关记录
    const distributions = this.distributionLog.get(appId) || [];
    const filteredDistributions = distributions.filter(pkg => {
      const shouldRevoke = pkg.keyId === keyId && 
        (!clientId || pkg.distributedTo?.clientId === clientId);
      
      if (shouldRevoke) {
        affectedDistributions++;
      }
      
      return !shouldRevoke;
    });

    this.distributionLog.set(appId, filteredDistributions);

    // 记录撤销日志
    if (this.config.auditLog?.enabled) {
      console.log(`[KeyDistribution] Revoked key distribution: appId=${appId}, keyId=${keyId}, clientId=${clientId}, affected=${affectedDistributions}`);
    }

    return {
      revoked: affectedDistributions > 0,
      affectedDistributions,
    };
  }

  /**
   * 获取分发历史
   */
  getDistributionHistory(appId: string, keyId?: string): KeyPackage[] {
    const distributions = this.distributionLog.get(appId) || [];
    
    if (keyId) {
      return distributions.filter(pkg => pkg.keyId === keyId);
    }
    
    return distributions;
  }

  /**
   * 清理过期的分发记录
   */
  cleanupExpiredDistributions(maxAgeDays: number = 90): {
    cleaned: number;
    remaining: number;
  } {
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    let totalCleaned = 0;
    let totalRemaining = 0;

    for (const [appId, distributions] of this.distributionLog.entries()) {
      const validDistributions = distributions.filter(pkg => {
        const isExpired = pkg.distributedAt < cutoffDate;
        if (isExpired) {
          totalCleaned++;
        } else {
          totalRemaining++;
        }
        return !isExpired;
      });

      this.distributionLog.set(appId, validDistributions);
    }

    return {
      cleaned: totalCleaned,
      remaining: totalRemaining,
    };
  }

  /**
   * 验证分发请求
   */
  private async validateDistributionRequest(request: KeyDistributionRequest): Promise<void> {
    // 验证时间戳（防止重放攻击）
    const now = new Date();
    const requestAge = now.getTime() - request.timestamp.getTime();
    const maxAge = 5 * 60 * 1000; // 5 分钟

    if (requestAge > maxAge) {
      throw new KeyManagerError(
        "Request timestamp is too old",
        "VALIDATION_ERROR",
        { timestamp: request.timestamp, maxAge }
      );
    }

    // 验证必需字段
    if (!request.appId || !request.clientId) {
      throw new KeyManagerError(
        "Missing required fields in distribution request",
        "VALIDATION_ERROR",
        { appId: request.appId, clientId: request.clientId }
      );
    }

    // 验证签名（如果提供）
    if (request.signature) {
      const isValidSignature = await this.validateRequestSignature(request);
      if (!isValidSignature) {
        throw new KeyManagerError(
          "Invalid request signature",
          "VALIDATION_ERROR",
          { appId: request.appId, clientId: request.clientId }
        );
      }
    }
  }

  /**
   * 获取用于分发的密钥包
   */
  private async getKeyPackagesForDistribution(request: KeyDistributionRequest): Promise<KeyPackage[]> {
    // 这里应该从密钥管理器获取实际的密钥
    // 为了演示，返回空数组
    return [];
  }

  /**
   * 加密私钥
   */
  private async encryptPrivateKey(privateKey: string, encryptionKey: string): Promise<string> {
    try {
      // 使用 AES-GCM 加密私钥
      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey);
      const privateKeyData = encoder.encode(privateKey);

      // 生成密钥
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData.slice(0, 32), // 使用前32字节作为密钥
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );

      // 生成随机 IV
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // 加密
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        privateKeyData
      );

      // 组合 IV 和加密数据
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      // 转换为 Base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      throw new KeyManagerError(
        `Failed to encrypt private key: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_ERROR"
      );
    }
  }

  /**
   * 解密私钥
   */
  async decryptPrivateKey(encryptedPrivateKey: string, encryptionKey: string): Promise<string> {
    try {
      // 从 Base64 解码
      const combined = new Uint8Array(
        atob(encryptedPrivateKey).split('').map(c => c.charCodeAt(0))
      );

      // 分离 IV 和加密数据
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // 生成密钥
      const encoder = new TextEncoder();
      const keyData = encoder.encode(encryptionKey);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData.slice(0, 32),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      // 解密
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encrypted
      );

      // 转换为字符串
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new KeyManagerError(
        `Failed to decrypt private key: ${error instanceof Error ? error.message : String(error)}`,
        "STORAGE_ERROR"
      );
    }
  }

  /**
   * 生成密钥指纹
   */
  private async generateKeyFingerprint(publicKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(publicKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
    
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase();
  }

  /**
   * 获取密钥信息
   */
  private async getKeyInfo(keyPair: GeneratedKeyPair): Promise<{
    keySize?: number;
    curve?: string;
  }> {
    const info: any = {};

    if (keyPair.algorithm.startsWith("RS")) {
      // RSA 密钥，估算大小
      const keyContent = keyPair.publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
      const keyLength = Math.floor(keyContent.length * 3 / 4);
      info.keySize = keyLength > 400 ? 4096 : keyLength > 300 ? 3072 : 2048;
    } else {
      // ECDSA 密钥
      info.curve = keyPair.algorithm === "ES256" ? "P-256" : "P-521";
    }

    return info;
  }

  /**
   * 验证请求签名
   */
  private async validateRequestSignature(request: KeyDistributionRequest): Promise<boolean> {
    // 这里应该实现实际的签名验证逻辑
    // 为了演示，总是返回 true
    return true;
  }

  /**
   * 记录分发历史
   */
  private recordDistribution(appId: string, keyPackages: KeyPackage[]): void {
    const existing = this.distributionLog.get(appId) || [];
    this.distributionLog.set(appId, [...existing, ...keyPackages]);
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录分发请求日志
   */
  private logDistributionRequest(request: KeyDistributionRequest, requestId: string): void {
    if (this.config.auditLog?.logLevel === "info") {
      console.log(`[KeyDistribution] Request: ${requestId}`, {
        appId: request.appId,
        keyId: request.keyId,
        clientId: request.clientId,
        includePrivateKey: request.includePrivateKey,
        timestamp: request.timestamp,
      });
    }
  }

  /**
   * 记录分发错误日志
   */
  private logDistributionError(
    request: KeyDistributionRequest,
    response: KeyDistributionResponse,
    requestId: string
  ): void {
    if (this.config.auditLog?.logLevel === "error") {
      console.error(`[KeyDistribution] Error: ${requestId}`, {
        appId: request.appId,
        clientId: request.clientId,
        error: response.error,
      });
    }
  }
}

/**
 * 创建密钥分发管理器的工厂函数
 */
export function createKeyDistributionManager(config: KeyDistributionConfig): KeyDistributionManager {
  return new KeyDistributionManager(config);
}