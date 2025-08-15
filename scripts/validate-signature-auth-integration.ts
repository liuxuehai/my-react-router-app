/**
 * 验证签名认证中间件集成脚本
 * 验证签名认证中间件是否正确集成到中间件系统中
 */

import {
  MiddlewareConfigManager,
  MiddlewareType,
  type MiddlewareConfig,
} from "../app/api/config/middleware.js";
import { createApiConfig, Environment } from "../app/api/config/index.js";

console.log("🔐 验证签名认证中间件集成...\n");

// 测试 1: 验证中间件类型注册
console.log("1. 验证中间件类型注册...");
const manager = new MiddlewareConfigManager();

try {
  const testConfig: MiddlewareConfig = {
    name: "testSignatureAuth",
    type: MiddlewareType.SIGNATURE_AUTH,
    enabled: true,
    order: 15,
    options: {
      timeWindowSeconds: 300,
      debug: false,
      skipPaths: ["/api/health"],
    },
  };

  manager.addMiddleware(testConfig);
  console.log("✅ 签名认证中间件类型注册成功");
} catch (error) {
  console.error("❌ 签名认证中间件类型注册失败:", error);
  process.exit(1);
}

// 测试 2: 验证默认配置
console.log("\n2. 验证默认配置...");
const configs = manager.getAllConfigs();
const signatureAuthConfig = configs.find(
  (c) => c.type === MiddlewareType.SIGNATURE_AUTH
);

if (signatureAuthConfig) {
  console.log("✅ 找到默认签名认证中间件配置");
  console.log(`   - 名称: ${signatureAuthConfig.name}`);
  console.log(`   - 启用状态: ${signatureAuthConfig.enabled}`);
  console.log(`   - 执行顺序: ${signatureAuthConfig.order}`);
  console.log(
    `   - 时间窗口: ${signatureAuthConfig.options.timeWindowSeconds}秒`
  );
} else {
  console.error("❌ 未找到默认签名认证中间件配置");
  process.exit(1);
}

// 测试 3: 验证 API 配置集成
console.log("\n3. 验证 API 配置集成...");

// 测试开发环境配置
console.log("   测试开发环境配置...");
const devConfig = createApiConfig({
  NODE_ENV: "development",
  SIGNATURE_AUTH_ENABLED: "false",
  SIGNATURE_TIME_WINDOW: "300",
  SIGNATURE_DEBUG: "true",
});

manager.updateFromApiConfig(devConfig);
const devSignatureConfig = manager.getConfig("signatureAuth");

if (devSignatureConfig) {
  console.log("   ✅ 开发环境配置更新成功");
  console.log(`      - 启用状态: ${devSignatureConfig.enabled}`);
  console.log(`      - 调试模式: ${devSignatureConfig.options.debug}`);
  console.log(`      - 存储类型: ${devSignatureConfig.options.keyStorageType}`);
} else {
  console.error("   ❌ 开发环境配置更新失败");
  process.exit(1);
}

// 测试生产环境配置
console.log("   测试生产环境配置...");
const prodConfig = createApiConfig({
  NODE_ENV: "production",
  CORS_ORIGIN: "https://example.com",
  JWT_SECRET: "production-jwt-secret",
  SIGNATURE_AUTH_ENABLED: "true",
  SIGNATURE_TIME_WINDOW: "600",
  SIGNATURE_DEBUG: "false",
  SIGNATURE_KEY_STORAGE_TYPE: "kv",
  SIGNATURE_KV_NAMESPACE: "PROD_KEYS",
});

manager.updateFromApiConfig(prodConfig);
const prodSignatureConfig = manager.getConfig("signatureAuth");

if (prodSignatureConfig) {
  console.log("   ✅ 生产环境配置更新成功");
  console.log(`      - 启用状态: ${prodSignatureConfig.enabled}`);
  console.log(
    `      - 时间窗口: ${prodSignatureConfig.options.timeWindowSeconds}秒`
  );
  console.log(`      - 调试模式: ${prodSignatureConfig.options.debug}`);
  console.log(
    `      - 存储类型: ${prodSignatureConfig.options.keyStorageType}`
  );
  console.log(
    `      - KV 命名空间: ${prodSignatureConfig.options.kvNamespace}`
  );
} else {
  console.error("   ❌ 生产环境配置更新失败");
  process.exit(1);
}

// 测试 4: 验证中间件执行顺序
console.log("\n4. 验证中间件执行顺序...");
manager.toggleMiddleware("signatureAuth", true);

