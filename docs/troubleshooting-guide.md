# API 签名认证故障排查指南

## 概述

本指南帮助开发者和运维人员快速诊断和解决 API 签名认证系统中的常见问题。包含详细的错误分析、解决方案和预防措施。

## 快速诊断工具

### 1. 健康检查

```bash
# 检查签名认证服务状态
curl -X GET "https://your-domain.workers.dev/health/signature-auth" \
  -H "Accept: application/json"
```

预期响应：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "apps": 3,
  "storage": "kv"
}
```

### 2. 调试模式

启用调试模式获取详细日志：

```bash
# 设置环境变量
SIGNATURE_DEBUG=true

# 或在代码中启用
const config = {
  debug: true,
  // ... 其他配置
};
```

### 3. 签名验证测试工具

```typescript
// debug-signature.ts
import { SignatureUtils } from '../app/api/auth/signature-utils';

async function debugSignature(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  appId: string,
  signature: string,
  publicKey: string
) {
  const utils = new SignatureUtils();
  
  // 1. 构造签名数据
  const signatureData = utils.buildSignatureString({
    timestamp,
    method,
    path,
    body,
    appId
  });
  
  console.log('签名数据:', JSON.stringify(signatureData));
  
  // 2. 验证时间戳
  const isTimestampValid = utils.validateTimestamp(timestamp, 300);
  console.log('时间戳有效:', isTimestampValid);
  
  // 3. 验证签名
  try {
    const isSignatureValid = await utils.verifySignature(
      signatureData,
      signature,
      publicKey,
      'RS256'
    );
    console.log('签名有效:', isSignatureValid);
  } catch (error) {
    console.error('签名验证错误:', error.message);
  }
}
```

## 常见错误及解决方案

### 1. 签名验证失败 (SIGNATURE_INVALID)

#### 错误表现
```json
{
  "success": false,
  "error": {
    "code": "SIGNATURE_INVALID",
    "message": "签名验证失败"
  }
}
```

#### 可能原因及解决方案

**原因 1: 签名数据构造错误**

检查签名数据格式：
```typescript
// 正确的签名数据格式
const signatureData = [
  timestamp,      // ISO 8601 格式
  method,         // 大写，如 'POST'
  path,          // 包含查询参数，如 '/api/users?page=1'
  appId,         // 应用 ID
  body || ''     // 请求体，GET 请求为空字符串
].join('\n');
```

**原因 2: 私钥和公钥不匹配**

验证密钥对：
```bash
# 生成测试数据
echo "test data" > test.txt

# 使用私钥签名
openssl dgst -sha256 -sign private_key.pem -out signature.bin test.txt

# 使用公钥验证
openssl dgst -sha256 -verify public_key.pem -signature signature.bin test.txt
```

**原因 3: 算法不匹配**

确保客户端和服务端使用相同算法：
```typescript
// 客户端
const signature = crypto.createSign('sha256').update(data).sign(privateKey, 'base64');

// 服务端配置
APP_123_ALGORITHM=RS256  // 对应 'sha256'
```

**原因 4: Base64 编码问题**

检查签名的 Base64 编码：
```typescript
// 正确的编码方式
const signature = crypto.createSign('sha256')
  .update(signatureData, 'utf8')
  .sign(privateKey, 'base64');

// 避免额外的换行符
const cleanSignature = signature.replace(/\n/g, '');
```

### 2. 时间戳过期 (TIMESTAMP_EXPIRED)

#### 错误表现
```json
{
  "success": false,
  "error": {
    "code": "TIMESTAMP_EXPIRED",
    "message": "请求时间戳已过期",
    "details": {
      "timestamp": "2024-01-15T10:25:00.000Z",
      "serverTime": "2024-01-15T10:31:00.000Z",
      "maxAge": 300
    }
  }
}
```

#### 解决方案

**方案 1: 检查时间同步**

```bash
# 检查系统时间
date -u

# 同步时间 (Linux)
sudo ntpdate -s time.nist.gov

# 同步时间 (Windows)
w32tm /resync
```

**方案 2: 调整时间窗口**

```typescript
// 增加时间容差（仅用于调试）
const config = {
  timeWindow: 600, // 10 分钟
  // ...
};
```

**方案 3: 客户端时间戳生成**

```typescript
// 确保使用 UTC 时间
const timestamp = new Date().toISOString();

// 避免时区问题
const timestamp = new Date(Date.now()).toISOString();
```

### 3. 应用 ID 无效 (APP_INVALID)

#### 错误表现
```json
{
  "success": false,
  "error": {
    "code": "APP_INVALID",
    "message": "应用 ID 无效或已禁用",
    "details": {
      "appId": "app123"
    }
  }
}
```

#### 解决方案

**检查应用配置**

```bash
# 检查环境变量
env | grep APP_123

# 检查 KV 存储
wrangler kv:key get "app:app123" --namespace-id your-kv-namespace-id

