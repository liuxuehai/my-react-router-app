# 客户端集成示例代码

## 概述

本文档提供各种编程语言和平台的 API 签名认证客户端集成示例，包括完整的实现代码、使用方法和最佳实践。

## Node.js / TypeScript

### 基础实现

```typescript
import crypto from 'crypto';
import fetch from 'node-fetch';

interface SignatureConfig {
  appId: string;
  privateKey: string;
  keyId?: string;
  algorithm?: 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
  timeWindow?: number;
}

interface RequestOptions {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiSignatureClient {
  private config: Required<SignatureConfig>;

  constructor(config: SignatureConfig) {
    this.config = {
      algorithm: 'RS256',
      timeWindow: 300,
      ...config
    };
  }

  /**
   * 构造签名数据字符串
   */
  private buildSignatureString(
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): string {
    return [
      timestamp,
      method.toUpperCase(),
      path,
      this.config.appId,
      body || ''
    ].join('\n');
  }

  /**
   * 生成数字签名
   */
  private generateSignature(data: string): string {
    const algorithmMap: Record<string, string> = {
      'RS256': 'sha256',
      'RS384': 'sha384',
      'RS512': 'sha512',
      'ES256': 'sha256',
      'ES384': 'sha384',
      'ES512': 'sha512'
    };

    const hashAlgorithm = algorithmMap[this.config.algorithm];
    const sign = crypto.createSign(hashAlgorithm);
    sign.update(data, 'utf8');
    return sign.sign(this.config.privateKey, 'base64');
  }

  /**
   * 发送签名请求
   */
  async request(options: RequestOptions): Promise<Response> {
    const timestamp = new Date().toISOString();
    const url = new URL(options.url);
    const path = url.pathname + url.search;
    const bodyString = options.body ? JSON.stringify(options.body) : undefined;

    // 构造签名数据
    const signatureData = this.buildSignatureString(
      timestamp,
      options.method,
      path,
      bodyString
    );

    // 生成签名
    const signature = this.generateSignature(signatureData);

    // 构造请求头
    const headers: Record<string, string> = {
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'X-App-Id': this.config.appId,
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.config.keyId) {
      headers['X-Key-Id'] = this.config.keyId;
    }

    return fetch(options.url, {
      method: options.method,
      headers,
      body: bodyString
    });
  }

  /**
   * GET 请求
   */
  async get(url: string, headers?: Record<string, string>): Promise<Response> {
    return this.request({ method: 'GET', url, headers });
  }

  /**
   * POST 请求
   */
  async post(
    url: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<Response> {
    return this.request({ method: 'POST', url, body, headers });
  }

  /**
   * PUT 请求
   */
  async put(
    url: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<Response> {
    return this.request({ method: 'PUT', url, body, headers });
  }

  /**
   * DELETE 请求
   */
  async delete(url: string, headers?: Record<string, string>): Promise<Response> {
    return this.request({ method: 'DELETE', url, headers });
  }
}

// 使用示例
const client = new ApiSignatureClient({
  appId: 'my-app-123',
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`,
  keyId: 'key-1',
  algorithm: 'RS256'
});

