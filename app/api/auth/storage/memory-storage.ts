import { KeyStorageProvider, AppConfig, KeyManagerError } from '../types.js';

/**
 * 基于内存的密钥存储提供者
 * 主要用于测试和开发环境
 */
export class MemoryStorageProvider implements KeyStorageProvider {
  private apps: Map<string, AppConfig> = new Map();

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    return this.apps.get(appId) || null;
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    // 验证配置
    this.validateAppConfig(config);
    
    // 深拷贝以避免外部修改
    const configCopy = JSON.parse(JSON.stringify(config));
    configCopy.createdAt = new Date(config.createdAt);
    configCopy.keyPairs = config.keyPairs.map(kp => ({
      ...kp,
      createdAt: new Date(kp.createdAt),
      expiresAt: kp.expiresAt ? new Date(kp.expiresAt) : undefined
    }));
    
    this.apps.set(config.appId, configCopy);
  }

  async deleteAppConfig(appId: string): Promise<void> {
    if (!this.apps.has(appId)) {
      throw new KeyManagerError(
        `App ${appId} not found`,
        'APP_NOT_FOUND',
        { appId }
      );
    }
    
    this.apps.delete(appId);
  }

  async listAppIds(): Promise<string[]> {
    return Array.from(this.apps.keys());
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  clear(): void {
    this.apps.clear();
  }

  /**
   * 获取存储的应用数量（仅用于测试）
   */
  size(): number {
    return this.apps.size;
  }

  private validateAppConfig(config: AppConfig): void {
    if (!config.appId || typeof config.appId !== 'string') {
      throw new KeyManagerError(
        'Invalid app ID',
        'VALIDATION_ERROR',
        { appId: config.appId }
      );
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new KeyManagerError(
        'Invalid app name',
        'VALIDATION_ERROR',
        { appId: config.appId, name: config.name }
      );
    }

    if (!Array.isArray(config.keyPairs) || config.keyPairs.length === 0) {
      throw new KeyManagerError(
        'App must have at least one key pair',
        'VALIDATION_ERROR',
        { appId: config.appId }
      );
    }

    for (const keyPair of config.keyPairs) {
      this.validateKeyPair(keyPair, config.appId);
    }
  }

  private validateKeyPair(keyPair: any, appId: string): void {
    if (!keyPair.keyId || typeof keyPair.keyId !== 'string') {
      throw new KeyManagerError(
        'Invalid key ID',
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId }
      );
    }

    if (!keyPair.publicKey || typeof keyPair.publicKey !== 'string') {
      throw new KeyManagerError(
        'Invalid public key',
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId }
      );
    }

    if (!['RS256', 'RS512', 'ES256', 'ES512'].includes(keyPair.algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${keyPair.algorithm}`,
        'VALIDATION_ERROR',
        { appId, keyId: keyPair.keyId, algorithm: keyPair.algorithm }
      );
    }

    // 验证公钥格式
    if (!this.validatePublicKeyFormat(keyPair.publicKey)) {
      throw new KeyManagerError(
        'Invalid public key format',
        'INVALID_KEY_FORMAT',
        { appId, keyId: keyPair.keyId }
      );
    }
  }

  private validatePublicKeyFormat(publicKey: string): boolean {
    const pemRegex = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    return pemRegex.test(publicKey.trim());
  }
}