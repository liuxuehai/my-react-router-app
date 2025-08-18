/**
 * 密钥轮换和管理工具
 * 提供密钥的轮换、更新、状态管理等功能
 */

import { type KeyManager, type KeyPair, type AppConfig, KeyManagerError } from "./types.js";
import { KeyGenerator, type KeyGenerationOptions, type GeneratedKeyPair } from "./key-generator.js";

export interface KeyRotationConfig {
  /** 密钥轮换策略 */
  strategy: "immediate" | "gradual" | "scheduled";
  /** 旧密钥保留时间（天数） */
  gracePeriodDays: number;
  /** 是否自动禁用过期密钥 */
  autoDisableExpired: boolean;
  /** 通知回调 */
  onRotationComplete?: (appId: string, oldKeyId: string, newKeyId: string) => Promise<void>;
  /** 错误回调 */
  onRotationError?: (appId: string, error: Error) => Promise<void>;
}

export interface KeyRotationPlan {
  /** 应用 ID */
  appId: string;
  /** 当前密钥 ID */
  currentKeyId: string;
  /** 新密钥配置 */
  newKeyConfig: {
    algorithm: "RS256" | "RS512" | "ES256" | "ES512";
    options?: KeyGenerationOptions;
  };
  /** 轮换时间 */
  rotationTime: Date;
  /** 轮换策略 */
  strategy: "immediate" | "gradual" | "scheduled";
}

export interface KeyStatus {
  /** 密钥 ID */
  keyId: string;
  /** 应用 ID */
  appId: string;
  /** 密钥状态 */
  status: "active" | "expired" | "disabled" | "pending_rotation" | "deprecated";
  /** 创建时间 */
  createdAt: Date;
  /** 过期时间 */
  expiresAt?: Date;
  /** 最后使用时间 */
  lastUsedAt?: Date;
  /** 使用次数 */
  usageCount?: number;
  /** 健康状态 */
  health: "healthy" | "warning" | "critical";
  /** 健康检查消息 */
  healthMessage?: string;
}

/**
 * 密钥轮换管理器
 */
export class KeyRotationManager {
  private keyManager: KeyManager;
  private config: KeyRotationConfig;
  private rotationPlans: Map<string, KeyRotationPlan> = new Map();

  constructor(keyManager: KeyManager, config: Partial<KeyRotationConfig> = {}) {
    this.keyManager = keyManager;
    this.config = {
      strategy: "gradual",
      gracePeriodDays: 30,
      autoDisableExpired: true,
      ...config,
    };
  }

  /**
   * 为应用创建密钥轮换计划
   */
  async createRotationPlan(
    appId: string,
    newKeyConfig: KeyRotationPlan["newKeyConfig"],
    rotationTime: Date = new Date(),
    strategy: KeyRotationPlan["strategy"] = this.config.strategy
  ): Promise<KeyRotationPlan> {
    // 验证应用存在
    const appConfig = await this.keyManager.getAppConfig(appId);
    if (!appConfig) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", { appId });
    }

    // 获取当前活跃的密钥
    const validKeys = await this.keyManager.getValidKeyPairs(appId);
    if (validKeys.length === 0) {
      throw new KeyManagerError(`No valid keys found for app ${appId}`, "KEY_NOT_FOUND", { appId });
    }

    const currentKey = validKeys[0]; // 使用第一个有效密钥作为当前密钥

    const plan: KeyRotationPlan = {
      appId,
      currentKeyId: currentKey.keyId,
      newKeyConfig,
      rotationTime,
      strategy,
    };

    this.rotationPlans.set(`${appId}:${currentKey.keyId}`, plan);