// 发送请求
const response = await client.post('/api/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

const result = await response.json();
console.log(result);
```

### 高级功能

```typescript
// 支持重试和错误处理的增强版客户端
class EnhancedApiSignatureClient extends ApiSignatureClient {
  private retryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    retryOn: [408, 429, 500, 502, 503, 504]
  };

  /**
   * 带重试的请求
   */
  async requestWithRetry(options: RequestOptions): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.request(options);
        
        // 检查是否需要重试
        if (this.retryConfig.retryOn.includes(response.status) && attempt < this.retryConfig.maxRetries) {
          await this.delay(this.retryConfig.retryDelay * Math.pow(2, attempt));
          continue;
        }
        
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryConfig.maxRetries) {
          await this.delay(this.retryConfig.retryDelay * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 批量请求
   */
  async batchRequest(requests: RequestOptions[]): Promise<Response[]> {
    const promises = requests.map(request => this.requestWithRetry(request));
    return Promise.all(promises);
  }
}
```

## Python

### 基础实现

```python
import json
import base64
import hashlib
from datetime import datetime, timezone
from urllib.parse import urlparse
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec, padding
import requests

class ApiSignatureClient:
    def __init__(self, app_id, private_key_pem, key_id=None, algorithm='RS256'):
        self.app_id = app_id
        self.key_id = key_id
        self.algorithm = algorithm
        
        # 加载私钥
        self.private_key = serialization.load_pem_private_key(
            private_key_pem.encode() if isinstance(private_key_pem, str) else private_key_pem,
            password=None
        )
        
        # 算法映射
        self.hash_algorithms = {
            'RS256': hashes.SHA256(),
            'RS384': hashes.SHA384(),
            'RS512': hashes.SHA512(),
            'ES256': hashes.SHA256(),
            'ES384': hashes.SHA384(),
            'ES512': hashes.SHA512()
        }

    def _build_signature_string(self, timestamp, method, path, body=None):
        """构造签名数据字符串"""
        return '\n'.join([
            timestamp,
            method.upper(),
            path,
            self.app_id,
            body or ''
        ])

    def _generate_signature(self, data):
        """生成数字签名"""
        data_bytes = data.encode('utf-8')
        hash_algorithm = self.hash_algorithms[self.algorithm]
        
        if isinstance(self.private_key, rsa.RSAPrivateKey):
            # RSA 签名
            signature = self.private_key.sign(
                data_bytes,
                padding.PKCS1v15(),
                hash_algorithm
            )
        elif isinstance(self.private_key, ec.EllipticCurvePrivateKey):
            # ECDSA 签名
            signature = self.private_key.sign(
                data_bytes,
                ec.ECDSA(hash_algorithm)
            )
        else:
            raise ValueError(f"Unsupported key type: {type(self.private_key)}")
        
        return base64.b64encode(signature).decode('utf-8')

    def request(self, method, url, data=None, headers=None):
        """发送签名请求"""
        timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        
        # 解析 URL
        parsed_url = urlparse(url)
        path = parsed_url.path + (f'?{parsed_url.query}' if parsed_url.query else '')
        
        # 准备请求体
        body_string = json.dumps(data) if data else None
        
        # 构造签名数据
        signature_data = self._build_signature_string(
            timestamp, method, path, body_string
        )
        
        # 生成签名
        signature = self._generate_signature(signature_data)
        
        # 构造请求头
        request_headers = {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-App-Id': self.app_id,
            'Content-Type': 'application/json'
        }
        
        if self.key_id:
            request_headers['X-Key-Id'] = self.key_id
            
        if headers:
            request_headers.update(headers)
        
        return requests.request(
            method,
            url,
            headers=request_headers,
            json=data
        )

    def get(self, url, headers=None):
        """GET 请求"""
        return self.request('GET', url, headers=headers)

    def post(self, url, data=None, headers=None):
        """POST 请求"""
        return self.request('POST', url, data=data, headers=headers)

    def put(self, url, data=None, headers=None):
        """PUT 请求"""
        return self.request('PUT', url, data=data, headers=headers)

    def delete(self, url, headers=None):
        """DELETE 请求"""
        return self.request('DELETE', url, headers=headers)

# 使用示例
private_key_pem = """-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"""

client = ApiSignatureClient(
    app_id='my-app-123',
    private_key_pem=private_key_pem,
    key_id='key-1',
    algorithm='RS256'
)

# 发送请求
response = client.post('/api/users', {
    'name': 'John Doe',
    'email': 'john@example.com'
})

print(response.status_code)
print(response.json())
```

### 异步版本

```python
import asyncio
import aiohttp
from typing import Optional, Dict, Any

class AsyncApiSignatureClient(ApiSignatureClient):
    def __init__(self, app_id, private_key_pem, key_id=None, algorithm='RS256'):
        super().__init__(app_id, private_key_pem, key_id, algorithm)
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def request(self, method: str, url: str, data: Optional[Dict[str, Any]] = None, 
                     headers: Optional[Dict[str, str]] = None) -> aiohttp.ClientResponse:
        """异步发送签名请求"""
        if not self.session:
            raise RuntimeError("Client not initialized. Use 'async with' statement.")
        
        timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        
        # 解析 URL
        parsed_url = urlparse(url)
        path = parsed_url.path + (f'?{parsed_url.query}' if parsed_url.query else '')
        
        # 准备请求体
        body_string = json.dumps(data) if data else None
        
        # 构造签名数据
        signature_data = self._build_signature_string(
            timestamp, method, path, body_string
        )
        
        # 生成签名
        signature = self._generate_signature(signature_data)
        
        # 构造请求头
        request_headers = {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-App-Id': self.app_id,
            'Content-Type': 'application/json'
        }
        
        if self.key_id:
            request_headers['X-Key-Id'] = self.key_id
            
        if headers:
            request_headers.update(headers)
        
        return await self.session.request(
            method,
            url,
            headers=request_headers,
            json=data
        )

# 使用示例
async def main():
    async with AsyncApiSignatureClient(
        app_id='my-app-123',
        private_key_pem=private_key_pem,
        key_id='key-1'
    ) as client:
        response = await client.request('POST', '/api/users', {
            'name': 'John Doe',
            'email': 'john@example.com'
        })
        
        result = await response.json()
        print(result)

asyncio.run(main())
```

## Java

### 基础实现

```java
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;

public class ApiSignatureClient {
    private final String appId;
    private final String keyId;
    private final PrivateKey privateKey;
    private final String algorithm;
    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;

    public ApiSignatureClient(String appId, String privateKeyPem, String keyId, String algorithm) 
            throws Exception {
        this.appId = appId;
        this.keyId = keyId;
        this.algorithm = algorithm != null ? algorithm : "RS256";
        this.privateKey = loadPrivateKey(privateKeyPem);
        this.httpClient = new OkHttpClient();
        this.objectMapper = new ObjectMapper();
    }

    private PrivateKey loadPrivateKey(String privateKeyPem) throws Exception {
        String privateKeyContent = privateKeyPem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");

        byte[] keyBytes = Base64.getDecoder().decode(privateKeyContent);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(keyBytes);
        
        KeyFactory keyFactory;
        if (algorithm.startsWith("RS")) {
            keyFactory = KeyFactory.getInstance("RSA");
        } else if (algorithm.startsWith("ES")) {
            keyFactory = KeyFactory.getInstance("EC");
        } else {
            throw new IllegalArgumentException("Unsupported algorithm: " + algorithm);
        }
        
        return keyFactory.generatePrivate(keySpec);
    }

    private String buildSignatureString(String timestamp, String method, String path, String body) {
        return String.join("\n", 
            timestamp,
            method.toUpperCase(),
            path,
            appId,
            body != null ? body : ""
        );
    }

    private String generateSignature(String data) throws Exception {
        String javaAlgorithm;
        switch (algorithm) {
            case "RS256": javaAlgorithm = "SHA256withRSA"; break;
            case "RS384": javaAlgorithm = "SHA384withRSA"; break;
            case "RS512": javaAlgorithm = "SHA512withRSA"; break;
            case "ES256": javaAlgorithm = "SHA256withECDSA"; break;
            case "ES384": javaAlgorithm = "SHA384withECDSA"; break;
            case "ES512": javaAlgorithm = "SHA512withECDSA"; break;
            default: throw new IllegalArgumentException("Unsupported algorithm: " + algorithm);
        }

        Signature signature = Signature.getInstance(javaAlgorithm);
        signature.initSign(privateKey);
        signature.update(data.getBytes(StandardCharsets.UTF_8));
        
        return Base64.getEncoder().encodeToString(signature.sign());
    }

    public Response request(String method, String url, Object body, Map<String, String> headers) 
            throws Exception {
        String timestamp = Instant.now().toString();
        
        // 解析 URL
        HttpUrl httpUrl = HttpUrl.parse(url);
        if (httpUrl == null) {
            throw new IllegalArgumentException("Invalid URL: " + url);
        }
        
        String path = httpUrl.encodedPath();
        if (httpUrl.encodedQuery() != null) {
            path += "?" + httpUrl.encodedQuery();
        }

        // 准备请求体
        String bodyString = null;
        RequestBody requestBody = null;
        if (body != null) {
            bodyString = objectMapper.writeValueAsString(body);
            requestBody = RequestBody.create(bodyString, MediaType.get("application/json"));
        }

        // 构造签名数据
        String signatureData = buildSignatureString(timestamp, method, path, bodyString);
        
        // 生成签名
        String signature = generateSignature(signatureData);

        // 构造请求
        Request.Builder requestBuilder = new Request.Builder()
                .url(url)
                .addHeader("X-Signature", signature)
                .addHeader("X-Timestamp", timestamp)
                .addHeader("X-App-Id", appId)
                .addHeader("Content-Type", "application/json");

        if (keyId != null) {
            requestBuilder.addHeader("X-Key-Id", keyId);
        }

        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                requestBuilder.addHeader(entry.getKey(), entry.getValue());
            }
        }

        switch (method.toUpperCase()) {
            case "GET":
                requestBuilder.get();
                break;
            case "POST":
                requestBuilder.post(requestBody != null ? requestBody : RequestBody.create("", null));
                break;
            case "PUT":
                requestBuilder.put(requestBody != null ? requestBody : RequestBody.create("", null));
                break;
            case "DELETE":
                requestBuilder.delete();
                break;
            default:
                throw new IllegalArgumentException("Unsupported method: " + method);
        }

        return httpClient.newCall(requestBuilder.build()).execute();
    }

    public Response get(String url) throws Exception {
        return request("GET", url, null, null);
    }

    public Response post(String url, Object body) throws Exception {
        return request("POST", url, body, null);
    }

    public Response put(String url, Object body) throws Exception {
        return request("PUT", url, body, null);
    }

    public Response delete(String url) throws Exception {
        return request("DELETE", url, null, null);
    }
}

