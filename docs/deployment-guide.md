# API 签名认证部署指南

## 概述

本指南详细说明如何在不同环境中部署和配置 API 签名认证系统，包括密钥管理、环境配置、存储选项和部署最佳实践。

## 环境准备

### 系统要求

- Node.js >= 16.0.0
- Cloudflare Workers Runtime
- 支持的存储服务（可选）：
  - Cloudflare KV
  - Cloudflare R2
  - 环境变量

### 依赖安装

确保项目包含必要的依赖：

```json
{
  "dependencies": {
    "hono": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "vitest": "^1.0.0"
  }
}
```

## 密钥管理

### 1. 生成密钥对

#### RSA 密钥对

```bash
# 生成 2048 位 RSA 私钥
openssl genrsa -out rsa_private_key.pem 2048

# 提取公钥
openssl rsa -in rsa_private_key.pem -pubout -out rsa_public_key.pem

# 生成 4096 位密钥（更高安全性）
openssl genrsa -out rsa_private_key_4096.pem 4096
openssl rsa -in rsa_private_key_4096.pem -pubout -out rsa_public_key_4096.pem
```

#### ECDSA 密钥对

```bash
# 生成 P-256 曲线密钥
openssl ecparam -genkey -name prime256v1 -noout -out ecdsa_private_key.pem
openssl ec -in ecdsa_private_key.pem -pubout -out ecdsa_public_key.pem

# 生成 P-384 曲线密钥（更高安全性）
openssl ecparam -genkey -name secp384r1 -noout -out ecdsa_private_key_384.pem
openssl ec -in ecdsa_private_key_384.pem -pubout -out ecdsa_public_key_384.pem
```

### 2. 密钥格式转换

#### 转换为单行格式（用于环境变量）

```bash
# 将 PEM 格式转换为单行
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' rsa_public_key.pem

# 或使用 base64 编码
base64 -w 0 rsa_public_key.pem
```

#### 验证密钥格式

```bash
# 验证私钥
openssl rsa -in rsa_private_key.pem -check -noout

# 验证公钥
openssl rsa -pubin -in rsa_public_key.pem -text -noout

# 验证 ECDSA 密钥
openssl ec -in ecdsa_private_key.pem -check -noout
```

## 配置管理

### 1. 环境变量配置

#### 基础配置

```bash
# .env.local (开发环境)
SIGNATURE_TIME_WINDOW=300
SIGNATURE_ALGORITHM=RS256
SIGNATURE_DEBUG=true
KEY_STORAGE_TYPE=env

# 应用配置
APP_DEV_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
APP_DEV_ALGORITHM=RS256
APP_DEV_ENABLED=true
APP_DEV_PERMISSIONS=read,write
```

#### 生产环境配置

```bash
# .env.production
SIGNATURE_TIME_WINDOW=300
SIGNATURE_ALGORITHM=RS256
SIGNATURE_DEBUG=false
KEY_STORAGE_TYPE=kv
SIGNATURE_KV_NAMESPACE=signature_keys

# 多应用配置
APP_PROD_001_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
APP_PROD_001_ALGORITHM=RS256
APP_PROD_001_ENABLED=true
APP_PROD_001_PERMISSIONS=read,write,admin

APP_PROD_002_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
APP_PROD_002_ALGORITHM=ES256
APP_PROD_002_ENABLED=true
APP_PROD_002_PERMISSIONS=read
```

### 2. Cloudflare KV 存储配置

#### 创建 KV 命名空间

```bash
# 使用 Wrangler CLI
wrangler kv:namespace create "signature_keys"
wrangler kv:namespace create "signature_keys" --preview
```

#### 配置 wrangler.toml

```toml
name = "api-server"
main = "workers/app.ts"
compatibility_date = "2024-01-15"

[[kv_namespaces]]
binding = "SIGNATURE_KEYS"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"

[env.production]
[[env.production.kv_namespaces]]
binding = "SIGNATURE_KEYS"
id = "your-production-kv-namespace-id"
```

#### 上传密钥到 KV

```bash
# 上传应用配置
wrangler kv:key put "app:prod_001" '{
  "appId": "prod_001",
  "name": "Production App 1",
  "enabled": true,
  "keyPairs": [{
    "keyId": "key1",
    "publicKey": "-----BEGIN PUBLIC KEY-----...",
    "algorithm": "RS256",
    "enabled": true,
    "createdAt": "2024-01-15T00:00:00.000Z"
  }],
  "permissions": ["read", "write"],
  "createdAt": "2024-01-15T00:00:00.000Z"
}' --namespace-id your-kv-namespace-id

# 批量上传
wrangler kv:bulk put keys.json --namespace-id your-kv-namespace-id
```

