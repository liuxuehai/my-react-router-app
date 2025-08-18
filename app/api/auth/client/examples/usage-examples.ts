/**
 * 客户端签名工具使用示例
 * Client signature tools usage examples
 */

import { SignatureClient, createSignatureClient, generateSignature, generateBatchSignatures } from '../signature-client.js';
import { SignatureUtils } from '../../signature-utils.js';

// 示例配置
const EXAMPLE_CONFIG = {
  appId: 'demo-app-123',
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wEiOfnGs+a8QQu+tHkHfzOKMQ2K4+u2NjM1SXmpjNMOLdCJ8P2bLDMaLdcmn6MMD
nTxai+b1AL9Y8yDxC5GtwV4VEKWVz+d1gddSKEgHnez6EAHjIWAnjqtVnYKB0QHu
P06+3brkmdrx6J7kd4sNVTLs+YRu5Wwzg0aTLwmXmLKtgMxS2qkXz1xZxnowkwuX
nNOYxiTw6kzMGHvqHgyxJxCBPnuTOprdGMdRHjF/oQhLDMKtYTuNskdXMmMWjseB
IV+tB2M3M8+UpgEBRBOFmfiOMXXmnAjPaP0ZtZB3N+k6+mINnNxnDqYyMXI5VRcQ
kyGVoKIFAgMBAAECggEBALc2lQAkx+hkHiitlsB+D8Q9aBiCiHRGmdHDMBOTKkI+
dm7IeJXZoAUqurEuVf2/b4o+Di0hkuaQiAuLdMKRAoGBAOm/SN+KEGCWzjVBfzfv
hc5LoP7onVwrMZBP7gjksB+naQKBgQDM4eT3f3EQEcHdxcqCAWBpnGjMAJO/+SDA
quSYtQp5O8k8s0UfS5yTJ8I5o9l0GhTKIrAPpjl5OQdlbvQhp+geZpMlMlgJ8d+v
FwJBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8iJVtb3StI7VAi
VBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgYA5OtXTTAVrjI
6k1XuQAoGBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8iJVtb3S
tI7VAiVBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgYA5OtXT
TAVrjI6k1XuQAoGBAMrpfmEtQVwcZnvsjdyHXDU1jdioVVfLniHXcSdSL4Z5NE8i
JVtb3StI7VAiVBobPVMCgYEAxCTA3Yz2vNRhg2dFQDcbp6kkbvecGdCsJuMPiSgY
A5OtXTTAVrjI6k1XuQ==
-----END PRIVATE KEY-----`,
  algorithm: 'RS256' as const,
  keyId: 'demo-key-001',
  baseUrl: 'https://api.example.com'
};

/**
 * 示例 1: 基本用法
 */
export async function basicUsageExample() {
  console.log('=== 基本用法示例 ===');
  
  // 创建签名客户端
  const client = new SignatureClient(EXAMPLE_CONFIG);
  
  try {
    // GET 请求
    console.log('发送 GET 请求...');
    const getResponse = await client.get('/api/users');
    console.log('GET 响应状态:', getResponse.status);
    
    // POST 请求
    console.log('发送 POST 请求...');
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user'
    };
    const postResponse = await client.post('/api/users', userData);
    console.log('POST 响应状态:', postResponse.status);
    
    // PUT 请求
    console.log('发送 PUT 请求...');
    const updateData = { name: 'Jane Doe' };
    const putResponse = await client.put('/api/users/123', updateData);
    console.log('PUT 响应状态:', putResponse.status);
    
    // DELETE 请求
    console.log('发送 DELETE 请求...');
    const deleteResponse = await client.delete('/api/users/123');
    console.log('DELETE 响应状态:', deleteResponse.status);
    
  } catch (error) {
    console.error('请求失败:', error);
  }
}

/**
 * 示例 2: 手动生成签名头
 */
export async function manualSignatureExample() {
  console.log('\n=== 手动生成签名头示例 ===');
  
  const client = new SignatureClient(EXAMPLE_CONFIG);
  
  try {
    // 生成签名头
    const headers = await client.generateSignatureHeaders(
      'POST',
      '/api/orders',
      JSON.stringify({ item: 'book', quantity: 2 })
    );
    
    console.log('生成的签名头:');
    console.log('X-Signature:', headers['X-Signature']);
    console.log('X-Timestamp:', headers['X-Timestamp']);
    console.log('X-App-Id:', headers['X-App-Id']);
    console.log('X-Key-Id:', headers['X-Key-Id']);
    
    // 使用生成的头发送自定义请求
    const response = await fetch('https://api.example.com/api/orders', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ item: 'book', quantity: 2 })
    });
    
    console.log('自定义请求响应状态:', response.status);
    
  } catch (error) {
    console.error('签名生成失败:', error);
  }
}

/**
 * 示例 3: 批量签名生成
 */
export async function batchSignatureExample() {
  console.log('\n=== 批量签名生成示例 ===');
  
  try {
    const requests = [
      { method: 'GET', path: '/api/users' },
      { method: 'GET', path: '/api/orders' },
      { method: 'POST', path: '/api/logs', body: JSON.stringify({ level: 'info', message: 'test' }) },
      { method: 'DELETE', path: '/api/cache' }
    ];
    
    console.log('生成批量签名...');
    const signatures = await generateBatchSignatures(EXAMPLE_CONFIG, requests);
    
    signatures.forEach((sig, index) => {
      console.log(`请求 ${index + 1} (${requests[index].method} ${requests[index].path}):`);
      console.log('  签名:', sig['X-Signature'].substring(0, 20) + '...');
      console.log('  时间戳:', sig['X-Timestamp']);
    });
    
  } catch (error) {
    console.error('批量签名生成失败:', error);
  }
}

/**
 * 示例 4: 工厂函数使用
 */
export async function factoryFunctionExample() {
  console.log('\n=== 工厂函数使用示例 ===');
  
  try {
    // 使用工厂函数创建客户端
    const client = createSignatureClient({
      appId: 'factory-app',
      privateKey: EXAMPLE_CONFIG.privateKey,
      algorithm: 'RS256',
      baseUrl: 'https://factory-api.example.com'
    });
    
    console.log('使用工厂函数创建的客户端配置:');
    const config = client.getConfig();
    console.log('App ID:', config.appId);
    console.log('Base URL:', config.baseUrl);
    console.log('Algorithm:', config.algorithm);
    
    // 使用简化的签名生成函数
    const headers = await generateSignature(
      'simple-app',
      EXAMPLE_CONFIG.privateKey,
      'RS256',
      'GET',
      '/api/simple'
    );
    
    console.log('简化函数生成的签名头:');
    console.log('X-App-Id:', headers['X-App-Id']);
    console.log('X-Signature:', headers['X-Signature'].substring(0, 20) + '...');
    
  } catch (error) {
    console.error('工厂函数示例失败:', error);
  }
}

/**
 * 示例 5: 配置管理
 */
export async function configManagementExample() {
  console.log('\n=== 配置管理示例 ===');
  
  const client = new SignatureClient(EXAMPLE_CONFIG);
  
  try {
    // 获取当前配置
    console.log('当前配置:');
    const currentConfig = client.getConfig();
    console.log('App ID:', currentConfig.appId);
    console.log('Algorithm:', currentConfig.algorithm);
    console.log('Base URL:', currentConfig.baseUrl);
    
    // 更新配置
    console.log('\n更新配置...');
    client.updateConfig({
      baseUrl: 'https://new-api.example.com',
      customHeaders: {
        'X-Client-Version': '1.0.0',
        'Accept-Language': 'zh-CN'
      }
    });
    
    // 验证配置更新
    const updatedConfig = client.getConfig();
    console.log('更新后的配置:');
    console.log('Base URL:', updatedConfig.baseUrl);
    console.log('Custom Headers:', updatedConfig.customHeaders);
    
    // 使用更新后的配置发送请求
    const headers = await client.generateSignatureHeaders('GET', '/api/test');
    console.log('包含自定义头的签名:');
    console.log('X-Client-Version:', headers['X-Client-Version']);
    console.log('Accept-Language:', headers['Accept-Language']);
    
  } catch (error) {
    console.error('配置管理示例失败:', error);
  }
}

/**
 * 示例 6: 错误处理
 */
export async function errorHandlingExample() {
  console.log('\n=== 错误处理示例 ===');
  
  try {
    // 测试无效配置
    console.log('测试无效配置...');
    try {
      const invalidClient = new SignatureClient({
        appId: '',
        privateKey: EXAMPLE_CONFIG.privateKey,
        algorithm: 'RS256'
      });
    } catch (error) {
      console.log('捕获配置错误:', (error as Error).message);
    }
    
    // 测试无效私钥
    console.log('测试无效私钥...');
    try {
      const invalidKeyClient = new SignatureClient({
        appId: 'test-app',
        privateKey: 'invalid-private-key',
        algorithm: 'RS256'
      });
    } catch (error) {
      console.log('捕获私钥错误:', (error as Error).message);
    }
    
    // 测试网络错误处理
    console.log('测试网络错误处理...');
    const client = new SignatureClient({
      ...EXAMPLE_CONFIG,
      baseUrl: 'https://non-existent-api.example.com'
    });
    
    try {
      const response = await client.get('/api/test');
      console.log('意外成功:', response.status);
    } catch (error) {
      console.log('捕获网络错误:', (error as Error).message);
    }
    
  } catch (error) {
    console.error('错误处理示例失败:', error);
  }
}

/**
 * 示例 7: 性能测试
 */
export async function performanceExample() {
  console.log('\n=== 性能测试示例 ===');
  
  const client = new SignatureClient(EXAMPLE_CONFIG);
  
  try {
    // 单次签名性能测试
    console.log('单次签名性能测试...');
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await client.generateSignatureHeaders('GET', `/api/test/${i}`);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`100次签名生成耗时: ${duration}ms`);
    console.log(`平均每次签名耗时: ${duration / 100}ms`);
    
    // 批量签名性能测试
    console.log('\n批量签名性能测试...');
    const batchStartTime = Date.now();
    
    const batchRequests = Array.from({ length: 100 }, (_, i) => ({
      method: 'GET',
      path: `/api/batch/${i}`
    }));
    
    await generateBatchSignatures(EXAMPLE_CONFIG, batchRequests);
    
    const batchEndTime = Date.now();
    const batchDuration = batchEndTime - batchStartTime;
    console.log(`批量生成100个签名耗时: ${batchDuration}ms`);
    console.log(`平均每次签名耗时: ${batchDuration / 100}ms`);
    
  } catch (error) {
    console.error('性能测试失败:', error);
  }
}

/**
 * 示例 8: 签名验证测试
 */
export async function signatureVerificationExample() {
  console.log('\n=== 签名验证测试示例 ===');
  
  const client = new SignatureClient(EXAMPLE_CONFIG);
  
  // 对应的公钥（实际使用中应该从服务端获取）
  const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcBIjn5x
rPmvEELvrR5B38zijENiuPrtjYzNUl5qYzTDi3QifD9mywzGi3XJp+jDA508Wov
m9QC/WPMg8QuRrcFeFRCllc/ndYHXUihIB53s+hAB4yFgJ46rVZ2CgdEB7j9Ovt
265JHa8eie5HeLDVUy7PmEbuVsM4NGky8Jl5iyrYDMUtqpF89cWcZ6MJMLl5zTm
MYk8OpMzBh76h4MsScQgT57kzqa3RjHUR4xf6EISwzCrWE7jbJHVzJjFo7HgSFf
rQdjNzPPlKYBAUQThZn4jjF15pwIz2j9GbWQdzfpOvpiDZzcZw6mMjFyOVUXEJM
hlaChBQIDAQAB
-----END PUBLIC KEY-----`;
  
  try {
    // 生成签名
    const method = 'POST';
    const path = '/api/verify-test';
    const body = JSON.stringify({ test: 'data', timestamp: Date.now() });
    const timestamp = SignatureUtils.generateTimestamp();
    
    const headers = await client.generateSignatureHeaders(method, path, body, timestamp);
    
    console.log('生成签名用于验证测试:');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Body:', body);
    console.log('Timestamp:', timestamp);
    console.log('Signature:', headers['X-Signature'].substring(0, 30) + '...');
    
    // 验证签名
    const signatureData = {
      timestamp,
      method,
      path,
      appId: EXAMPLE_CONFIG.appId,
      body
    };
    
    const dataString = SignatureUtils.buildSignatureString(signatureData);
    console.log('\n签名数据字符串:');
    console.log(dataString.replace(/\n/g, '\\n'));
    
    const isValid = await SignatureUtils.verifySignature(
      dataString,
      headers['X-Signature'],
      publicKey,
      EXAMPLE_CONFIG.algorithm
    );
    
    console.log('\n签名验证结果:', isValid ? '✅ 有效' : '❌ 无效');
    
    // 测试时间戳验证
    const timestampValid = SignatureUtils.validateTimestamp(timestamp, 300);
    console.log('时间戳验证结果:', timestampValid ? '✅ 有效' : '❌ 无效');
    
    // 测试过期时间戳
    const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const expiredValid = SignatureUtils.validateTimestamp(expiredTimestamp, 300);
    console.log('过期时间戳验证结果:', expiredValid ? '✅ 有效' : '❌ 无效（预期）');
    
  } catch (error) {
    console.error('签名验证测试失败:', error);
  }
}