// 使用示例
public class Example {
    public static void main(String[] args) throws Exception {
        String privateKeyPem = """
            -----BEGIN PRIVATE KEY-----
            MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
            -----END PRIVATE KEY-----
            """;

        ApiSignatureClient client = new ApiSignatureClient(
            "my-app-123",
            privateKeyPem,
            "key-1",
            "RS256"
        );

        Map<String, Object> userData = new HashMap<>();
        userData.put("name", "John Doe");
        userData.put("email", "john@example.com");

        Response response = client.post("https://api.example.com/users", userData);
        System.out.println(response.body().string());
    }
}
```

## Go

### 基础实现

```go
package main

import (
    "bytes"
    "crypto"
    "crypto/rand"
    "crypto/rsa"
    "crypto/sha256"
    "crypto/x509"
    "encoding/base64"
    "encoding/json"
    "encoding/pem"
    "fmt"
    "io"
    "net/http"
    "net/url"
    "strings"
    "time"
)

type ApiSignatureClient struct {
    AppID      string
    KeyID      string
    PrivateKey crypto.PrivateKey
    Algorithm  string
    HTTPClient *http.Client
}

type RequestOptions struct {
    Method  string
    URL     string
    Body    interface{}
    Headers map[string]string
}

func NewApiSignatureClient(appID, privateKeyPEM, keyID, algorithm string) (*ApiSignatureClient, error) {
    if algorithm == "" {
        algorithm = "RS256"
    }

    privateKey, err := parsePrivateKey(privateKeyPEM)
    if err != nil {
        return nil, fmt.Errorf("failed to parse private key: %w", err)
    }

    return &ApiSignatureClient{
        AppID:      appID,
        KeyID:      keyID,
        PrivateKey: privateKey,
        Algorithm:  algorithm,
        HTTPClient: &http.Client{Timeout: 30 * time.Second},
    }, nil
}