# 检查应用状态
wrangler kv:key get "app:app123" --namespace-id your-kv-namespace-id | jq '.enabled'
```

**添加应用配置**

```bash
# 环境变量方式
export APP_123_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
export APP_123_ALGORITHM=RS256
export APP_123_ENABLED=true

# KV 存储方式
wrangler kv:key put "app:app123" '{
  "appId": "app123",
  "enabled": true,
  "keyPairs": [...]
}' --namespace-id your-kv-namespace-id
```

### 4. 密钥未找到 (KEY_NOT_FOUND)

#### 错误表现
```json
{
  "success": false,
  "error": {
    "code": "KEY_NOT_FOUND",
    "message": "指定的密钥 ID 不存在",
    "details": {
      "appId": "app123",
      "keyId": "key1"
    }
  }
}
```

#### 解决方案

**检查密钥配置**

```typescript
// 检查密钥 ID 是否存在
const keyManager = getKeyManager();
const publicKey = await keyManager.getPublicKey('app123', 'key1');
console.log('公钥:', publicKey);
```

**添加密钥配置**

```json
{
  "appId": "app123",
  "keyPairs": [
    {
      "keyId": "key1",
      "publicKey": "-----BEGIN PUBLIC KEY-----...",
      "algorithm": "RS256",
      "enabled": true
    }
  ]
}
```

### 5. 请求头缺失 (SIGNATURE_MISSING)

#### 错误表现
```json
{
  "success": false,
  "error": {
    "code": "SIGNATURE_MISSING",
    "message": "缺少必需的签名请求头",
    "details": {
      "missing": ["X-Signature", "X-Timestamp"]
    }
  }
}
```

#### 解决方案

**检查请求头**

```typescript
// 确保包含所有必需的请求头
const headers = {
  'X-Signature': signature,
  'X-Timestamp': timestamp,
  'X-App-Id': appId,
  'X-Key-Id': keyId, // 可选
  'Content-Type': 'application/json'
};
```

**调试请求头**

```bash
# 使用 curl 检查请求头
curl -X POST "https://your-domain.workers.dev/api/test" \
  -H "X-Signature: your-signature" \
  -H "X-Timestamp: 2024-01-15T10:30:00.000Z" \
  -H "X-App-Id: app123" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' \
  -v
```

## 性能问题排查

### 1. 签名验证超时

#### 症状
- 请求响应时间过长
- 间歇性超时错误

#### 排查步骤

**检查密钥缓存**

```typescript
// 添加性能监控
const start = performance.now();
const publicKey = await keyManager.getPublicKey(appId, keyId);
const keyLoadTime = performance.now() - start;

console.log(`密钥加载时间: ${keyLoadTime}ms`);
```

**优化密钥加载**

```typescript
// 实现密钥缓存
class CachedKeyManager {
  private cache = new Map<string, { key: string; expiry: number }>();
  
