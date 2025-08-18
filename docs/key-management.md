# 密钥管理工具文档

本文档介绍 API 签名认证系统中的密钥管理工具，包括密钥生成、轮换、分发和状态管理等功能。

## 概述

密钥管理工具提供了完整的密钥生命周期管理功能：

- **密钥生成**: 支持 RSA 和 ECDSA 算法的密钥对生成
- **密钥轮换**: 自动化的密钥轮换和更新机制
- **密钥分发**: 安全的密钥分发和访问控制
- **状态管理**: 密钥健康状态监控和过期管理
- **CLI 工具**: 命令行界面用于密钥管理操作

## 核心组件

### 1. 密钥生成器 (KeyGenerator)

负责生成各种算法的密钥对。

#### 支持的算法

- **RSA-SHA256 (RS256)**: 2048/3072/4096 位密钥
- **RSA-SHA512 (RS512)**: 2048/3072/4096 位密钥  
- **ECDSA-SHA256 (ES256)**: P-256/P-384/P-521 曲线
- **ECDSA-SHA512 (ES512)**: P-256/P-384/P-521 曲线

#### 基本用法

```typescript
import { KeyGenerator } from './app/api/auth/key-generator.js';

// 生成 RSA-SHA256 密钥对
const rsaKeyPair = await KeyGenerator.generateRSAKeyPair('RS256', {
  keyId: 'my-rsa-key',
  expiryDays: 365,
  rsaKeySize: 2048
});

// 生成 ECDSA-SHA256 密钥对
const ecdsaKeyPair = await KeyGenerator.generateECDSAKeyPair('ES256', {
  keyId: 'my-ecdsa-key',
  expiryDays: 180,
  ecdsaCurve: 'P-256'
});

// 通用密钥生成
const keyPair = await KeyGenerator.generateKeyPair('RS256', {
  keyId: 'generic-key',
  expiryDays: 90
});
```

#### 密钥验证

```typescript
// 验证生成的密钥对
const isValid = await KeyGenerator.validateKeyPair(keyPair);
console.log('Key pair is valid:', isValid);

// 获取密钥信息
const keyInfo = await KeyGenerator.getKeyInfo(keyPair);
console.log('Key fingerprint:', keyInfo.fingerprint);
console.log('Key size:', keyInfo.keySize);
```

#### 批量生成

```typescript
const configs = [
  { algorithm: 'RS256', options: { keyId: 'rsa-key-1' } },
  { algorithm: 'ES256', options: { keyId: 'ecdsa-key-1' } },
  { algorithm: 'RS512', options: { keyId: 'rsa-key-2', expiryDays: 30 } }
];

const keyPairs = await KeyGenerator.generateMultipleKeyPairs(configs);
```

### 2. 密钥轮换管理器 (KeyRotationManager)

提供自动化的密钥轮换和生命周期管理。

#### 轮换策略

- **immediate**: 立即替换旧密钥
- **gradual**: 渐进式轮换，保留旧密钥一段时间
- **scheduled**: 计划式轮换，新密钥先禁用等待激活

#### 基本用法

```typescript
import { KeyRotationManager } from './app/api/auth/key-rotation.js';
import { createKeyManager } from './app/api/auth/key-manager.js';

const keyManager = createKeyManager();
const rotationManager = new KeyRotationManager(keyManager, {
  strategy: 'gradual',
  gracePeriodDays: 30,
  autoDisableExpired: true
});

// 创建轮换计划
await rotationManager.createRotationPlan('my-app', {
  algorithm: 'ES256',
  options: { expiryDays: 365 }
}, new Date(), 'gradual');

// 执行轮换
const result = await rotationManager.executeRotation('my-app');
console.log('Rotated from', result.oldKeyId, 'to', result.newKeyId);
```

#### 批量轮换

```typescript
const rotations = [
  {
    appId: 'app-1',
    newKeyConfig: { algorithm: 'RS256' },
    strategy: 'gradual'
  },
  {
    appId: 'app-2', 
    newKeyConfig: { algorithm: 'ES256' },
    strategy: 'immediate'
  }
];

const results = await rotationManager.batchRotateKeys(rotations);
```

