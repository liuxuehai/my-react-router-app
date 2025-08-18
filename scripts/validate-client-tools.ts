/**
 * 验证客户端签名工具实现
 * Validate client signature tools implementation
 */

import { SignatureClient, createSignatureClient, generateSignature } from '../app/api/auth/client/signature-client.js';
import { SignatureUtils } from '../app/api/auth/signature-utils.js';

// 测试配置
const TEST_CONFIG = {
  appId: 'validation-test-app',
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
  keyId: 'validation-key-001',
  baseUrl: 'https://api.validation.test'
};

async function validateClientTools() {
  console.log('🔍 开始验证客户端签名工具实现...\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, testFn: () => Promise<void> | void) {
    totalTests++;
    return testFn().then(() => {
      console.log(`✅ ${name}`);
      passedTests++;
    }).catch((error) => {
      console.log(`❌ ${name}: ${error.message}`);
    });
  }

  // 测试 1: 基本客户端创建
  await test('基本客户端创建', () => {
    const client = new SignatureClient(TEST_CONFIG);
    if (!client) throw new Error('客户端创建失败');
    
    const config = client.getConfig();
    if (config.appId !== TEST_CONFIG.appId) throw new Error('配置不匹配');
  });

  // 测试 2: 工厂函数
  await test('工厂函数创建客户端', () => {
    const client = createSignatureClient(TEST_CONFIG);
    if (!client) throw new Error('工厂函数创建失败');
  });

  // 测试 3: 配置验证
  await test('配置验证 - 缺少 App ID', () => {
    try {
      new SignatureClient({ ...TEST_CONFIG, appId: '' });
      throw new Error('应该抛出错误');
    } catch (error) {
      if (!(error as Error).message.includes('App ID is required')) {
        throw new Error('错误消息不正确');
      }
    }
  });

  // 测试 4: 配置验证 - 无效算法
  await test('配置验证 - 无效算法', () => {
    try {
      new SignatureClient({ ...TEST_CONFIG, algorithm: 'INVALID' as any });
      throw new Error('应该抛出错误');
    } catch (error) {
      if (!(error as Error).message.includes('Unsupported algorithm')) {
        throw new Error('错误消息不正确');
      }
    }
  });

  // 测试 5: 配置验证 - 无效私钥格式
  await test('配置验证 - 无效私钥格式', () => {
    try {
      new SignatureClient({ ...TEST_CONFIG, privateKey: 'invalid-key' });
      throw new Error('应该抛出错误');
    } catch (error) {
      if (!(error as Error).message.includes('Private key must be in PEM format')) {
        throw new Error('错误消息不正确');
      }
    }
  });

  // 测试 6: 配置更新
  await test('配置更新', () => {
    const client = new SignatureClient(TEST_CONFIG);
    client.updateConfig({ baseUrl: 'https://new-api.test' });
    
    const config = client.getConfig();
    if (config.baseUrl !== 'https://new-api.test') {
      throw new Error('配置更新失败');
    }
  });

  // 测试 7: 时间戳生成
  await test('时间戳生成', () => {
    const timestamp = SignatureUtils.generateTimestamp();
    if (!timestamp || !timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)) {
      throw new Error('时间戳格式不正确');
    }
  });

  // 测试 8: 时间戳验证
  await test('时间戳验证', () => {
    const validTimestamp = SignatureUtils.generateTimestamp();
    const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    if (!SignatureUtils.validateTimestamp(validTimestamp, 300)) {
      throw new Error('有效时间戳验证失败');
    }
    
    if (SignatureUtils.validateTimestamp(expiredTimestamp, 300)) {
      throw new Error('过期时间戳应该验证失败');
    }
  });

  // 测试 9: 签名数据构造
  await test('签名数据构造', () => {
    const data = {
      timestamp: '2024-01-15T10:30:00.000Z',
      method: 'POST',
      path: '/api/test',
      appId: 'test-app',
      body: '{"test":true}'
    };
    
    const signatureString = SignatureUtils.buildSignatureString(data);
    const expected = '2024-01-15T10:30:00.000Z\nPOST\n/api/test\ntest-app\n{"test":true}';
    
    if (signatureString !== expected) {
      throw new Error('签名数据构造不正确');
    }
  });

  // 测试 10: 算法支持检查
  await test('算法支持检查', () => {
    if (!SignatureUtils.isSupportedAlgorithm('RS256')) {
      throw new Error('RS256 应该被支持');
    }
    
    if (SignatureUtils.isSupportedAlgorithm('INVALID' as any)) {
      throw new Error('无效算法不应该被支持');
    }
  });

  // 测试 11: 文件存在性检查
  await test('客户端文件存在', async () => {
    try {
      await import('../app/api/auth/client/signature-client.js');
    } catch (error) {
      throw new Error('客户端文件不存在或无法导入');
    }
  });

  // 测试 12: 示例文件存在
  await test('示例文件存在', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const exampleFiles = [
      'app/api/auth/client/examples/javascript-example.js',
      'app/api/auth/client/examples/python-example.py',
      'app/api/auth/client/examples/curl-example.sh',
      'app/api/auth/client/examples/usage-examples.ts'
    ];
    
    for (const file of exampleFiles) {
      if (!fs.existsSync(file)) {
        throw new Error(`示例文件不存在: ${file}`);
      }
    }
  });

  // 测试 13: 文档文件存在
  await test('文档文件存在', async () => {
    const fs = await import('fs');
    
    if (!fs.existsSync('app/api/auth/client/README.md')) {
      throw new Error('README.md 文件不存在');
    }
  });

  // 测试 14: 测试文件存在
  await test('测试文件存在', async () => {
    const fs = await import('fs');
    
    const testFiles = [
      'tests/unit/auth/client/signature-client.test.ts',
      'tests/integration/auth/client-server-integration.test.ts'
    ];
    
    for (const file of testFiles) {
      if (!fs.existsSync(file)) {
        throw new Error(`测试文件不存在: ${file}`);
      }
    }
  });

  // 输出结果
  console.log(`\n📊 验证结果: ${passedTests}/${totalTests} 测试通过`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有验证测试通过！客户端签名工具实现完成。');
    return true;
  } else {
    console.log('⚠️  部分测试失败，请检查实现。');
    return false;
  }
}

// 运行验证
if (import.meta.url === `file://${process.argv[1]}`) {
  validateClientTools()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('验证过程出错:', error);
      process.exit(1);
    });
}

export { validateClientTools };