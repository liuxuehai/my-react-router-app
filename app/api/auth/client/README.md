# API 签名认证客户端工具

本目录包含了用于生成 API 签名认证的客户端工具和示例代码，支持多种编程语言和使用场景。

## 概述

API 签名认证使用非对称加密算法（RSA 或 ECDSA）对 API 请求进行数字签名，确保请求的真实性和完整性。客户端使用私钥生成签名，服务端使用对应的公钥验证签名。

## 支持的算法

- **RS256**: RSA + SHA-256
- **RS512**: RSA + SHA-512
- **ES256**: ECDSA + SHA-256 (P-256 曲线)
- **ES512**: ECDSA + SHA-512 (P-521 曲线)

## 签名流程

### 1. 签名数据构造

签名数据按以下格式构造：

```
{timestamp}
{method}
{path}
{appId}
{body}
```

示例：

```
2024-01-15T10:30:00.000Z
POST
/api/users
app123
{"name":"John","email":"john@example.com"}
```

### 2. 请求头格式

生成的签名信息需要添加到以下 HTTP 请求头中：

- `X-Signature`: Base64 编码的数字签名
- `X-Timestamp`: ISO 8601 格式的时间戳
- `X-App-Id`: 应用标识符
- `X-Key-Id`: 密钥标识符（可选）

### 3. 时间窗口验证

为防止重放攻击，服务端会验证请求时间戳是否在允许的时间窗口内（默认 5 分钟）。

## 客户端工具

### TypeScript/JavaScript 客户端

位置: `signature-client.ts`

```typescript
import { SignatureClient } from "./signature-client.js";

const client = new SignatureClient({
  appId: "your-app-id",
  privateKey: "-----BEGIN PRIVATE KEY-----...",
  algorithm: "RS256",
  keyId: "key-001",
  baseUrl: "https://api.example.com",
});

// 发送签名请求
const response = await client.post("/api/users", {
  name: "John Doe",
  email: "john@example.com",
});
```

**主要功能:**

- 自动生成签名请求头
- 支持所有 HTTP 方法 (GET, POST, PUT, DELETE, PATCH)
- 内置 fetch API 集成
- 批量请求签名生成
- 配置验证和错误处理

### 使用示例

#### 基本用法

```typescript
// 创建客户端
const client = new SignatureClient({
  appId: "app123",
  privateKey: privateKeyPem,
  algorithm: "RS256",
});

// GET 请求
const users = await client.get("/api/users");

// POST 请求
const newUser = await client.post("/api/users", {
  name: "John Doe",
  email: "john@example.com",
});

// 手动生成签名头
const headers = await client.generateSignatureHeaders("GET", "/api/profile");
```

#### 高级用法

```typescript
// 批量生成签名
const signatures = await generateBatchSignatures(config, [
  { method: "GET", path: "/api/users" },
  { method: "POST", path: "/api/orders", body: '{"item":"book"}' },
]);

// 自定义时间戳
const headers = await client.generateSignatureHeaders(
  "POST",
  "/api/data",
  JSON.stringify(data),
  "2024-01-15T10:30:00.000Z"
);

// 添加自定义请求头
const response = await client.post("/api/users", userData, {
  headers: {
    "X-Custom-Header": "value",
    "Accept-Language": "zh-CN",
  },
});
```

## 多语言示例

### JavaScript/Node.js

位置: `examples/javascript-example.js`

```javascript
const { JavaScriptSignatureClient } = require("./javascript-example.js");

const client = new JavaScriptSignatureClient({
  appId: "your-app-id",
  privateKey: privateKeyPem,
  algorithm: "RS256",
  baseUrl: "https://api.example.com",
});

const response = await client.get("/api/users");
```

**特性:**

- 使用 Node.js crypto 模块
- 支持 CommonJS 和 ES6 模块
- 完整的错误处理
- 便捷的 HTTP 方法封装

### Python

位置: `examples/python-example.py`

```python
from python_example import PythonSignatureClient

client = PythonSignatureClient({
    'appId': 'your-app-id',
    'privateKey': private_key_pem,
    'algorithm': 'RS256',
    'baseUrl': 'https://api.example.com'
})

response = client.get('/api/users')
```

**特性:**

- 使用 cryptography 库进行签名
- 支持 RSA 和 ECDSA 算法
- 集成 requests 库
- 密钥对生成工具
- 类型提示支持

**依赖安装:**

```bash
pip install cryptography requests
```

### cURL/Bash

位置: `examples/curl-example.sh`

```bash
# 设置配置
export APP_ID="your-app-id"
export PRIVATE_KEY_FILE="private_key.pem"
export BASE_URL="https://api.example.com"

# 发送签名请求
./curl-example.sh get /api/users
./curl-example.sh post /api/users '{"name":"John"}'
```

**特性:**

- 纯 bash 脚本实现
- 使用 openssl 进行签名
- 支持所有 HTTP 方法
- 密钥生成工具
- 签名验证功能

## 密钥管理

### 密钥生成

#### RSA 密钥对

```bash
# 生成私钥
openssl genpkey -algorithm RSA -out private_key.pem -pkcs8 2048

# 生成公钥
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

#### ECDSA 密钥对

```bash
# P-256 曲线 (用于 ES256)
openssl ecparam -genkey -name prime256v1 -noout -out ec_private_key.pem
openssl ec -in ec_private_key.pem -pubout -out ec_public_key.pem