#### 密钥状态监控

```typescript
// 检查单个密钥状态
const keyStatus = await rotationManager.getKeyStatus('my-app', 'my-key');
console.log('Key status:', keyStatus.status);
console.log('Health:', keyStatus.health);

// 检查应用的所有密钥
const allStatuses = await rotationManager.getAppKeyStatuses('my-app');

// 执行维护操作
const maintenance = await rotationManager.performMaintenance();
console.log('Cleaned up', maintenance.cleanupResult.cleaned.length, 'expired keys');
```

### 3. 密钥分发管理器 (KeyDistributionManager)

提供安全的密钥分发和访问控制功能。

#### 基本配置

```typescript
import { KeyDistributionManager } from './app/api/auth/key-distribution.js';

const distributionManager = new KeyDistributionManager({
  encryptionKey: 'your-32-byte-encryption-key-here',
  accessControl: {
    allowedIPs: ['192.168.1.0/24', '10.0.0.0/8'],
    requireApiKey: true,
    rateLimit: {
      requestsPerMinute: 100,
      burstLimit: 10
    }
  },
  auditLog: {
    enabled: true,
    logLevel: 'info',
    includeClientInfo: true
  }
});
```

#### 密钥包创建

```typescript
// 创建公钥包（不含私钥）
const publicKeyPackage = await distributionManager.createKeyPackage(
  keyPair,
  'my-app',
  false, // 不包含私钥
  {
    clientId: 'client-123',
    clientIP: '192.168.1.100',
    userAgent: 'MyApp/1.0'
  }
);

// 创建完整密钥包（含加密私钥）
const fullKeyPackage = await distributionManager.createKeyPackage(
  keyPair,
  'my-app',
  true, // 包含加密私钥
  clientInfo
);
```

#### 密钥分发

```typescript
const distributionRequest = {
  appId: 'my-app',
  keyId: 'my-key',
  includePrivateKey: false,
  clientId: 'client-123',
  timestamp: new Date(),
  signature: 'request-signature'
};

const response = await distributionManager.distributeKeys(distributionRequest);

if (response.success) {
  console.log('Distributed', response.keyPackages?.length, 'keys');
} else {
  console.error('Distribution failed:', response.error?.message);
}
```

#### 私钥加密/解密

```typescript
// 解密私钥
const decryptedPrivateKey = await distributionManager.decryptPrivateKey(
  encryptedPrivateKey,
  encryptionKey
);

// 撤销密钥分发
const revocation = await distributionManager.revokeKeyDistribution(
  'my-app',
  'my-key',
  'client-123'
);
```

## CLI 工具

提供命令行界面用于密钥管理操作。

### 安装和使用

```bash
# 生成新密钥对
node app/api/auth/cli/key-management-cli.js generate \
  --algorithm RS256 \
  --keyId my-key \
  --expiryDays 365 \
  --output json

# 创建新应用
node app/api/auth/cli/key-management-cli.js create-app \
  --appId my-app \
  --name "My Application" \
  --description "Test application" \
  --algorithm ES256

# 列出所有应用
node app/api/auth/cli/key-management-cli.js list

# 显示应用详情
node app/api/auth/cli/key-management-cli.js show --appId my-app

# 轮换密钥
node app/api/auth/cli/key-management-cli.js rotate \
  --appId my-app \
  --algorithm ES256 \
  --strategy gradual \
  --expiryDays 180

# 检查密钥健康状态
node app/api/auth/cli/key-management-cli.js health
```

### CLI 命令详解

#### generate - 生成密钥对

```bash
key-cli generate [options]

Options:
  --algorithm <alg>     算法 (RS256, RS512, ES256, ES512)
  --keyId <id>          自定义密钥 ID
  --expiryDays <days>   密钥过期天数
  --rsaKeySize <size>   RSA 密钥大小 (2048, 3072, 4096)
  --ecdsaCurve <curve>  ECDSA 曲线 (P-256, P-384, P-521)
  --output <format>     输出格式 (json, pem, both)
```

