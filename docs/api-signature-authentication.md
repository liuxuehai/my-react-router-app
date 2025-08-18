# API 签名认证使用文档

## 概述

API 签名认证是一个基于非对称加密的安全认证机制，使用 RSA 或 ECDSA 算法确保 API 请求的真实性和完整性。该系统支持多应用渠道管理、防重放攻击，并与现有的 Hono 中间件系统无缝集成。

## 核心概念

### 签名流程

1. **客户端签名**: 使用私钥对请求数据进行数字签名
2. **服务端验证**: 使用对应的公钥验证签名的有效性
3. **时间戳检查**: 防止重放攻击
4. **应用授权**: 基于 App ID 进行访问控制

### 请求头格式

所有需要签名认证的请求必须包含以下请求头：

```http
X-Signature: <base64_encoded_signature>
X-Timestamp: <iso8601_timestamp>
X-App-Id: <application_id>
X-Key-Id: <key_identifier> (可选)
```

### 签名数据格式

签名数据按以下格式构造：
```
{timestamp}\n{method}\n{path}\n{appId}\n{body}
```

示例：
```
2024-01-15T10:30:00.000Z
POST
/api/users
app123
{"name":"John","email":"john@example.com"}
```

## 快速开始

### 1. 生成密钥对

```bash
# 生成 RSA 密钥对
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem

# 或生成 ECDSA 密钥对
openssl ecparam -genkey -name prime256v1 -noout -out private_key.pem
openssl ec -in private_key.pem -pubout -out public_key.pem
```

### 2. 配置服务端

在环境变量中配置应用和密钥：

```bash
# 基础配置
SIGNATURE_TIME_WINDOW=300
SIGNATURE_ALGORITHM=RS256
SIGNATURE_DEBUG=false

# 应用配置
APP_123_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
APP_123_ALGORITHM=RS256
APP_123_ENABLED=true
```

### 3. 启用中间件

在 Hono 应用中启用签名认证中间件：

```typescript
import { signatureAuth } from './api/middleware/signature-auth';

const app = new Hono();

// 全局启用签名认证
app.use('*', signatureAuth({
  enabled: true,
  timeWindow: 300,
  algorithms: ['RS256', 'ES256']
}));

// 或选择性启用
app.use('/api/secure/*', signatureAuth());
app.use('/api/public/*', (c, next) => next()); // 跳过认证
```

## 客户端集成

### Node.js 示例

```typescript
import crypto from 'crypto';
import fetch from 'node-fetch';

class ApiSignatureClient {
  constructor(
    private appId: string,
    private privateKey: string,
    private keyId?: string,
    private algorithm: string = 'RS256'
  ) {}

  private buildSignatureString(
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): string {
    return [timestamp, method, path, this.appId, body || ''].join('\n');
  }

  private generateSignature(data: string): string {
    const sign = crypto.createSign(this.algorithm);
    sign.update(data, 'utf8');
    return sign.sign(this.privateKey, 'base64');
  }

  async request(
    method: string,
    url: string,
    body?: any
  ): Promise<Response> {
    const timestamp = new Date().toISOString();
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    const bodyString = body ? JSON.stringify(body) : undefined;

    const signatureData = this.buildSignatureString(
      timestamp,
      method,
      path,
      bodyString
    );

    const signature = this.generateSignature(signatureData);

    const headers: Record<string, string> = {
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'X-App-Id': this.appId,
      'Content-Type': 'application/json'
    };

    if (this.keyId) {
      headers['X-Key-Id'] = this.keyId;
    }

    return fetch(url, {
      method,
      headers,
      body: bodyString
    });
  }
}

// 使用示例
const client = new ApiSignatureClient(
  'app123',
  privateKeyPem,
  'key1'
);

const response = await client.request('POST', '/api/users', {
  name: 'John',
  email: 'john@example.com'
});
```

### Python 示例

```python
import json
import base64
import hashlib
from datetime import datetime
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
import requests

class ApiSignatureClient:
    def __init__(self, app_id, private_key_pem, key_id=None, algorithm='RS256'):
        self.app_id = app_id
        self.key_id = key_id
        self.algorithm = algorithm
        self.private_key = serialization.load_pem_private_key(
            private_key_pem.encode(),
            password=None
        )

    def _build_signature_string(self, timestamp, method, path, body=None):
        return '\n'.join([
            timestamp,
            method,
            path,
            self.app_id,
            body or ''
        ])

    def _generate_signature(self, data):
        signature = self.private_key.sign(
            data.encode('utf-8'),
            padding.PKCS1v15(),
            hashes.SHA256()
        )
        return base64.b64encode(signature).decode('utf-8')

    def request(self, method, url, data=None):
        timestamp = datetime.utcnow().isoformat() + 'Z'
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path + (f'?{parsed.query}' if parsed.query else '')
        
        body_string = json.dumps(data) if data else None
        
        signature_data = self._build_signature_string(
            timestamp, method, path, body_string
        )
        
        signature = self._generate_signature(signature_data)
        
        headers = {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-App-Id': self.app_id,
            'Content-Type': 'application/json'
        }
        
        if self.key_id:
            headers['X-Key-Id'] = self.key_id
        
        return requests.request(
            method,
            url,
            headers=headers,
            json=data
        )

# 使用示例
client = ApiSignatureClient('app123', private_key_pem, 'key1')
response = client.request('POST', '/api/users', {
    'name': 'John',
    'email': 'john@example.com'
})
```