func parsePrivateKey(privateKeyPEM string) (crypto.PrivateKey, error) {
    block, _ := pem.Decode([]byte(privateKeyPEM))
    if block == nil {
        return nil, fmt.Errorf("failed to decode PEM block")
    }

    privateKey, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("failed to parse private key: %w", err)
    }

    return privateKey, nil
}

func (c *ApiSignatureClient) buildSignatureString(timestamp, method, path, body string) string {
    parts := []string{
        timestamp,
        strings.ToUpper(method),
        path,
        c.AppID,
        body,
    }
    return strings.Join(parts, "\n")
}

func (c *ApiSignatureClient) generateSignature(data string) (string, error) {
    var hash crypto.Hash
    switch c.Algorithm {
    case "RS256":
        hash = crypto.SHA256
    case "RS384":
        hash = crypto.SHA384
    case "RS512":
        hash = crypto.SHA512
    default:
        return "", fmt.Errorf("unsupported algorithm: %s", c.Algorithm)
    }

    hasher := hash.New()
    hasher.Write([]byte(data))
    hashed := hasher.Sum(nil)

    switch privateKey := c.PrivateKey.(type) {
    case *rsa.PrivateKey:
        signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, hash, hashed)
        if err != nil {
            return "", fmt.Errorf("failed to sign data: %w", err)
        }
        return base64.StdEncoding.EncodeToString(signature), nil
    default:
        return "", fmt.Errorf("unsupported private key type: %T", privateKey)
    }
}

