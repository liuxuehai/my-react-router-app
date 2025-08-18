/**
 * 客户端签名生成工具
 * Client-side signature generation utilities
 */

import { SignatureUtils } from "../signature-utils.js";
import type { SignatureData, SupportedAlgorithm } from "../signature-utils.js";

export interface ClientConfig {
  /** 应用 ID */
  appId: string;
  /** 私钥 (PEM 格式) */
  privateKey: string;
  /** 签名算法 */
  algorithm: SupportedAlgorithm;
  /** 密钥 ID (可选) */
  keyId?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
}

export interface SignedRequestHeaders {
  "X-Signature": string;
  "X-Timestamp": string;
  "X-App-Id": string;
  "X-Key-Id"?: string;
  [key: string]: string | undefined;
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: SignedRequestHeaders;
  body?: string;
}

/**
 * 客户端签名生成器
 */
export class SignatureClient {
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = { ...config };

    // 验证配置
    this.validateConfig();
  }

  /**
   * 生成签名请求头
   */
  async generateSignatureHeaders(
    method: string,
    path: string,
    body?: string,
    customTimestamp?: string
  ): Promise<SignedRequestHeaders> {
    const timestamp = customTimestamp || SignatureUtils.generateTimestamp();

    const signatureData: SignatureData = {
      timestamp,
      method: method.toUpperCase(),
      path,
      body,
      appId: this.config.appId,
    };

    const dataString = SignatureUtils.buildSignatureString(signatureData);
    const signature = await SignatureUtils.generateSignature(
      dataString,
      this.config.privateKey,
      this.config.algorithm
    );

    const headers: SignedRequestHeaders = {
      "X-Signature": signature,
      "X-Timestamp": timestamp,
      "X-App-Id": this.config.appId,
    };

    if (this.config.keyId) {
      headers["X-Key-Id"] = this.config.keyId;
    }

    // 添加自定义请求头
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    return headers;
  }

  /**
   * 创建签名请求对象
   */
  async createSignedRequest(
    method: string,
    path: string,
    body?: any,
    options?: {
      timestamp?: string;
      headers?: Record<string, string>;
    }
  ): Promise<SignedRequest> {
    const bodyString = body
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : undefined;
    const url = this.config.baseUrl ? `${this.config.baseUrl}${path}` : path;

    const signatureHeaders = await this.generateSignatureHeaders(
      method,
      path,
      bodyString,
      options?.timestamp
    );

    // 合并额外的请求头
    const allHeaders = {
      ...signatureHeaders,
      ...options?.headers,
    };

    // 如果有请求体且是 JSON，添加 Content-Type
    if (bodyString && typeof body === "object") {
      allHeaders["Content-Type"] = "application/json";
    }

    return {
      url,
      method: method.toUpperCase(),
      headers: allHeaders,
      body: bodyString,
    };
  }

  /**
   * 发送签名请求 (使用 fetch API)
   */
  async sendSignedRequest(
    method: string,
    path: string,
    body?: any,
    options?: {
      timestamp?: string;
      headers?: Record<string, string>;
      fetchOptions?: RequestInit;
    }
  ): Promise<Response> {
    const signedRequest = await this.createSignedRequest(
      method,
      path,
      body,
      options
    );

    // Convert headers to HeadersInit format by filtering out undefined values
    const cleanHeaders: Record<string, string> = {};
    Object.entries(signedRequest.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanHeaders[key] = value;
      }
    });

    const fetchOptions: RequestInit = {
      method: signedRequest.method,
      headers: cleanHeaders,
      body: signedRequest.body,
      ...options?.fetchOptions,
    };

    return fetch(signedRequest.url, fetchOptions);
  }

  /**
   * GET 请求
   */
  async get(
    path: string,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    return this.sendSignedRequest("GET", path, undefined, options);
  }

  /**
   * POST 请求
   */
  async post(
    path: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    return this.sendSignedRequest("POST", path, body, options);
  }

  /**
   * PUT 请求
   */
  async put(
    path: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    return this.sendSignedRequest("PUT", path, body, options);
  }

  /**
   * DELETE 请求
   */
  async delete(
    path: string,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    return this.sendSignedRequest("DELETE", path, undefined, options);
  }

  /**
   * PATCH 请求
   */
  async patch(
    path: string,
    body?: any,
    options?: { headers?: Record<string, string> }
  ): Promise<Response> {
    return this.sendSignedRequest("PATCH", path, body, options);
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<ClientConfig> {
    return { ...this.config };
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.appId) {
      throw new Error("App ID is required");
    }

    if (!this.config.privateKey) {
      throw new Error("Private key is required");
    }

    if (!SignatureUtils.isSupportedAlgorithm(this.config.algorithm)) {
      throw new Error(`Unsupported algorithm: ${this.config.algorithm}`);
    }

    // 验证私钥格式
    if (
      !this.config.privateKey.includes("BEGIN") ||
      !this.config.privateKey.includes("END")
    ) {
      throw new Error("Private key must be in PEM format");
    }
  }
}

/**
 * 创建签名客户端的工厂函数
 */
export function createSignatureClient(config: ClientConfig): SignatureClient {
  return new SignatureClient(config);
}

/**
 * 简化的签名生成函数
 */
export async function generateSignature(
  appId: string,
  privateKey: string,
  algorithm: SupportedAlgorithm,
  method: string,
  path: string,
  body?: string,
  timestamp?: string
): Promise<SignedRequestHeaders> {
  const client = new SignatureClient({
    appId,
    privateKey,
    algorithm,
  });

  return client.generateSignatureHeaders(method, path, body, timestamp);
}

/**
 * 批量请求签名生成
 */
export async function generateBatchSignatures(
  config: ClientConfig,
  requests: Array<{
    method: string;
    path: string;
    body?: string;
    timestamp?: string;
  }>
): Promise<SignedRequestHeaders[]> {
  const client = new SignatureClient(config);

  return Promise.all(
    requests.map((req) =>
      client.generateSignatureHeaders(
        req.method,
        req.path,
        req.body,
        req.timestamp
      )
    )
  );
}