#### create-app - 创建应用

```bash
key-cli create-app [options]

Options:
  --appId <id>          应用 ID
  --name <name>         应用名称
  --description <desc>  应用描述
  --algorithm <alg>     初始密钥算法
```

#### rotate - 轮换密钥

```bash
key-cli rotate [options]

Options:
  --appId <id>          应用 ID
  --keyId <id>          密钥 ID (轮换时可选)
  --algorithm <alg>     新密钥算法
  --strategy <strategy> 轮换策略 (immediate, gradual, scheduled)
  --expiryDays <days>   新密钥过期天数
```

## 最佳实践

### 1. 密钥生成

- **算法选择**: 推荐使用 ES256 (ECDSA-SHA256) 获得更好的性能
- **密钥大小**: RSA 密钥至少使用 2048 位，推荐 3072 位
- **过期时间**: 根据安全要求设置合理的过期时间，通常 90-365 天
- **密钥 ID**: 使用有意义的命名规则，便于管理

### 2. 密钥轮换

- **轮换策略**: 生产环境推荐使用 `gradual` 策略
- **轮换频率**: 根据安全策略定期轮换，建议每 90-180 天
- **监控告警**: 设置密钥即将过期的告警机制
- **回滚计划**: 准备密钥轮换失败时的回滚方案

### 3. 密钥分发

- **访问控制**: 严格限制密钥分发的 IP 地址和客户端
- **私钥保护**: 私钥分发时必须加密，使用强加密密钥
- **审计日志**: 启用详细的审计日志记录所有分发操作
- **撤销机制**: 建立快速撤销已分发密钥的机制

### 4. 安全考虑

- **私钥存储**: 私钥仅在客户端存储，服务端只保存公钥
- **传输安全**: 所有密钥操作必须通过 HTTPS 进行
- **权限分离**: 不同环境使用不同的密钥和配置
- **备份恢复**: 建立密钥配置的备份和恢复机制

## 故障排查

### 常见问题

#### 1. 密钥生成失败

```
Error: Failed to generate RSA key pair: ...
```

**解决方案**:
- 检查 Web Crypto API 是否可用
- 确认运行环境支持所选算法
- 检查密钥参数是否有效

#### 2. 密钥验证失败

```
Error: Generated key pair validation failed
```

**解决方案**:
- 检查密钥格式是否正确
- 验证算法参数匹配
- 确认密钥未损坏

#### 3. 轮换计划创建失败

```
Error: App my-app not found
```

**解决方案**:
- 确认应用 ID 存在
- 检查应用是否已启用
- 验证应用至少有一个有效密钥

#### 4. 分发请求被拒绝

```
Error: Request timestamp is too old
```

**解决方案**:
- 检查客户端时间同步
- 确认时间戳格式正确
- 验证网络延迟是否在允许范围内

### 调试模式

启用调试模式获取详细日志：

```typescript
const keyManager = createKeyManager({
  debug: true
});

const rotationManager = new KeyRotationManager(keyManager, {
  // 配置选项
});
```

### 性能监控

监控关键指标：

- 密钥生成时间
- 轮换操作耗时
- 分发请求响应时间
- 缓存命中率

```typescript
// 获取缓存统计
const stats = keyManager.getCacheStats();
console.log('Cache size:', stats.size);
console.log('Hit rate:', stats.hitRate);
```

## API 参考

详细的 API 文档请参考各组件的 TypeScript 接口定义：

- [KeyGenerator API](../app/api/auth/key-generator.ts)
- [KeyRotationManager API](../app/api/auth/key-rotation.ts)
- [KeyDistributionManager API](../app/api/auth/key-distribution.ts)
- [KeyManager API](../app/api/auth/types.ts)

## 示例代码

完整的使用示例请参考：

- [集成测试](../tests/integration/auth/key-management-integration.test.ts)
- [单元测试](../tests/unit/auth/)
- [CLI 工具](../app/api/auth/cli/key-management-cli.ts)