/**
 * 示例 9: 多算法支持
 */
export async function multiAlgorithmExample() {
  console.log('\n=== 多算法支持示例 ===');
  
  const algorithms: Array<'RS256' | 'RS512'> = ['RS256', 'RS512'];
  
  for (const algorithm of algorithms) {
    try {
      console.log(`\n测试算法: ${algorithm}`);
      
      const client = new SignatureClient({
        ...EXAMPLE_CONFIG,
        algorithm
      });
      
      const headers = await client.generateSignatureHeaders('GET', '/api/algorithm-test');
      
      console.log(`${algorithm} 签名生成成功:`);
      console.log('  签名长度:', headers['X-Signature'].length);
      console.log('  签名前缀:', headers['X-Signature'].substring(0, 20) + '...');
      
    } catch (error) {
      console.error(`${algorithm} 算法测试失败:`, error);
    }
  }
}

/**
 * 示例 10: 实际应用场景
 */
export async function realWorldExample() {
  console.log('\n=== 实际应用场景示例 ===');
  
  // 模拟电商 API 客户端
  class ECommerceApiClient {
    private signatureClient: SignatureClient;
    
    constructor(config: typeof EXAMPLE_CONFIG) {
      this.signatureClient = new SignatureClient(config);
    }
    
    // 获取用户信息
    async getUser(userId: string) {
      console.log(`获取用户信息: ${userId}`);
      return this.signatureClient.get(`/api/users/${userId}`);
    }
    
    // 创建订单
    async createOrder(orderData: any) {
      console.log('创建订单:', orderData);
      return this.signatureClient.post('/api/orders', orderData);
    }
    
    // 更新订单状态
    async updateOrderStatus(orderId: string, status: string) {
      console.log(`更新订单 ${orderId} 状态为: ${status}`);
      return this.signatureClient.patch(`/api/orders/${orderId}`, { status });
    }
    
    // 获取订单列表
    async getOrders(params: { page?: number; limit?: number; status?: string } = {}) {
      const queryString = new URLSearchParams(params as any).toString();
      const path = `/api/orders${queryString ? '?' + queryString : ''}`;
      console.log('获取订单列表:', path);
      return this.signatureClient.get(path);
    }
    
    // 批量操作
    async batchOperations() {
      console.log('执行批量操作...');
      
      const operations = [
        { method: 'GET', path: '/api/users/123' },
        { method: 'GET', path: '/api/orders?status=pending' },
        { method: 'POST', path: '/api/notifications', body: JSON.stringify({ type: 'batch_start' }) }
      ];
      
      const signatures = await generateBatchSignatures(
        this.signatureClient.getConfig(),
        operations
      );
      
      console.log(`生成了 ${signatures.length} 个批量操作签名`);
      return signatures;
    }
  }
  
  try {
    // 创建电商 API 客户端
    const ecommerceClient = new ECommerceApiClient({
      ...EXAMPLE_CONFIG,
      appId: 'ecommerce-app',
      baseUrl: 'https://api.ecommerce.example.com'
    });
    
    // 模拟实际使用场景
    await ecommerceClient.getUser('user123');
    
    await ecommerceClient.createOrder({
      userId: 'user123',
      items: [
        { productId: 'prod1', quantity: 2, price: 29.99 },
        { productId: 'prod2', quantity: 1, price: 49.99 }
      ],
      shippingAddress: {
        street: '123 Main St',
        city: 'Anytown',
        zipCode: '12345'
      }
    });
    
    await ecommerceClient.updateOrderStatus('order456', 'processing');
    
    await ecommerceClient.getOrders({ page: 1, limit: 10, status: 'pending' });
    
    await ecommerceClient.batchOperations();
    
    console.log('✅ 实际应用场景示例完成');
    
  } catch (error) {
    console.error('实际应用场景示例失败:', error);
  }
}

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  console.log('🚀 开始运行客户端签名工具示例\n');
  
  const examples = [
    { name: '基本用法', fn: basicUsageExample },
    { name: '手动生成签名头', fn: manualSignatureExample },
    { name: '批量签名生成', fn: batchSignatureExample },
    { name: '工厂函数使用', fn: factoryFunctionExample },
    { name: '配置管理', fn: configManagementExample },
    { name: '错误处理', fn: errorHandlingExample },
    { name: '性能测试', fn: performanceExample },
    { name: '签名验证测试', fn: signatureVerificationExample },
    { name: '多算法支持', fn: multiAlgorithmExample },
    { name: '实际应用场景', fn: realWorldExample }
  ];
  
  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`运行示例: ${example.name}`);
      console.log(`${'='.repeat(50)}`);
      
      await example.fn();
      
      console.log(`\n✅ ${example.name} 示例完成`);
      
    } catch (error) {
      console.error(`\n❌ ${example.name} 示例失败:`, error);
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log('🎉 所有示例运行完成');
  console.log(`${'='.repeat(50)}`);
}

// 如果直接运行此文件，执行所有示例
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}