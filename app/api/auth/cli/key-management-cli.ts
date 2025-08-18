#!/usr/bin/env node

/**
 * 密钥管理命令行工具
 * 提供密钥生成、轮换、状态管理等功能的命令行接口
 */

import { KeyGenerator, type KeyGenerationOptions } from "../key-generator.js";
import { KeyRotationManager, type KeyRotationConfig } from "../key-rotation.js";
import { KeyDistributionManager, type KeyDistributionConfig } from "../key-distribution.js";
import { createKeyManager } from "../key-manager.js";
import { type KeyManagerConfig } from "../types.js";

interface CLIConfig {
  keyManager: KeyManagerConfig;
  keyRotation: KeyRotationConfig;
  keyDistribution: KeyDistributionConfig;
}

/**
 * 密钥管理 CLI 类
 */
export class KeyManagementCLI {
  private keyManager: ReturnType<typeof createKeyManager>;
  private rotationManager: KeyRotationManager;
  private distributionManager: KeyDistributionManager;

  constructor(config: Partial<CLIConfig> = {}) {
    // 初始化密钥管理器
    this.keyManager = createKeyManager(config.keyManager);

    // 初始化轮换管理器
    this.rotationManager = new KeyRotationManager(this.keyManager, config.keyRotation);

    // 初始化分发管理器
    this.distributionManager = new KeyDistributionManager(
      config.keyDistribution || {
        accessControl: {},
      }
    );
  }