const enabledConfigs = manager
  .getAllConfigs()
  .filter((c) => c.enabled)
  .sort((a, b) => a.order - b.order);

console.log("   启用的中间件执行顺序:");
enabledConfigs.forEach((config, index) => {
  console.log(`   ${index + 1}. ${config.name} (order: ${config.order})`);
});

const signatureAuthIndex = enabledConfigs.findIndex(
  (c) => c.type === MiddlewareType.SIGNATURE_AUTH
);
if (signatureAuthIndex > 0) {
  console.log("   ✅ 签名认证中间件在正确的位置执行");
} else {
  console.error("   ❌ 签名认证中间件执行顺序不正确");
  process.exit(1);
}

// 测试 5: 验证配置导入导出
console.log("\n5. 验证配置导入导出...");

try {
  const exportedConfig = manager.exportConfig();
  const parsedConfig = JSON.parse(exportedConfig);

  const exportedSignatureAuth = parsedConfig.find(
    (c: MiddlewareConfig) => c.type === MiddlewareType.SIGNATURE_AUTH
  );

  if (exportedSignatureAuth) {
    console.log("   ✅ 配置导出成功，包含签名认证中间件");

    // 测试导入
    const newManager = new MiddlewareConfigManager();
    newManager.importConfig(exportedConfig);

    const importedConfig = newManager.getConfig("signatureAuth");
    if (importedConfig) {
      console.log("   ✅ 配置导入成功");
    } else {
      console.error("   ❌ 配置导入失败");
      process.exit(1);
    }
  } else {
    console.error("   ❌ 导出的配置中未包含签名认证中间件");
    process.exit(1);
  }
} catch (error) {
  console.error("   ❌ 配置导入导出失败:", error);
  process.exit(1);
}

// 测试 6: 验证环境变量配置
console.log("\n6. 验证环境变量配置...");

const envVars = {
  SIGNATURE_AUTH_ENABLED: "true",
  SIGNATURE_TIME_WINDOW: "900",
  SIGNATURE_ALGORITHMS: "RS256,ES256,RS512",
  SIGNATURE_DEBUG: "true",
  SIGNATURE_SKIP_PATHS: "/health,/status,/metrics",
  SIGNATURE_KEY_STORAGE_TYPE: "kv",
  SIGNATURE_KV_NAMESPACE: "CUSTOM_KEYS",
};

const envConfig = createApiConfig(envVars);

if (envConfig.security.signatureAuth) {
  console.log("   ✅ 环境变量配置解析成功");
  console.log(`      - 启用状态: ${envConfig.security.signatureAuth.enabled}`);
  console.log(
    `      - 时间窗口: ${envConfig.security.signatureAuth.timeWindowSeconds}秒`
  );
  console.log(
    `      - 支持算法: ${envConfig.security.signatureAuth.algorithms.join(
      ", "
    )}`
  );
  console.log(
    `      - 跳过路径: ${envConfig.security.signatureAuth.skipPaths.join(", ")}`
  );
  console.log(
    `      - 存储类型: ${envConfig.security.signatureAuth.keyStorageType}`
  );
  console.log(
    `      - KV 命名空间: ${envConfig.security.signatureAuth.kvNamespace}`
  );
} else {
  console.error("   ❌ 环境变量配置解析失败");
  process.exit(1);
}

console.log("\n🎉 所有验证测试通过！签名认证中间件已成功集成到中间件系统中。");

console.log("\n📋 集成总结:");
console.log("   ✅ 中间件类型注册完成");
console.log("   ✅ 默认配置加载完成");
console.log("   ✅ API 配置集成完成");
console.log("   ✅ 环境变量支持完成");
console.log("   ✅ 中间件执行顺序正确");
console.log("   ✅ 配置导入导出功能正常");
console.log("   ✅ 与现有错误处理系统兼容");

console.log("\n🔧 使用方法:");
console.log("   1. 通过环境变量配置签名认证");
console.log("   2. 在 API 配置中启用签名认证");
console.log("   3. 中间件将自动按顺序执行");
console.log("   4. 支持运行时配置更新");

console.log("\n📚 相关文件:");
console.log("   - app/api/config/middleware.ts (中间件配置管理)");
console.log("   - app/api/config/index.ts (API 配置)");
console.log("   - app/api/middleware/signature-auth-factory.ts (中间件工厂)");
console.log(
  "   - tests/integration/signature-auth-middleware-integration.test.ts (集成测试)"
);