# P-521 曲线 (用于 ES512)
openssl ecparam -genkey -name secp521r1 -noout -out ec_private_key.pem
openssl ec -in ec_private_key.pem -pubout -out ec_public_key.pem
```

### 密钥格式

私钥必须使用 PKCS#8 PEM 格式：

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

公钥必须使用 X.509 PEM 格式：

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

## 错误处理

### 常见错误类型

1. **配置错误**

   - 应用 ID 缺失
   - 私钥格式错误
   - 不支持的算法

2. **签名错误**

   - 私钥无效
   - 签名生成失败
   - 时间戳格式错误

3. **网络错误**
   - 请求超时
   - 连接失败
   - 服务器错误

### 错误处理示例

```typescript
try {
  const response = await client.post("/api/users", userData);
  const result = await response.json();

  if (!response.ok) {
    console.error("API Error:", result.error);
  }
} catch (error) {
  if (error.message.includes("signature")) {
    console.error("Signature generation failed:", error);
  } else if (error.message.includes("network")) {
    console.error("Network error:", error);
  } else {
    console.error("Unknown error:", error);
  }
}
```

## 测试和调试

### 签名验证测试

```typescript
// 生成测试签名
const testData = {
  timestamp: "2024-01-15T10:30:00.000Z",
  method: "POST",
  path: "/api/test",
  appId: "test-app",
  body: '{"test":true}',
};

const signature = await SignatureUtils.generateSignature(
  SignatureUtils.buildSignatureString(testData),
  privateKey,
  "RS256"
);

// 验证签名
const isValid = await SignatureUtils.verifySignature(
  SignatureUtils.buildSignatureString(testData),
  signature,
  publicKey,
  "RS256"
);

console.log("Signature valid:", isValid);
```

### 调试模式

```typescript
// 启用详细日志
const client = new SignatureClient({
  appId: "test-app",
  privateKey: privateKey,
  algorithm: "RS256",
  debug: true, // 启用调试模式
});
```

### 时间戳测试

```typescript
// 测试时间窗口验证
const timestamp = SignatureUtils.generateTimestamp();
const isValid = SignatureUtils.validateTimestamp(timestamp, 300);
console.log("Timestamp valid:", isValid);

// 测试过期时间戳
const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const isExpired = SignatureUtils.validateTimestamp(expiredTimestamp, 300);
console.log("Expired timestamp valid:", isExpired); // false
```

## 性能优化

### 密钥缓存

```typescript
// 缓存解析后的密钥对象
class OptimizedSignatureClient extends SignatureClient {
  private keyCache = new Map();

  async generateSignature(data: string): Promise<string> {
    let keyObj = this.keyCache.get(this.config.privateKey);
    if (!keyObj) {
      keyObj = await this.parsePrivateKey(this.config.privateKey);
      this.keyCache.set(this.config.privateKey, keyObj);
    }

    return this.signWithKey(data, keyObj);
  }
}
```

### 批量处理

```typescript
// 批量生成签名以减少开销
const requests = [
  { method: "GET", path: "/api/users" },
  { method: "GET", path: "/api/orders" },
  { method: "POST", path: "/api/logs", body: logData },
];

const signatures = await generateBatchSignatures(config, requests);
```

## 安全最佳实践

### 1. 密钥安全

- **私钥保护**: 私钥不应存储在代码中，使用环境变量或安全的密钥管理服务
- **密钥轮换**: 定期更换密钥对，支持多个密钥版本
- **权限控制**: 限制私钥的访问权限

### 2. 传输安全

- **HTTPS 强制**: 所有 API 请求必须使用 HTTPS
- **请求完整性**: 签名覆盖完整的请求内容
- **时间窗口**: 合理设置时间窗口防止重放攻击

### 3. 错误处理

- **信息泄露**: 避免在错误消息中暴露敏感信息
- **日志记录**: 记录认证失败事件用于安全审计
- **降级策略**: 在认证服务不可用时的处理方案

## 故障排查

### 常见问题

1. **签名验证失败**

   - 检查私钥和公钥是否匹配
   - 确认签名算法一致
   - 验证签名数据构造是否正确

2. **时间戳过期**

   - 检查客户端和服务端时间同步
   - 调整时间窗口设置
   - 确认时间戳格式正确

3. **应用 ID 无效**
   - 确认应用 ID 配置正确
   - 检查应用是否已启用
   - 验证密钥 ID 是否存在

### 调试工具

```bash
# 验证密钥格式
openssl rsa -in private_key.pem -text -noout

# 测试签名生成
echo -n "test data" | openssl dgst -sha256 -sign private_key.pem | base64

# 验证签名
echo -n "test data" | openssl dgst -sha256 -verify public_key.pem -signature <(echo "signature" | base64 -d)
```

## 更新日志

### v1.0.0

- 初始版本发布
- 支持 TypeScript/JavaScript 客户端
- 提供 Python 和 cURL 示例
- 完整的文档和测试用例

## 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 贡献

欢迎提交 Issue 和 Pull Request 来改进本项目。

## 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 GitHub Issue
- 发送邮件至 [email]
- 查看项目文档 [docs-url]
