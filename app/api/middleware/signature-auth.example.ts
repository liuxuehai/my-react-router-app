/**
 * 签名验证中间件使用示例
 * Example usage of signature authentication middleware
 */

import { Hono } from 'hono';
import { createSignatureAuth } from './signature-auth.js';
import { createKeyManager } from '../auth/key-manager.js';

// Define the context variables type for better type safety
type Variables = {
  signatureAuth: {
    appId: string;
    keyId: string;
    algorithm: string;
    timestamp: string;
    verified: boolean;
  };
};

// 创建 Hono 应用实例
const app = new Hono<{ Variables: Variables }>();

// 创建密钥管理器
const keyManager = createKeyManager({
  storageType: 'env',
  cacheExpiry: 300,
  enableCache: true,
  debug: true
});

// 配置签名验证中间件
const signatureAuthMiddleware = createSignatureAuth(keyManager, {
  timeWindowSeconds: 300, // 5分钟时间窗口
  debug: true,
  skipPaths: [
    '/health',           // 健康检查端点
    '/api/public',       // 公共API端点
    /^\/static\//        // 静态资源路径
  ],
  // 自定义错误处理
  onError: async (error, c) => {
    console.error('Signature auth error:', error);
    
    // Map error status codes to Hono-compatible status codes
    const statusCode = error.statusCode === 400 ? 400 : 
                      error.statusCode === 401 ? 401 : 
                      error.statusCode === 403 ? 403 : 500;
    
    return c.json({
      error: 'Authentication failed',
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString()
    }, statusCode);
  }
});

// 应用中间件到所有路由
app.use('*', signatureAuthMiddleware);

// 示例路由 - 需要签名验证
app.get('/api/protected', (c) => {
  const authInfo = c.get('signatureAuth');
  
  return c.json({
    message: 'Access granted to protected resource',
    authentication: authInfo,
    timestamp: new Date().toISOString()
  });
});

// 示例路由 - 处理POST请求
app.post('/api/data', async (c) => {
  const authInfo = c.get('signatureAuth');
  const body = await c.req.json();
  
  return c.json({
    message: 'Data received successfully',
    authentication: authInfo,
    receivedData: body,
    timestamp: new Date().toISOString()
  });
});

// 公共路由 - 不需要签名验证
app.get('/api/public/info', (c) => {
  return c.json({
    message: 'This is a public endpoint',
    timestamp: new Date().toISOString()
  });
});

// 健康检查 - 不需要签名验证
app.get('/health', (c) => {
  return c.text('OK');
});

export default app;

/**
 * 客户端请求示例
 * 
 * 需要的请求头：
 * - X-Signature: 使用私钥生成的签名
 * - X-Timestamp: ISO 8601 格式的时间戳
 * - X-App-Id: 应用ID
 * - X-Key-Id: 密钥ID（可选，默认使用 'default'）
 * 
 * 示例请求：
 * ```
 * curl -X GET "https://api.example.com/api/protected" \
 *   -H "X-Signature: <generated-signature>" \
 *   -H "X-Timestamp: 2024-01-01T12:00:00.000Z" \
 *   -H "X-App-Id: my-app-id" \
 *   -H "X-Key-Id: default"
 * ```
 * 
 * 签名生成过程：
 * 1. 构建签名字符串：{timestamp}\n{method}\n{path}\n{appId}\n{body}
 * 2. 使用私钥和指定算法对签名字符串进行签名
 * 3. 将签名结果进行 Base64 编码
 */