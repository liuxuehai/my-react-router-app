/**
 * 签名工具使用示例
 * Example usage of signature utilities
 */

import {
  SignatureUtils,
  SignatureGenerator,
  SignatureVerifier,
  type SignatureData,
  type SupportedAlgorithm,
} from "../signature-utils";

/**
 * 客户端签名示例
 * Client-side signature generation example
 */
export async function clientSignatureExample() {
  // 示例私钥（实际使用时应该从安全存储中获取）
  const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB
wjgHm6S4KaYP+9gsr+eCYy4rF8mXADPMxCXpbOhgEQy+37+jqM6xjwwk5c5/qV1j
GT98aZf4I9gmHCGhWiF42VJbGj07qiYQVHPiYzhBnkmn43ewdVasluHkeAjRareV
w9b9nnhQY6XStGWi+APkdQrD8QxXyxtnP4DQjbVlVSjpS2qYz3d31TgHLfsgJvuU
bya+J2+eZdDxtOiI/m9w9kYGADGa4EvVt3+UuU6EYuJSATwfKMbNd1cK+Q8+iFbF
XuarrZ5k4PfgHVvBcU3YkQDpk2jXK6GGRa+Q+fTMBQGBUkMVmS2QHk4KBgGBAgMB
AAECggEBALc2lQACC8cSfh+ozSSqBQ9K1g1lxhkuCwjPfLHVh6SyxwrJR4WpM4ki
MwjqGPpODmu1cHC+7VYXh7VNK2csjHxLoj9+7-AvVfsAoGXK69p+7gqeDPdwUBLs
3+7fqIXnxFRy8DCXtK0+mEHQHQNcUdyoJFqmtrrJVtnKzpXMjMZFOw==
-----END PRIVATE KEY-----`;

  const appId = "my-app-123";
  const algorithm: SupportedAlgorithm = "RS256";

  // 创建签名生成器
  const generator = new SignatureGenerator(privateKey, algorithm, appId);

  // 为 API 请求生成签名
  const requestMethod = "POST";
  const requestPath = "/api/users";
  const requestBody = JSON.stringify({
    name: "John Doe",
    email: "john@example.com",
  });

  try {
    const signatureResult = await generator.signRequest(
      requestMethod,
      requestPath,
      requestBody
    );

    console.log("Generated signature:", {
      signature: signatureResult.signature,
      timestamp: signatureResult.timestamp,
      algorithm: signatureResult.algorithm,
      appId: appId,
    });

    // 构造请求头
    const headers = {
      "Content-Type": "application/json",
      "X-Signature": signatureResult.signature,
      "X-Timestamp": signatureResult.timestamp,
      "X-App-Id": appId,
      "X-Algorithm": signatureResult.algorithm,
    };

    console.log("Request headers:", headers);

    return {
      method: requestMethod,
      path: requestPath,
      body: requestBody,
      headers,
    };
  } catch (error) {
    console.error("Failed to generate signature:", error);
    throw error;
  }
}

/**
 * 服务端验证示例
 * Server-side signature verification example
 */
export async function serverVerificationExample(
  signature: string,
  timestamp: string,
  method: string,
  path: string,
  appId: string,
  body?: string
) {
  // 示例公钥（实际使用时应该从配置或数据库中获取）
  const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
+CPYJhwhoVoheMlSWxo9O6omEFRz4mM4QZ5Jp+N3sHVWrJbh5HgI0Wq3lcPW/Z54
UGOl0rRlovgD5HUKw/EMV8sbZz+A0I21ZVUo6UtqmM93d9U4By37ICb7lG8mvid
vnmXQ8bToiP5vcPZGBgAxmuBL1bd/lLlOhGLiUgE8HyjGzXdXCvkPPohWxV7mq62
eZOD34B1bwXFN2JEA6ZNo1yuhhkWvkPn0zAUBgVJDFZktkB5OCgYBgQIDAQAB
-----END PUBLIC KEY-----`;

  const algorithm: SupportedAlgorithm = "RS256";
  const timeWindow = 300; // 5 minutes

  // 创建签名验证器
  const verifier = new SignatureVerifier(publicKey, algorithm, timeWindow);

  try {
    const isValid = await verifier.verifyRequest(
      signature,
      timestamp,
      method,
      path,
      appId,
      body
    );

    console.log("Signature verification result:", {
      isValid,
      appId,
      timestamp,
      method,
      path,
    });

    return isValid;
  } catch (error) {
    console.error("Failed to verify signature:", error);
    return false;
  }
}

/**
 * 完整的端到端示例
 * Complete end-to-end example
 */
export async function endToEndExample() {
  console.log("=== 端到端签名验证示例 ===");

  try {
    // 1. 客户端生成签名
    console.log("\n1. 客户端生成签名...");
    const signedRequest = await clientSignatureExample();

    // 2. 服务端验证签名
    console.log("\n2. 服务端验证签名...");
    const isValid = await serverVerificationExample(
      signedRequest.headers["X-Signature"],
      signedRequest.headers["X-Timestamp"],
      signedRequest.method,
      signedRequest.path,
      signedRequest.headers["X-App-Id"],
      signedRequest.body
    );

    console.log(
      "\n3. 验证结果:",
      isValid ? "✅ 签名验证成功" : "❌ 签名验证失败"
    );

    return isValid;
  } catch (error) {
    console.error("端到端示例失败:", error);
    return false;
  }
}

/**
 * 工具函数示例
 * Utility functions example
 */
export function utilityFunctionsExample() {
  console.log("=== 工具函数示例 ===");

  // 1. 生成时间戳
  const timestamp = SignatureUtils.generateTimestamp();
  console.log("生成的时间戳:", timestamp);

  // 2. 验证时间戳
  const isValidTimestamp = SignatureUtils.validateTimestamp(timestamp, 300);
  console.log("时间戳验证结果:", isValidTimestamp);

  // 3. 检查算法支持
  const algorithms = ["RS256", "RS512", "ES256", "ES512", "HS256"];
  algorithms.forEach((alg) => {
    const isSupported = SignatureUtils.isSupportedAlgorithm(alg);
    console.log(`算法 ${alg}:`, isSupported ? "✅ 支持" : "❌ 不支持");
  });

  // 4. 构建签名数据
  const signatureData: SignatureData = {
    timestamp: timestamp,
    method: "POST",
    path: "/api/test",
    appId: "test-app",
    body: '{"test": true}',
  };

  const dataString = SignatureUtils.buildSignatureString(signatureData);
  console.log("签名数据字符串:", dataString);
}

// 导出示例函数供其他模块使用
export async function runAllExamples() {
  console.log("运行签名工具示例...\n");

  utilityFunctionsExample();

  const success = await endToEndExample();
  console.log("\n示例执行完成:", success ? "成功" : "失败");

  return success;
}