func (c *ApiSignatureClient) Request(options RequestOptions) (*http.Response, error) {
    timestamp := time.Now().UTC().Format(time.RFC3339)

    // 解析 URL
    parsedURL, err := url.Parse(options.URL)
    if err != nil {
        return nil, fmt.Errorf("invalid URL: %w", err)
    }

    path := parsedURL.Path
    if parsedURL.RawQuery != "" {
        path += "?" + parsedURL.RawQuery
    }

    // 准备请求体
    var bodyString string
    var bodyReader io.Reader
    if options.Body != nil {
        bodyBytes, err := json.Marshal(options.Body)
        if err != nil {
            return nil, fmt.Errorf("failed to marshal body: %w", err)
        }
        bodyString = string(bodyBytes)
        bodyReader = bytes.NewReader(bodyBytes)
    }

    // 构造签名数据
    signatureData := c.buildSignatureString(timestamp, options.Method, path, bodyString)

    // 生成签名
    signature, err := c.generateSignature(signatureData)
    if err != nil {
        return nil, fmt.Errorf("failed to generate signature: %w", err)
    }

    // 创建请求
    req, err := http.NewRequest(options.Method, options.URL, bodyReader)
    if err != nil {
        return nil, fmt.Errorf("failed to create request: %w", err)
    }

    // 设置请求头
    req.Header.Set("X-Signature", signature)
    req.Header.Set("X-Timestamp", timestamp)
    req.Header.Set("X-App-Id", c.AppID)
    req.Header.Set("Content-Type", "application/json")

    if c.KeyID != "" {
        req.Header.Set("X-Key-Id", c.KeyID)
    }

    for key, value := range options.Headers {
        req.Header.Set(key, value)
    }

    return c.HTTPClient.Do(req)
}

func (c *ApiSignatureClient) Get(url string, headers map[string]string) (*http.Response, error) {
    return c.Request(RequestOptions{
        Method:  "GET",
        URL:     url,
        Headers: headers,
    })
}

func (c *ApiSignatureClient) Post(url string, body interface{}, headers map[string]string) (*http.Response, error) {
    return c.Request(RequestOptions{
        Method:  "POST",
        URL:     url,
        Body:    body,
        Headers: headers,
    })
}

func (c *ApiSignatureClient) Put(url string, body interface{}, headers map[string]string) (*http.Response, error) {
    return c.Request(RequestOptions{
        Method:  "PUT",
        URL:     url,
        Body:    body,
        Headers: headers,
    })
}

func (c *ApiSignatureClient) Delete(url string, headers map[string]string) (*http.Response, error) {
    return c.Request(RequestOptions{
        Method:  "DELETE",
        URL:     url,
        Headers: headers,
    })
}

// 使用示例
func main() {
    privateKeyPEM := `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`

    client, err := NewApiSignatureClient(
        "my-app-123",
        privateKeyPEM,
        "key-1",
        "RS256",
    )
    if err != nil {
        panic(err)
    }

    userData := map[string]interface{}{
        "name":  "John Doe",
        "email": "john@example.com",
    }

    response, err := client.Post("https://api.example.com/users", userData, nil)
    if err != nil {
        panic(err)
    }
    defer response.Body.Close()

    body, err := io.ReadAll(response.Body)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Status: %d\n", response.StatusCode)
    fmt.Printf("Body: %s\n", string(body))
}
```

## PHP

### 基础实现

```php
<?php

class ApiSignatureClient {
    private $appId;
    private $keyId;
    private $privateKey;
    private $algorithm;
    private $httpClient;

    public function __construct($appId, $privateKeyPem, $keyId = null, $algorithm = 'RS256') {
        $this->appId = $appId;
        $this->keyId = $keyId;
        $this->algorithm = $algorithm;
        $this->privateKey = openssl_pkey_get_private($privateKeyPem);
        
        if (!$this->privateKey) {
            throw new Exception('Failed to load private key: ' . openssl_error_string());
        }
        
        $this->httpClient = new \GuzzleHttp\Client([
            'timeout' => 30,
            'verify' => true
        ]);
    }

    private function buildSignatureString($timestamp, $method, $path, $body = null) {
        return implode("\n", [
            $timestamp,
            strtoupper($method),
            $path,
            $this->appId,
            $body ?: ''
        ]);
    }

    private function generateSignature($data) {
        $algorithmMap = [
            'RS256' => OPENSSL_ALGO_SHA256,
            'RS384' => OPENSSL_ALGO_SHA384,
            'RS512' => OPENSSL_ALGO_SHA512
        ];

        if (!isset($algorithmMap[$this->algorithm])) {
            throw new Exception('Unsupported algorithm: ' . $this->algorithm);
        }

        $signature = '';
        $success = openssl_sign($data, $signature, $this->privateKey, $algorithmMap[$this->algorithm]);
        
        if (!$success) {
            throw new Exception('Failed to generate signature: ' . openssl_error_string());
        }

        return base64_encode($signature);
    }