#### KV 数据格式

```json
// keys.json
[
  {
    "key": "app:prod_001",
    "value": {
      "appId": "prod_001",
      "name": "Production App 1",
      "enabled": true,
      "keyPairs": [
        {
          "keyId": "key1",
          "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
          "algorithm": "RS256",
          "enabled": true,
          "createdAt": "2024-01-15T00:00:00.000Z",
          "expiresAt": "2025-01-15T00:00:00.000Z"
        }
      ],
      "permissions": ["read", "write"],
      "createdAt": "2024-01-15T00:00:00.000Z"
    }
  }
]
```

### 3. Cloudflare R2 存储配置

#### 创建 R2 存储桶

```bash
wrangler r2 bucket create signature-keys
```

#### 配置 wrangler.toml

```toml
[[r2_buckets]]
binding = "SIGNATURE_KEYS_BUCKET"
bucket_name = "signature-keys"
preview_bucket_name = "signature-keys-preview"
```

#### 上传密钥文件

```bash
# 上传公钥文件
wrangler r2 object put signature-keys/apps/prod_001/public_key.pem --file rsa_public_key.pem

# 上传配置文件
wrangler r2 object put signature-keys/apps/prod_001/config.json --file app_config.json
```

## 部署配置

### 1. 开发环境

#### 本地开发配置

```typescript
// dev.config.ts
export const devConfig = {
  signature: {
    enabled: true,
    timeWindow: 600, // 10 分钟，开发环境更宽松
    algorithms: ['RS256', 'ES256'],
    debug: true,
    storage: {
      type: 'env' as const,
    }
  }
};
```

#### 启动开发服务器

```bash
# 使用 Wrangler 本地开发
wrangler dev --local --port 8787

# 或使用 Vite 开发服务器
npm run dev
```

### 2. 测试环境

#### 测试环境配置

```typescript
// test.config.ts
export const testConfig = {
  signature: {
    enabled: true,
    timeWindow: 300,
    algorithms: ['RS256', 'ES256'],
    debug: true,
    storage: {
      type: 'kv' as const,
      namespace: 'SIGNATURE_KEYS_TEST'
    }
  }
};
```

#### 部署到测试环境

```bash
# 部署到测试环境
wrangler deploy --env test

# 验证部署
curl -H "X-App-Id: test_app" https://your-test-domain.workers.dev/health/signature-auth
```

### 3. 生产环境

#### 生产环境配置

```typescript
// prod.config.ts
export const prodConfig = {
  signature: {
    enabled: true,
    timeWindow: 300,
    algorithms: ['RS256', 'ES256'],
    debug: false,
    storage: {
      type: 'kv' as const,
      namespace: 'SIGNATURE_KEYS'
    }
  }
};
```

#### 生产部署流程

```bash
# 1. 构建项目
npm run build

# 2. 运行测试
npm run test

# 3. 部署到生产环境
wrangler deploy --env production

# 4. 验证部署
curl -H "X-App-Id: prod_001" https://your-domain.workers.dev/health/signature-auth
```

## 中间件集成

### 1. 全局启用

```typescript
// workers/app.ts
import { Hono } from 'hono';
import { signatureAuth } from '../app/api/middleware/signature-auth';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// 全局启用签名认证
app.use('*', signatureAuth({
  enabled: true,
  timeWindow: 300,
  algorithms: ['RS256', 'ES256'],
  debug: false
}));

app.get('/api/users', (c) => {
  return c.json({ message: 'Authenticated request' });
});

export default app;
```

### 2. 选择性启用

```typescript
// 公开路由不需要认证
app.use('/api/public/*', (c, next) => next());

// 受保护的路由需要认证
app.use('/api/secure/*', signatureAuth());

// 管理员路由需要特殊权限
app.use('/api/admin/*', signatureAuth({
  requiredPermissions: ['admin']
}));
```

### 3. 路由级别配置

```typescript
// 不同路由使用不同配置
app.use('/api/v1/*', signatureAuth({
  algorithms: ['RS256'],
  timeWindow: 300
}));

app.use('/api/v2/*', signatureAuth({
  algorithms: ['ES256'],
  timeWindow: 180
}));
```

## 监控和日志

### 1. 健康检查

```typescript
// 添加健康检查端点
app.get('/health/signature-auth', async (c) => {
  try {
    const keyManager = getKeyManager(c.env);
    const apps = await keyManager.listApps();
    
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      apps: apps.length,
      storage: keyManager.getStorageType()
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});
```

### 2. 指标收集