  /**
   * 生成新的密钥对
   */
  async generateKey(options: {
    algorithm: "RS256" | "RS512" | "ES256" | "ES512";
    keyId?: string;
    expiryDays?: number;
    rsaKeySize?: 2048 | 3072 | 4096;
    ecdsaCurve?: "P-256" | "P-384" | "P-521";
    output?: "json" | "pem" | "both";
  }): Promise<void> {
    try {
      console.log(`🔑 Generating ${options.algorithm} key pair...`);

      const keyGenerationOptions: KeyGenerationOptions = {
        keyId: options.keyId,
        expiryDays: options.expiryDays,
        rsaKeySize: options.rsaKeySize,
        ecdsaCurve: options.ecdsaCurve,
      };

      const keyPair = await KeyGenerator.generateKeyPair(options.algorithm, keyGenerationOptions);

      // 验证密钥对
      const isValid = await KeyGenerator.validateKeyPair(keyPair);
      if (!isValid) {
        throw new Error("Generated key pair validation failed");
      }

      // 获取密钥信息
      const keyInfo = await KeyGenerator.getKeyInfo(keyPair);

      console.log(`✅ Key pair generated successfully!`);
      console.log(`   Key ID: ${keyPair.keyId}`);
      console.log(`   Algorithm: ${keyPair.algorithm}`);
      console.log(`   Fingerprint: ${keyInfo.fingerprint}`);
      console.log(`   Created: ${keyPair.createdAt.toISOString()}`);
      
      if (keyPair.expiresAt) {
        console.log(`   Expires: ${keyPair.expiresAt.toISOString()}`);
      }

      if (keyInfo.keySize) {
        console.log(`   Key Size: ${keyInfo.keySize} bits`);
      }

      if (keyInfo.curve) {
        console.log(`   Curve: ${keyInfo.curve}`);
      }

      // 输出密钥
      await this.outputKey(keyPair, options.output || "json");

    } catch (error) {
      console.error(`❌ Failed to generate key pair:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 创建应用配置
   */
  async createApp(options: {
    appId: string;
    name: string;
    description?: string;
    algorithm: "RS256" | "RS512" | "ES256" | "ES512";
    keyOptions?: KeyGenerationOptions;
  }): Promise<void> {
    try {
      console.log(`🏗️  Creating application: ${options.appId}...`);

      // 生成初始密钥对
      const keyPair = await KeyGenerator.generateKeyPair(options.algorithm, options.keyOptions);

      // 创建应用配置
      const appConfig = {
        appId: options.appId,
        name: options.name,
        description: options.description,
        keyPairs: [{
          keyId: keyPair.keyId,
          publicKey: keyPair.publicKey,
          algorithm: keyPair.algorithm,
          createdAt: keyPair.createdAt,
          expiresAt: keyPair.expiresAt,
          enabled: keyPair.enabled,
        }],
        enabled: true,
        permissions: [],
        createdAt: new Date(),
      };

      await this.keyManager.addApp(appConfig);

      console.log(`✅ Application created successfully!`);
      console.log(`   App ID: ${options.appId}`);
      console.log(`   Name: ${options.name}`);
      console.log(`   Initial Key ID: ${keyPair.keyId}`);
      console.log(`   Algorithm: ${keyPair.algorithm}`);

      // 输出私钥供客户端使用
      console.log(`\n🔐 Private Key (keep secure):`);
      console.log(keyPair.privateKey);

    } catch (error) {
      console.error(`❌ Failed to create application:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 列出所有应用
   */
  async listApps(): Promise<void> {
    try {
      console.log(`📋 Listing applications...`);

      const appIds = await this.keyManager.listApps();

      if (appIds.length === 0) {
        console.log(`   No applications found.`);
        return;
      }

      const appConfigs = await this.keyManager.getMultipleAppConfigs(appIds);

      console.log(`\n📱 Applications (${appIds.length}):`);
      console.log(`${"App ID".padEnd(20)} ${"Name".padEnd(25)} ${"Keys".padEnd(8)} ${"Status".padEnd(10)} ${"Created"}`);
      console.log(`${"─".repeat(20)} ${"─".repeat(25)} ${"─".repeat(8)} ${"─".repeat(10)} ${"─".repeat(20)}`);

      for (const [appId, config] of appConfigs.entries()) {
        const status = config.enabled ? "✅ Enabled" : "❌ Disabled";
        const keyCount = config.keyPairs.length;
        const created = config.createdAt.toISOString().split('T')[0];

        console.log(`${appId.padEnd(20)} ${config.name.padEnd(25)} ${keyCount.toString().padEnd(8)} ${status.padEnd(10)} ${created}`);
      }

    } catch (error) {
      console.error(`❌ Failed to list applications:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 显示应用详情
   */
  async showApp(appId: string): Promise<void> {
    try {
      console.log(`🔍 Application details: ${appId}`);

      const appConfig = await this.keyManager.getAppConfig(appId);
      if (!appConfig) {
        console.log(`❌ Application not found: ${appId}`);
        return;
      }

      console.log(`\n📱 Application Information:`);
      console.log(`   App ID: ${appConfig.appId}`);
      console.log(`   Name: ${appConfig.name}`);
      console.log(`   Description: ${appConfig.description || "N/A"}`);
      console.log(`   Status: ${appConfig.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      console.log(`   Created: ${appConfig.createdAt.toISOString()}`);
      console.log(`   Updated: ${appConfig.updatedAt?.toISOString() || "N/A"}`);

      if (appConfig.permissions.length > 0) {
        console.log(`   Permissions: ${appConfig.permissions.join(", ")}`);
      }

      if (appConfig.tags && appConfig.tags.length > 0) {
        console.log(`   Tags: ${appConfig.tags.join(", ")}`);
      }

      // 显示密钥信息
      console.log(`\n🔑 Keys (${appConfig.keyPairs.length}):`);
      console.log(`${"Key ID".padEnd(25)} ${"Algorithm".padEnd(10)} ${"Status".padEnd(12)} ${"Created".padEnd(12)} ${"Expires"}`);
      console.log(`${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(12)} ${"─".repeat(12)} ${"─".repeat(12)}`);

      for (const keyPair of appConfig.keyPairs) {
        const status = keyPair.enabled ? "✅ Enabled" : "❌ Disabled";
        const created = keyPair.createdAt.toISOString().split('T')[0];
        const expires = keyPair.expiresAt ? keyPair.expiresAt.toISOString().split('T')[0] : "Never";

        console.log(`${keyPair.keyId.padEnd(25)} ${keyPair.algorithm.padEnd(10)} ${status.padEnd(12)} ${created.padEnd(12)} ${expires}`);
      }

      // 显示访问控制信息
      if (appConfig.accessControl) {
        console.log(`\n🛡️  Access Control:`);
        const ac = appConfig.accessControl;

        if (ac.allowedPaths && ac.allowedPaths.length > 0) {
          console.log(`   Allowed Paths: ${ac.allowedPaths.join(", ")}`);
        }

        if (ac.deniedPaths && ac.deniedPaths.length > 0) {
          console.log(`   Denied Paths: ${ac.deniedPaths.join(", ")}`);
        }

        if (ac.allowedIPs && ac.allowedIPs.length > 0) {
          console.log(`   Allowed IPs: ${ac.allowedIPs.join(", ")}`);
        }

        if (ac.rateLimit) {
          console.log(`   Rate Limit: ${ac.rateLimit.requestsPerMinute} req/min`);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to show application:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 轮换密钥
   */
  async rotateKey(options: {
    appId: string;
    keyId?: string;
    algorithm?: "RS256" | "RS512" | "ES256" | "ES512";
    strategy?: "immediate" | "gradual" | "scheduled";
    expiryDays?: number;
  }): Promise<void> {
    try {
      console.log(`🔄 Rotating key for application: ${options.appId}...`);

      // 创建轮换计划
      const newKeyConfig = {
        algorithm: options.algorithm || "RS256",
        options: {
          expiryDays: options.expiryDays,
        },
      };

      await this.rotationManager.createRotationPlan(
        options.appId,
        newKeyConfig,
        new Date(),
        options.strategy || "gradual"
      );

      // 执行轮换
      const result = await this.rotationManager.executeRotation(options.appId, options.keyId);

      console.log(`✅ Key rotation completed successfully!`);
      console.log(`   App ID: ${options.appId}`);
      console.log(`   Old Key ID: ${result.oldKeyId}`);
      console.log(`   New Key ID: ${result.newKeyId}`);
      console.log(`   Rotation Time: ${result.rotationTime.toISOString()}`);
      console.log(`   Strategy: ${options.strategy || "gradual"}`);

    } catch (error) {
      console.error(`❌ Failed to rotate key:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 检查密钥状态
   */
  async checkKeyHealth(appId?: string): Promise<void> {
    try {
      console.log(`🏥 Checking key health...`);

      const result = await this.rotationManager.performMaintenance();

      // 显示清理结果
      if (result.cleanupResult.cleaned.length > 0) {
        console.log(`\n🧹 Cleaned up expired keys:`);
        for (const cleaned of result.cleanupResult.cleaned) {
          console.log(`   ✅ ${cleaned.appId}:${cleaned.keyId}`);
        }
      }

      if (result.cleanupResult.errors.length > 0) {
        console.log(`\n❌ Cleanup errors:`);
        for (const error of result.cleanupResult.errors) {
          console.log(`   ❌ ${error.appId}:${error.keyId} - ${error.error}`);
        }
      }

      // 显示健康检查结果
      if (result.healthChecks.length > 0) {
        console.log(`\n⚠️  Health warnings:`);
        console.log(`${"App ID".padEnd(20)} ${"Key ID".padEnd(25)} ${"Health".padEnd(10)} ${"Message"}`);
        console.log(`${"─".repeat(20)} ${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(30)}`);

        for (const check of result.healthChecks) {
          const healthIcon = check.health === "critical" ? "🔴" : "🟡";
          console.log(`${check.appId.padEnd(20)} ${check.keyId.padEnd(25)} ${(healthIcon + " " + check.health).padEnd(10)} ${check.message || ""}`);
        }
      } else {
        console.log(`\n✅ All keys are healthy!`);
      }

    } catch (error) {
      console.error(`❌ Failed to check key health:`, error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  /**
   * 输出密钥
   */
  private async outputKey(keyPair: any, format: "json" | "pem" | "both"): Promise<void> {
    switch (format) {
      case "json":
        console.log(`\n📄 Key Pair (JSON):`);
        console.log(JSON.stringify({
          keyId: keyPair.keyId,
          algorithm: keyPair.algorithm,
          publicKey: keyPair.publicKey,
          privateKey: keyPair.privateKey,
          createdAt: keyPair.createdAt,
          expiresAt: keyPair.expiresAt,
          enabled: keyPair.enabled,
        }, null, 2));
        break;

      case "pem":
        console.log(`\n🔑 Public Key:`);
        console.log(keyPair.publicKey);
        console.log(`\n🔐 Private Key:`);
        console.log(keyPair.privateKey);
        break;

      case "both":
        await this.outputKey(keyPair, "json");
        await this.outputKey(keyPair, "pem");
        break;
    }
  }
}

/**
 * CLI 入口函数
 */
export async function runCLI(args: string[]): Promise<void> {
  const cli = new KeyManagementCLI();

  const command = args[0];
  const options = parseArgs(args.slice(1));

  try {
    switch (command) {
      case "generate":
        await cli.generateKey({
          algorithm: options.algorithm || "RS256",
          keyId: options.keyId,
          expiryDays: options.expiryDays ? parseInt(options.expiryDays) : undefined,
          rsaKeySize: options.rsaKeySize ? parseInt(options.rsaKeySize) as any : undefined,
          ecdsaCurve: options.ecdsaCurve,
          output: options.output,
        });
        break;

      case "create-app":
        await cli.createApp({
          appId: options.appId || "",
          name: options.name || "",
          description: options.description,
          algorithm: options.algorithm || "RS256",
        });
        break;

      case "list":
        await cli.listApps();
        break;

      case "show":
        await cli.showApp(options.appId || "");
        break;

      case "rotate":
        await cli.rotateKey({
          appId: options.appId || "",
          keyId: options.keyId,
          algorithm: options.algorithm,
          strategy: options.strategy,
          expiryDays: options.expiryDays ? parseInt(options.expiryDays) : undefined,
        });
        break;

      case "health":
        await cli.checkKeyHealth(options.appId);
        break;

      case "help":
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error(`❌ Command failed:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): Record<string, string> {
  const options: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];

    if (key && value) {
      options[key] = value;
    }
  }

  return options;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
🔑 Key Management CLI

Usage: key-cli <command> [options]

Commands:
  generate              Generate a new key pair
  create-app            Create a new application with initial key
  list                  List all applications
  show                  Show application details
  rotate                Rotate application key
  health                Check key health status
  help                  Show this help message

Generate Options:
  --algorithm <alg>     Algorithm (RS256, RS512, ES256, ES512)
  --keyId <id>          Custom key ID
  --expiryDays <days>   Key expiry in days
  --rsaKeySize <size>   RSA key size (2048, 3072, 4096)
  --ecdsaCurve <curve>  ECDSA curve (P-256, P-384, P-521)
  --output <format>     Output format (json, pem, both)

Create App Options:
  --appId <id>          Application ID
  --name <name>         Application name
  --description <desc>  Application description
  --algorithm <alg>     Initial key algorithm

Show/Rotate Options:
  --appId <id>          Application ID
  --keyId <id>          Key ID (optional for rotate)
  --strategy <strategy> Rotation strategy (immediate, gradual, scheduled)

Examples:
  key-cli generate --algorithm RS256 --expiryDays 365
  key-cli create-app --appId myapp --name "My App" --algorithm ES256
  key-cli list
  key-cli show --appId myapp
  key-cli rotate --appId myapp --strategy gradual
  key-cli health
`);
}

// 如果直接运行此文件，执行 CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI(process.argv.slice(2));
}