    public function request($method, $url, $body = null, $headers = []) {
        $timestamp = gmdate('Y-m-d\TH:i:s\Z');
        
        // 解析 URL
        $parsedUrl = parse_url($url);
        $path = $parsedUrl['path'];
        if (isset($parsedUrl['query'])) {
            $path .= '?' . $parsedUrl['query'];
        }

        // 准备请求体
        $bodyString = null;
        if ($body !== null) {
            $bodyString = json_encode($body);
        }

        // 构造签名数据
        $signatureData = $this->buildSignatureString($timestamp, $method, $path, $bodyString);
        
        // 生成签名
        $signature = $this->generateSignature($signatureData);

        // 构造请求头
        $requestHeaders = array_merge([
            'X-Signature' => $signature,
            'X-Timestamp' => $timestamp,
            'X-App-Id' => $this->appId,
            'Content-Type' => 'application/json'
        ], $headers);

        if ($this->keyId) {
            $requestHeaders['X-Key-Id'] = $this->keyId;
        }

        // 发送请求
        $options = [
            'headers' => $requestHeaders
        ];

        if ($bodyString) {
            $options['body'] = $bodyString;
        }

        return $this->httpClient->request($method, $url, $options);
    }

    public function get($url, $headers = []) {
        return $this->request('GET', $url, null, $headers);
    }

    public function post($url, $body = null, $headers = []) {
        return $this->request('POST', $url, $body, $headers);
    }

    public function put($url, $body = null, $headers = []) {
        return $this->request('PUT', $url, $body, $headers);
    }

    public function delete($url, $headers = []) {
        return $this->request('DELETE', $url, null, $headers);
    }

    public function __destruct() {
        if ($this->privateKey) {
            openssl_pkey_free($this->privateKey);
        }
    }
}

// 使用示例
$privateKeyPem = '-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----';

try {
    $client = new ApiSignatureClient(
        'my-app-123',
        $privateKeyPem,
        'key-1',
        'RS256'
    );

    $userData = [
        'name' => 'John Doe',
        'email' => 'john@example.com'
    ];

    $response = $client->post('https://api.example.com/users', $userData);
    
    echo "Status: " . $response->getStatusCode() . "\n";
    echo "Body: " . $response->getBody() . "\n";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
```

## JavaScript (浏览器)

### 基础实现

```javascript
class ApiSignatureClient {
    constructor(appId, privateKey, keyId = null, algorithm = 'RS256') {
        this.appId = appId;
        this.keyId = keyId;
        this.privateKey = privateKey; // CryptoKey object
        this.algorithm = algorithm;
    }

    /**
     * 从 PEM 格式导入私钥
     */
    static async importPrivateKey(privateKeyPem, algorithm = 'RS256') {
        // 清理 PEM 格式
        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        const pemContents = privateKeyPem
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');

        // 解码 base64
        const binaryDer = atob(pemContents);
        const keyData = new Uint8Array(binaryDer.length);
        for (let i = 0; i < binaryDer.length; i++) {
            keyData[i] = binaryDer.charCodeAt(i);
        }

        // 导入密钥
        const algorithmMap = {
            'RS256': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            'RS384': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
            'RS512': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }
        };

        return await crypto.subtle.importKey(
            'pkcs8',
            keyData,
            algorithmMap[algorithm],
            false,
            ['sign']
        );
    }

    buildSignatureString(timestamp, method, path, body = null) {
        return [
            timestamp,
            method.toUpperCase(),
            path,
            this.appId,
            body || ''
        ].join('\n');
    }

    async generateSignature(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);

        const algorithmMap = {
            'RS256': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            'RS384': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' },
            'RS512': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }
        };

        const signature = await crypto.subtle.sign(
            algorithmMap[this.algorithm],
            this.privateKey,
            dataBuffer
        );

        // 转换为 base64
        const signatureArray = new Uint8Array(signature);
        const signatureString = btoa(String.fromCharCode(...signatureArray));
        
        return signatureString;
    }

    async request(method, url, body = null, headers = {}) {
        const timestamp = new Date().toISOString();

        // 解析 URL
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;

        // 准备请求体
        const bodyString = body ? JSON.stringify(body) : null;

        // 构造签名数据
        const signatureData = this.buildSignatureString(timestamp, method, path, bodyString);

        // 生成签名
        const signature = await this.generateSignature(signatureData);

        // 构造请求头
        const requestHeaders = {
            'X-Signature': signature,
            'X-Timestamp': timestamp,
            'X-App-Id': this.appId,
            'Content-Type': 'application/json',
            ...headers
        };

        if (this.keyId) {
            requestHeaders['X-Key-Id'] = this.keyId;
        }

        // 发送请求
        const requestOptions = {
            method,
            headers: requestHeaders
        };

        if (bodyString) {
            requestOptions.body = bodyString;
        }

        return fetch(url, requestOptions);
    }

    async get(url, headers = {}) {
        return this.request('GET', url, null, headers);
    }

    async post(url, body = null, headers = {}) {
        return this.request('POST', url, body, headers);
    }

    async put(url, body = null, headers = {}) {
        return this.request('PUT', url, body, headers);
    }

    async delete(url, headers = {}) {
        return this.request('DELETE', url, null, headers);
    }
}