```typescript
// 添加指标收集
app.use('*', async (c, next) => {
  const start = Date.now();
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  // 记录指标
  console.log(JSON.stringify({
    type: 'metric',
    name: 'signature_auth_request',
    duration,
    status,
    path: c.req.path,
    method: c.req.method,
    timestamp: new Date().toISOString()
  }));
});
```

### 3. 错误日志

```typescript
// 错误处理中间件
app.onError((err, c) => {
  console.error(JSON.stringify({
    type: 'error',
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    headers: Object.fromEntries(c.req.header()),
    timestamp: new Date().toISOString()
  }));
  
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }
  }, 500);
});
```

## 安全配置

### 1. HTTPS 强制

```typescript
// 强制 HTTPS
app.use('*', async (c, next) => {
  if (c.req.header('x-forwarded-proto') !== 'https') {
    return c.redirect(`https://${c.req.header('host')}${c.req.path}`);
  }
  await next();
});
```

### 2. 安全头设置

```typescript
// 设置安全头
app.use('*', async (c, next) => {
  await next();
  
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});
```

### 3. 速率限制

```typescript
// 简单的速率限制
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

app.use('/api/*', async (c, next) => {
  const clientId = c.req.header('X-App-Id') || c.req.header('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 分钟
  const maxRequests = 100;
  
  const record = rateLimiter.get(clientId);
  
  if (!record || now > record.resetTime) {
    rateLimiter.set(clientId, { count: 1, resetTime: now + windowMs });
  } else if (record.count >= maxRequests) {
    return c.json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests'
      }
    }, 429);
  } else {
    record.count++;
  }
  
  await next();
});
```

## 备份和恢复

### 1. 密钥备份

```bash
#!/bin/bash
# backup-keys.sh

# 备份环境变量配置
env | grep -E '^APP_|^SIGNATURE_' > keys-backup-$(date +%Y%m%d).env

# 备份 KV 数据
wrangler kv:key list --namespace-id your-kv-namespace-id > kv-keys-$(date +%Y%m%d).json

# 备份 R2 数据
wrangler r2 object list signature-keys > r2-objects-$(date +%Y%m%d).json
```

### 2. 恢复流程

```bash
#!/bin/bash
# restore-keys.sh

BACKUP_DATE=$1

if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup_date>"
  exit 1
fi

# 恢复环境变量
source keys-backup-${BACKUP_DATE}.env

# 恢复 KV 数据
wrangler kv:bulk put kv-backup-${BACKUP_DATE}.json --namespace-id your-kv-namespace-id
```

## 故障排查

### 1. 常见部署问题

#### 密钥格式错误

```bash
# 检查密钥格式
openssl rsa -pubin -in public_key.pem -text -noout

# 转换密钥格式
openssl rsa -pubin -in public_key.pem -outform PEM -out public_key_fixed.pem
```

#### 环境变量未设置

```bash
# 检查环境变量
wrangler secret list

# 设置缺失的环境变量
wrangler secret put APP_PROD_001_PUBLIC_KEY
```

#### KV 命名空间问题

```bash
# 检查 KV 命名空间
wrangler kv:namespace list

# 检查 KV 数据
wrangler kv:key list --namespace-id your-kv-namespace-id
```

### 2. 性能调优

#### 缓存优化

```typescript
// 实现公钥缓存
const keyCache = new Map<string, { key: string; expiry: number }>();

function getCachedPublicKey(appId: string, keyId?: string): string | null {
  const cacheKey = `${appId}:${keyId || 'default'}`;
  const cached = keyCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expiry) {
    return cached.key;
  }
  
  return null;
}
```

#### 连接池配置

```typescript
// 配置 KV 客户端
const kvClient = {
  maxRetries: 3,
  retryDelay: 100,
  timeout: 5000
};
```

## 版本升级

### 1. 升级检查清单

- [ ] 备份当前配置和密钥
- [ ] 测试新版本兼容性
- [ ] 更新依赖版本
- [ ] 运行完整测试套件
- [ ] 部署到测试环境验证
- [ ] 执行生产环境部署
- [ ] 验证所有功能正常

### 2. 回滚计划

```bash
# 快速回滚脚本
#!/bin/bash
PREVIOUS_VERSION=$1

wrangler deploy --env production --compatibility-date 2024-01-01
wrangler secret bulk secrets-backup-${PREVIOUS_VERSION}.json
```

## 联系支持

如果在部署过程中遇到问题，请参考：

- [故障排查指南](./troubleshooting-guide.md)
- [安全最佳实践](./security-best-practices.md)
- [API 参考文档](./api-reference.md)

或联系技术支持团队。