  async getPublicKey(appId: string, keyId?: string): Promise<string> {
    const cacheKey = `${appId}:${keyId || 'default'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiry) {
      return cached.key;
    }
    
    const key = await this.loadPublicKey(appId, keyId);
    this.cache.set(cacheKey, {
      key,
      expiry: Date.now() + 5 * 60 * 1000 // 5 分钟缓存
    });
    
    return key;
  }
}
```

### 2. 高并发问题

#### 症状
- 在高负载下签名验证失败率增加
- 内存使用量异常增长

#### 解决方案

**连接池优化**

```typescript
// 限制并发验证数量
const semaphore = new Semaphore(10); // 最多 10 个并发验证

async function verifySignature(data: SignatureData): Promise<boolean> {
  await semaphore.acquire();
  try {
    return await doVerifySignature(data);
  } finally {
    semaphore.release();
  }
}
```

**内存管理**

```typescript
// 定期清理缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of keyCache.entries()) {
    if (now > value.expiry) {
      keyCache.delete(key);
    }
  }
}, 60000); // 每分钟清理一次
```

## 配置问题排查

### 1. 环境变量未生效

#### 检查步骤

```bash
# 检查 Wrangler 配置
wrangler whoami
wrangler secret list

# 检查环境变量
wrangler dev --local --var SIGNATURE_DEBUG:true
```

#### 解决方案

```bash
# 重新设置环境变量
wrangler secret put SIGNATURE_DEBUG
wrangler secret put APP_123_PUBLIC_KEY

# 重新部署
wrangler deploy
```

### 2. KV 存储访问问题

#### 检查步骤

```bash
# 检查 KV 命名空间
wrangler kv:namespace list

# 检查绑定配置
cat wrangler.toml | grep -A 5 kv_namespaces

# 测试 KV 访问
wrangler kv:key get "test" --namespace-id your-kv-namespace-id
```

#### 解决方案

```toml
# 确保 wrangler.toml 配置正确
[[kv_namespaces]]
binding = "SIGNATURE_KEYS"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

## 安全问题排查

### 1. 密钥泄露检测

#### 检查步骤

```bash
# 检查日志中是否包含私钥
grep -r "BEGIN PRIVATE KEY" /var/log/

# 检查代码中是否硬编码私钥
grep -r "BEGIN PRIVATE KEY" ./src/
```

#### 应急响应

```bash
# 1. 立即禁用泄露的密钥
wrangler kv:key put "app:app123" '{
  "appId": "app123",
  "enabled": false
}' --namespace-id your-kv-namespace-id

# 2. 生成新的密钥对
openssl genrsa -out new_private_key.pem 2048
openssl rsa -in new_private_key.pem -pubout -out new_public_key.pem

# 3. 更新配置
wrangler secret put APP_123_PUBLIC_KEY < new_public_key.pem
```

### 2. 异常访问模式

#### 监控指标

```typescript
// 添加访问监控
app.use('*', async (c, next) => {
  const appId = c.req.header('X-App-Id');
  const ip = c.req.header('CF-Connecting-IP');
  
  // 记录访问日志
  console.log(JSON.stringify({
    type: 'access',
    appId,
    ip,
    path: c.req.path,
    timestamp: new Date().toISOString()
  }));
  
  await next();
});
```

#### 异常检测

```typescript
// 简单的异常检测
const accessCounts = new Map<string, number>();

function detectAnomalies(appId: string, ip: string): boolean {
  const key = `${appId}:${ip}`;
  const count = accessCounts.get(key) || 0;
  accessCounts.set(key, count + 1);
  
  // 每分钟超过 100 次请求视为异常
  if (count > 100) {
    console.warn(`异常访问检测: ${key} 访问次数过多`);
    return true;
  }
  
  return false;
}
```

## 日志分析

### 1. 启用详细日志

```typescript
// 配置日志级别
const logger = {
  debug: (message: string, data?: any) => {
    if (config.debug) {
      console.log(JSON.stringify({
        level: 'debug',
        message,
        data,
        timestamp: new Date().toISOString()
      }));
    }
  },
  
  error: (message: string, error?: Error) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error?.message,
      stack: error?.stack,
      timestamp: new Date().toISOString()
    }));
  }
};
```

### 2. 日志查询

```bash
# 查看最近的错误日志
wrangler tail --format pretty | grep -i error

# 过滤特定应用的日志
wrangler tail --format json | jq 'select(.appId == "app123")'

# 统计错误类型
wrangler tail --format json | jq -r '.error.code' | sort | uniq -c
```

## 测试和验证

### 1. 端到端测试

```typescript
// e2e-test.ts
import { test, expect } from 'vitest';

test('完整签名认证流程', async () => {
  const client = new ApiSignatureClient('test_app', testPrivateKey);
  
  const response = await client.request('POST', '/api/test', {
    message: 'test'
  });
  
  expect(response.status).toBe(200);
  
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

### 2. 压力测试

```typescript
// load-test.ts
import { test } from 'vitest';

test('并发签名验证', async () => {
  const promises = Array.from({ length: 100 }, (_, i) => {
    const client = new ApiSignatureClient(`test_app_${i}`, testPrivateKey);
    return client.request('GET', '/api/test');
  });
  
  const responses = await Promise.all(promises);
  const successCount = responses.filter(r => r.status === 200).length;
  
  expect(successCount).toBeGreaterThan(95); // 95% 成功率
});
```

## 预防措施

### 1. 监控告警

```typescript
// 设置告警阈值
const alertThresholds = {
  errorRate: 0.05,        // 5% 错误率
  responseTime: 1000,     // 1 秒响应时间
  concurrency: 1000       // 1000 并发请求
};

// 监控函数
function checkAlerts(metrics: Metrics) {
  if (metrics.errorRate > alertThresholds.errorRate) {
    sendAlert('高错误率告警', metrics);
  }
  
  if (metrics.avgResponseTime > alertThresholds.responseTime) {
    sendAlert('响应时间告警', metrics);
  }
}
```

### 2. 自动恢复

```typescript
// 自动重试机制
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 3. 健康检查自动化

```bash
#!/bin/bash
# health-check.sh

ENDPOINT="https://your-domain.workers.dev/health/signature-auth"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$ENDPOINT")

if [ "$RESPONSE" != "200" ]; then
  echo "健康检查失败: HTTP $RESPONSE"
  # 发送告警
  curl -X POST "https://hooks.slack.com/..." \
    -d '{"text": "API 签名认证服务异常"}'
  exit 1
fi

echo "健康检查通过"
```

## 联系支持

如果问题仍未解决，请提供以下信息：

1. 错误消息和错误码
2. 请求和响应的完整日志
3. 相关配置信息（隐藏敏感数据）
4. 复现步骤
5. 环境信息（Node.js 版本、Cloudflare Workers 版本等）

参考文档：
- [API 签名认证使用文档](./api-signature-authentication.md)
- [部署指南](./deployment-guide.md)
- [安全最佳实践](./security-best-practices.md)