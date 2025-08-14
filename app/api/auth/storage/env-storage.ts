import { type KeyStorageProvider, type AppConfig, type KeyPair, KeyManagerError } from '../types.js';

/**
 * 基于环境变量的密钥存储提供者
 * 
 * 环境变量格式:
 * APP_{APP_ID}_PUBLIC_KEY - 公钥内容
 * APP_{APP_ID}_ALGORITHM - 签名算法
 * APP_{APP_ID}_ENABLED - 是否启用
 * APP_{APP_ID}_NAME - 应用名称
 * APP_{APP_ID}_PERMISSIONS - 权限列表（逗号分隔）
 */
export class EnvStorageProvider implements KeyStorageProvider {
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  async getAppConfig(appId: string): Promise<AppConfig | null> {
    const prefix = `APP_${appId.toUpperCase()}_`;
    
    const publicKey = this.env[`${prefix}PUBLIC_KEY`];
    if (!publicKey) {
      return null;
    }

    const algorithm = this.env[`${prefix}ALGORITHM`] as KeyPair['algorithm'] || 'RS256';
    const enabled = this.env[`${prefix}ENABLED`] !== 'false';
    const name = this.env[`${prefix}NAME`] || appId;
    const permissions = this.env[`${prefix}PERMISSIONS`]?.split(',').map(p => p.trim()) || [];

    // 验证公钥格式
    if (!this.validatePublicKeyFormat(publicKey)) {
      throw new KeyManagerError(
        `Invalid public key format for app ${appId}`,
        'INVALID_KEY_FORMAT',
        { appId, keyFormat: 'PEM' }
      );
    }

    // 验证算法
    if (!['RS256', 'RS512', 'ES256', 'ES512'].includes(algorithm)) {
      throw new KeyManagerError(
        `Unsupported algorithm ${algorithm} for app ${appId}`,
        'VALIDATION_ERROR',
        { appId, algorithm, supportedAlgorithms: ['RS256', 'RS512', 'ES256', 'ES512'] }
      );
    }

    const keyPair: KeyPair = {
      keyId: 'default',
      publicKey,
      algorithm,
      createdAt: new Date(),
      enabled: true
    };

    return {
      appId,
      name,
      keyPairs: [keyPair],
      enabled,
      permissions,
      createdAt: new Date()
    };
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    throw new KeyManagerError(
      'Environment storage provider is read-only',
      'STORAGE_ERROR',
      { operation: 'save', appId: config.appId }
    );
  }

  async deleteAppConfig(appId: string): Promise<void> {
    throw new KeyManagerError(
      'Environment storage provider is read-only',
      'STORAGE_ERROR',
      { operation: 'delete', appId }
    );
  }

  async listAppIds(): Promise<string[]> {
    const appIds = new Set<string>();
    
    for (const key of Object.keys(this.env)) {
      if (key.startsWith('APP_') && key.endsWith('_PUBLIC_KEY')) {
        const appId = key.slice(4, -11).toLowerCase(); // Remove APP_ prefix and _PUBLIC_KEY suffix
        appIds.add(appId);
      }
    }
    
    return Array.from(appIds);
  }

  private validatePublicKeyFormat(publicKey: string): boolean {
    // 基本的 PEM 格式验证
    const pemRegex = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
    return pemRegex.test(publicKey.trim());
  }
}