### JavaScript (浏览器) 示例

```javascript
class ApiSignatureClient {
  constructor(appId, privateKey, keyId = null, algorithm = 'RS256') {
    this.appId = appId;
    this.keyId = keyId;
    this.algorithm = algorithm;
    this.privateKey = privateKey; // CryptoKey object
  }

  buildSignatureString(timestamp, method, path, body = null) {
    return [timestamp, method, path, this.appId, body || ''].join('\n');
  }

  async generateSignature(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const signature = await crypto.subtle.sign(
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      this.privateKey,
      dataBuffer
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  async request(method, url, body = null) {
    const timestamp = new Date().toISOString();
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    const bodyString = body ? JSON.stringify(body) : null;

    const signatureData = this.buildSignatureString(
      timestamp,
      method,
      path,
      bodyString
    );

    const signature = await this.generateSignature(signatureData);

    const headers = {
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'X-App-Id': this.appId,
      'Content-Type': 'application/json'
    };

    if (this.keyId) {
      headers['X-Key-Id'] = this.keyId;
    }

    return fetch(url, {
      method,
      headers,
      body: bodyString
    });
  }
}
```

## 错误处理

### 常见错误码

| 错误码 | HTTP 状态 | 描述 | 解决方案 |
|--------|-----------|------|----------|
| `SIGNATURE_MISSING` | 400 | 缺少必需的签名请求头 | 检查请求头是否包含所有必需字段 |
| `SIGNATURE_INVALID` | 401 | 签名验证失败 | 检查私钥、签名算法和签名数据构造 |
| `TIMESTAMP_EXPIRED` | 401 | 时间戳过期 | 确保客户端时间同步，减少请求延迟 |
| `APP_INVALID` | 401 | 应用 ID 无效或已禁用 | 检查 App ID 配置和状态 |
| `KEY_NOT_FOUND` | 401 | 密钥 ID 不存在 | 检查 Key ID 是否正确配置 |

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "SIGNATURE_INVALID",
    "message": "签名验证失败",
    "details": {
      "appId": "app123",
      "keyId": "key1",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:01.234Z",
    "requestId": "req_abc123"
  }
}
```

## 配置选项

### 中间件配置

```typescript
interface SignatureAuthConfig {
  /** 是否启用签名验证 */
  enabled: boolean;
  /** 时间窗口容差（秒），默认 300 */
  timeWindow: number;
  /** 支持的签名算法 */
  algorithms: ('RS256' | 'RS512' | 'ES256' | 'ES512')[];
  /** 调试模式 */
  debug: boolean;
  /** 自定义请求头名称 */
  headers?: {
    signature?: string;
    timestamp?: string;
    appId?: string;
    keyId?: string;
  };
}
```

### 环境变量

```bash
# 基础配置
SIGNATURE_TIME_WINDOW=300          # 时间窗口（秒）
SIGNATURE_ALGORITHM=RS256          # 默认算法
SIGNATURE_DEBUG=false              # 调试模式

# 存储配置
KEY_STORAGE_TYPE=env               # 存储类型: env|kv|r2
SIGNATURE_KV_NAMESPACE=keys        # KV 命名空间

# 应用配置模板
APP_{APP_ID}_PUBLIC_KEY=           # 公钥 PEM 格式
APP_{APP_ID}_ALGORITHM=            # 签名算法
APP_{APP_ID}_ENABLED=              # 是否启用
APP_{APP_ID}_PERMISSIONS=          # 权限列表（逗号分隔）
```

## 最佳实践

### 安全建议

1. **密钥管理**
   - 私钥仅在客户端保存，不要传输或存储在服务端
   - 定期轮换密钥对
   - 使用足够长度的密钥（RSA >= 2048 位，ECDSA >= 256 位）

2. **时间同步**
   - 确保客户端和服务端时间同步
   - 合理设置时间窗口，平衡安全性和可用性

3. **传输安全**
   - 始终使用 HTTPS
   - 避免在日志中记录敏感信息

### 性能优化

1. **缓存策略**
   - 缓存公钥解析结果
   - 使用连接池减少网络开销

2. **算法选择**
   - ECDSA 通常比 RSA 性能更好
   - 根据安全需求选择合适的哈希算法

3. **错误处理**
   - 实现快速失败机制
   - 避免在认证失败时执行昂贵操作

## 监控和调试

### 日志记录

启用调试模式查看详细日志：

```bash
SIGNATURE_DEBUG=true
```

### 性能监控

监控关键指标：
- 签名验证成功率
- 平均验证时间
- 错误类型分布
- 并发请求处理能力

### 健康检查

实现健康检查端点：

```typescript
app.get('/health/signature-auth', async (c) => {
  const keyManager = getKeyManager();
  const isHealthy = await keyManager.healthCheck();
  
  return c.json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString()
  });
});
```

## 版本兼容性

当前版本支持：
- Node.js >= 16
- 现代浏览器（支持 Web Crypto API）
- Cloudflare Workers Runtime

## 更多资源

- [密钥配置和部署指南](./deployment-guide.md)
- [故障排查指南](./troubleshooting-guide.md)
- [安全最佳实践](./security-best-practices.md)
- [API 参考文档](./api-reference.md)