// 使用示例
async function example() {
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`;

    try {
        // 导入私钥
        const privateKey = await ApiSignatureClient.importPrivateKey(privateKeyPem, 'RS256');

        // 创建客户端
        const client = new ApiSignatureClient('my-app-123', privateKey, 'key-1', 'RS256');

        // 发送请求
        const response = await client.post('/api/users', {
            name: 'John Doe',
            email: 'john@example.com'
        });

        const result = await response.json();
        console.log(result);
    } catch (error) {
        console.error('Error:', error);
    }
}

example();
```

## C#

### 基础实现

```csharp
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class ApiSignatureClient : IDisposable
{
    private readonly string _appId;
    private readonly string _keyId;
    private readonly RSA _privateKey;
    private readonly string _algorithm;
    private readonly HttpClient _httpClient;

    public ApiSignatureClient(string appId, string privateKeyPem, string keyId = null, string algorithm = "RS256")
    {
        _appId = appId;
        _keyId = keyId;
        _algorithm = algorithm;
        _privateKey = LoadPrivateKey(privateKeyPem);
        _httpClient = new HttpClient();
    }

    private RSA LoadPrivateKey(string privateKeyPem)
    {
        var rsa = RSA.Create();
        
        // 清理 PEM 格式
        var privateKeyContent = privateKeyPem
            .Replace("-----BEGIN PRIVATE KEY-----", "")
            .Replace("-----END PRIVATE KEY-----", "")
            .Replace("\n", "")
            .Replace("\r", "");

        var keyBytes = Convert.FromBase64String(privateKeyContent);
        rsa.ImportPkcs8PrivateKey(keyBytes, out _);
        
        return rsa;
    }

    private string BuildSignatureString(string timestamp, string method, string path, string body = null)
    {
        return string.Join("\n", new[]
        {
            timestamp,
            method.ToUpper(),
            path,
            _appId,
            body ?? ""
        });
    }

    private string GenerateSignature(string data)
    {
        var dataBytes = Encoding.UTF8.GetBytes(data);
        
        HashAlgorithmName hashAlgorithm = _algorithm switch
        {
            "RS256" => HashAlgorithmName.SHA256,
            "RS384" => HashAlgorithmName.SHA384,
            "RS512" => HashAlgorithmName.SHA512,
            _ => throw new ArgumentException($"Unsupported algorithm: {_algorithm}")
        };

        var signature = _privateKey.SignData(dataBytes, hashAlgorithm, RSASignaturePadding.Pkcs1);
        return Convert.ToBase64String(signature);
    }

    public async Task<HttpResponseMessage> RequestAsync(string method, string url, object body = null, Dictionary<string, string> headers = null)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        
        // 解析 URL
        var uri = new Uri(url);
        var path = uri.PathAndQuery;

        // 准备请求体
        string bodyString = null;
        HttpContent content = null;
        if (body != null)
        {
            bodyString = JsonSerializer.Serialize(body);
            content = new StringContent(bodyString, Encoding.UTF8, "application/json");
        }

        // 构造签名数据
        var signatureData = BuildSignatureString(timestamp, method, path, bodyString);
        
        // 生成签名
        var signature = GenerateSignature(signatureData);

        // 创建请求
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        
        // 设置请求头
        request.Headers.Add("X-Signature", signature);
        request.Headers.Add("X-Timestamp", timestamp);
        request.Headers.Add("X-App-Id", _appId);

        if (!string.IsNullOrEmpty(_keyId))
        {
            request.Headers.Add("X-Key-Id", _keyId);
        }

        if (headers != null)
        {
            foreach (var header in headers)
            {
                request.Headers.Add(header.Key, header.Value);
            }
        }

        if (content != null)
        {
            request.Content = content;
        }

        return await _httpClient.SendAsync(request);
    }

    public async Task<HttpResponseMessage> GetAsync(string url, Dictionary<string, string> headers = null)
    {
        return await RequestAsync("GET", url, null, headers);
    }

    public async Task<HttpResponseMessage> PostAsync(string url, object body = null, Dictionary<string, string> headers = null)
    {
        return await RequestAsync("POST", url, body, headers);
    }

    public async Task<HttpResponseMessage> PutAsync(string url, object body = null, Dictionary<string, string> headers = null)
    {
        return await RequestAsync("PUT", url, body, headers);
    }

    public async Task<HttpResponseMessage> DeleteAsync(string url, Dictionary<string, string> headers = null)
    {
        return await RequestAsync("DELETE", url, null, headers);
    }

    public void Dispose()
    {
        _privateKey?.Dispose();
        _httpClient?.Dispose();
    }
}

// 使用示例
class Program
{
    static async Task Main(string[] args)
    {
        var privateKeyPem = @"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----";

        using var client = new ApiSignatureClient(
            "my-app-123",
            privateKeyPem,
            "key-1",
            "RS256"
        );

        var userData = new
        {
            name = "John Doe",
            email = "john@example.com"
        };

        try
        {
            var response = await client.PostAsync("https://api.example.com/users", userData);
            var responseContent = await response.Content.ReadAsStringAsync();
            
            Console.WriteLine($"Status: {response.StatusCode}");
            Console.WriteLine($"Body: {responseContent}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }
}
```

## 测试工具

### 签名验证测试工具

```typescript
// signature-test-tool.ts
import crypto from 'crypto';

interface TestCase {
  name: string;
  appId: string;
  timestamp: string;
  method: string;
  path: string;
  body?: string;
  expectedSignature?: string;
}

class SignatureTestTool {
  static validateSignature(
    privateKeyPem: string,
    publicKeyPem: string,
    testCase: TestCase
  ): boolean {
    // 构造签名数据
    const signatureData = [
      testCase.timestamp,
      testCase.method.toUpperCase(),
      testCase.path,
      testCase.appId,
      testCase.body || ''
    ].join('\n');

    // 生成签名
    const sign = crypto.createSign('sha256');
    sign.update(signatureData, 'utf8');
    const signature = sign.sign(privateKeyPem, 'base64');

    // 验证签名
    const verify = crypto.createVerify('sha256');
    verify.update(signatureData, 'utf8');
    const isValid = verify.verify(publicKeyPem, signature, 'base64');

    console.log(`Test Case: ${testCase.name}`);
    console.log(`Signature Data: ${JSON.stringify(signatureData)}`);
    console.log(`Generated Signature: ${signature}`);
    console.log(`Signature Valid: ${isValid}`);
    
    if (testCase.expectedSignature) {
      console.log(`Expected Signature: ${testCase.expectedSignature}`);
      console.log(`Signatures Match: ${signature === testCase.expectedSignature}`);
    }
    
    console.log('---');
    
    return isValid;
  }
}

// 测试用例
const testCases: TestCase[] = [
  {
    name: 'GET Request',
    appId: 'test-app',
    timestamp: '2024-01-15T10:30:00.000Z',
    method: 'GET',
    path: '/api/users'
  },
  {
    name: 'POST Request with Body',
    appId: 'test-app',
    timestamp: '2024-01-15T10:30:00.000Z',
    method: 'POST',
    path: '/api/users',
    body: '{"name":"John","email":"john@example.com"}'
  }
];

// 运行测试
const privateKey = `-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----`;
const publicKey = `-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`;

testCases.forEach(testCase => {
  SignatureTestTool.validateSignature(privateKey, publicKey, testCase);
});
```

这些客户端集成示例提供了完整的实现，包括：

1. **多语言支持**：Node.js、Python、Java、Go、PHP、JavaScript、C#
2. **完整功能**：签名生成、请求发送、错误处理
3. **最佳实践**：密钥管理、安全传输、重试机制
4. **测试工具**：签名验证和调试工具

开发者可以根据自己的技术栈选择合适的实现，并根据具体需求进行定制。