    return plan;
  }

  /**
   * 执行密钥轮换
   */
  async executeRotation(appId: string, currentKeyId?: string): Promise<{
    oldKeyId: string;
    newKeyId: string;
    rotationTime: Date;
  }> {
    try {
      const appConfig = await this.keyManager.getAppConfig(appId);
      if (!appConfig) {
        throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", { appId });
      }

      // 确定要轮换的密钥
      let targetKeyId = currentKeyId;
      if (!targetKeyId) {
        const validKeys = await this.keyManager.getValidKeyPairs(appId);
        if (validKeys.length === 0) {
          throw new KeyManagerError(`No valid keys found for app ${appId}`, "KEY_NOT_FOUND", { appId });
        }
        targetKeyId = validKeys[0].keyId;
      }

      // 获取轮换计划
      const planKey = `${appId}:${targetKeyId}`;
      const plan = this.rotationPlans.get(planKey);
      if (!plan) {
        throw new KeyManagerError(
          `No rotation plan found for app ${appId} key ${targetKeyId}`,
          "VALIDATION_ERROR",
          { appId, keyId: targetKeyId }
        );
      }

      // 生成新密钥
      const newKeyPair = await KeyGenerator.generateKeyPair(
        plan.newKeyConfig.algorithm,
        plan.newKeyConfig.options
      );

      // 验证新密钥
      const isValid = await KeyGenerator.validateKeyPair(newKeyPair);
      if (!isValid) {
        throw new KeyManagerError(
          "Generated key pair validation failed",
          "VALIDATION_ERROR",
          { appId, algorithm: plan.newKeyConfig.algorithm }
        );
      }

      // 执行轮换策略
      const rotationTime = new Date();
      await this.executeRotationStrategy(appId, targetKeyId, newKeyPair, plan.strategy);

      // 清理轮换计划
      this.rotationPlans.delete(planKey);

      // 调用完成回调
      if (this.config.onRotationComplete) {
        await this.config.onRotationComplete(appId, targetKeyId, newKeyPair.keyId);
      }

      return {
        oldKeyId: targetKeyId,
        newKeyId: newKeyPair.keyId,
        rotationTime,
      };
    } catch (error) {
      // 调用错误回调
      if (this.config.onRotationError) {
        await this.config.onRotationError(appId, error as Error);
      }
      throw error;
    }
  }

  /**
   * 批量轮换密钥
   */
  async batchRotateKeys(rotations: Array<{
    appId: string;
    keyId?: string;
    newKeyConfig: KeyRotationPlan["newKeyConfig"];
    strategy?: KeyRotationPlan["strategy"];
  }>): Promise<Array<{
    appId: string;
    oldKeyId: string;
    newKeyId: string;
    success: boolean;
    error?: string;
  }>> {
    const results = await Promise.allSettled(
      rotations.map(async (rotation) => {
        // 创建轮换计划
        await this.createRotationPlan(
          rotation.appId,
          rotation.newKeyConfig,
          new Date(),
          rotation.strategy
        );

        // 执行轮换
        const result = await this.executeRotation(rotation.appId, rotation.keyId);
        return {
          appId: rotation.appId,
          oldKeyId: result.oldKeyId,
          newKeyId: result.newKeyId,
          success: true,
        };
      })
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          appId: rotations[index].appId,
          oldKeyId: "",
          newKeyId: "",
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
  }

  /**
   * 获取密钥状态
   */
  async getKeyStatus(appId: string, keyId: string): Promise<KeyStatus> {
    const appConfig = await this.keyManager.getAppConfig(appId);
    if (!appConfig) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", { appId });
    }

    const keyPair = appConfig.keyPairs.find(kp => kp.keyId === keyId);
    if (!keyPair) {
      throw new KeyManagerError(`Key ${keyId} not found for app ${appId}`, "KEY_NOT_FOUND", { appId, keyId });
    }

    const now = new Date();
    let status: KeyStatus["status"] = "active";
    let health: KeyStatus["health"] = "healthy";
    let healthMessage: string | undefined;

    // 确定密钥状态
    if (!keyPair.enabled) {
      status = "disabled";
      health = "critical";
      healthMessage = "Key is disabled";
    } else if (keyPair.expiresAt && keyPair.expiresAt < now) {
      status = "expired";
      health = "critical";
      healthMessage = "Key has expired";
    } else if (keyPair.expiresAt) {
      const daysUntilExpiry = Math.ceil((keyPair.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 7) {
        health = "critical";
        healthMessage = `Key expires in ${daysUntilExpiry} days`;
      } else if (daysUntilExpiry <= 30) {
        health = "warning";
        healthMessage = `Key expires in ${daysUntilExpiry} days`;
      }
    }

    // 检查是否有轮换计划
    const planKey = `${appId}:${keyId}`;
    if (this.rotationPlans.has(planKey)) {
      status = "pending_rotation";
      if (health === "healthy") {
        health = "warning";
        healthMessage = "Key rotation is scheduled";
      }
    }

    return {
      keyId,
      appId,
      status,
      createdAt: keyPair.createdAt,
      expiresAt: keyPair.expiresAt,
      health,
      healthMessage,
    };
  }

  /**
   * 获取应用的所有密钥状态
   */
  async getAppKeyStatuses(appId: string): Promise<KeyStatus[]> {
    const appConfig = await this.keyManager.getAppConfig(appId);
    if (!appConfig) {
      throw new KeyManagerError(`App ${appId} not found`, "APP_NOT_FOUND", { appId });
    }

    const statuses = await Promise.all(
      appConfig.keyPairs.map(keyPair => this.getKeyStatus(appId, keyPair.keyId))
    );

    return statuses;
  }

  /**
   * 清理过期密钥
   */
  async cleanupExpiredKeys(appId?: string): Promise<{
    cleaned: Array<{ appId: string; keyId: string }>;
    errors: Array<{ appId: string; keyId: string; error: string }>;
  }> {
    const cleaned: Array<{ appId: string; keyId: string }> = [];
    const errors: Array<{ appId: string; keyId: string; error: string }> = [];

    try {
      const appIds = appId ? [appId] : await this.keyManager.listApps();

      for (const currentAppId of appIds) {
        try {
          const statuses = await this.getAppKeyStatuses(currentAppId);
          const expiredKeys = statuses.filter(status => status.status === "expired");

          for (const expiredKey of expiredKeys) {
            try {
              // 检查是否是应用的最后一个密钥
              const appConfig = await this.keyManager.getAppConfig(currentAppId);
              if (appConfig && appConfig.keyPairs.length > 1) {
                await this.keyManager.removeKeyPair(currentAppId, expiredKey.keyId);
                cleaned.push({ appId: currentAppId, keyId: expiredKey.keyId });
              } else {
                // 如果是最后一个密钥，只禁用不删除
                await this.keyManager.setKeyPairEnabled(currentAppId, expiredKey.keyId, false);
                cleaned.push({ appId: currentAppId, keyId: expiredKey.keyId });
              }
            } catch (error) {
              errors.push({
                appId: currentAppId,
                keyId: expiredKey.keyId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        } catch (error) {
          errors.push({
            appId: currentAppId,
            keyId: "N/A",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      errors.push({
        appId: appId || "ALL",
        keyId: "N/A",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { cleaned, errors };
  }

  /**
   * 自动维护密钥（清理过期、检查健康状态等）
   */
  async performMaintenance(): Promise<{
    cleanupResult: {
      cleaned: Array<{ appId: string; keyId: string }>;
      errors: Array<{ appId: string; keyId: string; error: string }>;
    };
    healthChecks: Array<{
      appId: string;
      keyId: string;
      health: KeyStatus["health"];
      message?: string;
    }>;
  }> {
    // 清理过期密钥
    const cleanupResult = await this.cleanupExpiredKeys();

    // 执行健康检查
    const healthChecks: Array<{
      appId: string;
      keyId: string;
      health: KeyStatus["health"];
      message?: string;
    }> = [];

    try {
      const appIds = await this.keyManager.listApps();

      for (const appId of appIds) {
        try {
          const statuses = await this.getAppKeyStatuses(appId);
          for (const status of statuses) {
            if (status.health !== "healthy") {
              healthChecks.push({
                appId: status.appId,
                keyId: status.keyId,
                health: status.health,
                message: status.healthMessage,
              });
            }
          }
        } catch (error) {
          healthChecks.push({
            appId,
            keyId: "N/A",
            health: "critical",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      healthChecks.push({
        appId: "ALL",
        keyId: "N/A",
        health: "critical",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      cleanupResult,
      healthChecks,
    };
  }

  /**
   * 获取轮换计划列表
   */
  getRotationPlans(): KeyRotationPlan[] {
    return Array.from(this.rotationPlans.values());
  }

  /**
   * 取消轮换计划
   */
  cancelRotationPlan(appId: string, keyId: string): boolean {
    const planKey = `${appId}:${keyId}`;
    return this.rotationPlans.delete(planKey);
  }

  /**
   * 执行轮换策略
   */
  private async executeRotationStrategy(
    appId: string,
    oldKeyId: string,
    newKeyPair: GeneratedKeyPair,
    strategy: KeyRotationPlan["strategy"]
  ): Promise<void> {
    const publicKeyPair: KeyPair = {
      keyId: newKeyPair.keyId,
      publicKey: newKeyPair.publicKey,
      algorithm: newKeyPair.algorithm,
      createdAt: newKeyPair.createdAt,
      expiresAt: newKeyPair.expiresAt,
      enabled: newKeyPair.enabled,
    };

    switch (strategy) {
      case "immediate":
        // 立即替换：禁用旧密钥，添加新密钥
        await this.keyManager.setKeyPairEnabled(appId, oldKeyId, false);
        await this.keyManager.addKeyPair(appId, publicKeyPair);
        break;

      case "gradual":
        // 渐进式：先添加新密钥，保持旧密钥一段时间
        await this.keyManager.addKeyPair(appId, publicKeyPair);
        
        // 设置旧密钥的过期时间（如果没有的话）
        const gracePeriodMs = this.config.gracePeriodDays * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + gracePeriodMs);
        
        await this.keyManager.updateKeyPair(appId, oldKeyId, {
          expiresAt,
        });
        break;

      case "scheduled":
        // 计划式：添加新密钥但保持禁用状态，等待手动激活
        await this.keyManager.addKeyPair(appId, {
          ...publicKeyPair,
          enabled: false,
        });
        break;

      default:
        throw new KeyManagerError(
          `Unsupported rotation strategy: ${strategy}`,
          "VALIDATION_ERROR",
          { strategy }
        );
    }
  }
}

/**
 * 创建密钥轮换管理器的工厂函数
 */
export function createKeyRotationManager(
  keyManager: KeyManager,
  config?: Partial<KeyRotationConfig>
): KeyRotationManager {
  return new KeyRotationManager(keyManager, config);
}