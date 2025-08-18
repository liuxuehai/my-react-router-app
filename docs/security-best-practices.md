# API 签名认证安全最佳实践

## 概述

本文档提供 API 签名认证系统的安全最佳实践，涵盖密钥管理、传输安全、访问控制、监控审计等关键安全领域。遵循这些实践可以最大化系统的安全性和可靠性。

## 密钥管理安全

### 1. 密钥生成

#### 使用强密钥

```bash
# RSA 密钥 - 最小 2048 位，推荐 4096 位
openssl genrsa -out private_key.pem 4096

# ECDSA 密钥 - 推荐 P-384 或 P-521 曲线
openssl ecparam -genkey -name secp384r1 -noout -out ecdsa_private_key.pem
openssl ecparam -genkey -name secp521r1 -noout -out ecdsa_private_key_521.pem
```

#### 密钥质量验证

```bash
# 检查 RSA 密钥强度
openssl rsa -in private_key.pem -text -noout | grep "Private-Key"

# 检查 ECDSA 曲线
openssl ec -in ecdsa_private_key.pem -text -noout | grep "ASN1 OID"
```

#### 避免弱密钥

```typescript
// 密钥强度检查
function validateKeyStrength(publicKeyPem: string): boolean {
  const key = crypto.createPublicKey(publicKeyPem);
  
  if (key.asymmetricKeyType === 'rsa') {
    const keySize = key.asymmetricKeySize * 8; // 转换为位数
    return keySize >= 2048; // RSA 最小 2048 位
  }
  
  if (key.asymmetricKeyType === 'ec') {
    const keySize = key.asymmetricKeySize * 8;
    return keySize >= 256; // ECDSA 最小 256 位
  }
  
  return false;
}
```

### 2. 密钥存储

#### 私钥保护

```typescript
// ❌ 错误：私钥不应存储在服务端
const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----..."; // 危险！

// ✅ 正确：私钥仅在客户端使用
class ClientSigner {
  constructor(private privateKey: string) {
    // 私钥仅在客户端内存中
  }
}
```

#### 公钥安全存储

```typescript
// 环境变量存储（开发环境）
const publicKey = process.env.APP_123_PUBLIC_KEY;

// KV 存储（生产环境）
const publicKey = await env.SIGNATURE_KEYS.get(`app:${appId}`);

// 加密存储（高安全要求）
const encryptedKey = await env.SIGNATURE_KEYS.get(`app:${appId}`);
const publicKey = decrypt(encryptedKey, masterKey);
```

#### 密钥访问控制

```typescript
// 实现密钥访问权限检查
class SecureKeyManager {
  async getPublicKey(appId: string, requestContext: RequestContext): Promise<string> {
    // 检查访问权限
    if (!this.hasKeyAccess(requestContext, appId)) {
      throw new Error('Insufficient permissions to access key');
    }
    
    // 记录访问日志
    this.logKeyAccess(appId, requestContext);
    
    return await this.loadPublicKey(appId);
  }
  
  private hasKeyAccess(context: RequestContext, appId: string): boolean {
    // 实现基于角色的访问控制
    return context.permissions.includes(`key:${appId}:read`);
  }
}
```

### 3. 密钥轮换

#### 定期轮换策略

```typescript
// 密钥轮换配置
interface KeyRotationPolicy {
  /** 密钥有效期（天） */
  maxAge: number;
  /** 轮换前的警告期（天） */
  warningPeriod: number;
  /** 旧密钥的宽限期（天） */
  gracePeriod: number;
}

const rotationPolicy: KeyRotationPolicy = {
  maxAge: 365,        // 1 年
  warningPeriod: 30,  // 30 天警告
  gracePeriod: 7      // 7 天宽限期
};
```

#### 自动轮换实现

```typescript
class KeyRotationManager {
  async checkRotationNeeded(appId: string): Promise<boolean> {
    const keyInfo = await this.getKeyInfo(appId);
    const age = Date.now() - keyInfo.createdAt.getTime();
    const maxAgeMs = this.policy.maxAge * 24 * 60 * 60 * 1000;
    
    return age > maxAgeMs;
  }
  
  async rotateKey(appId: string): Promise<void> {
    // 1. 生成新密钥对
    const newKeyPair = await this.generateKeyPair();
    
    // 2. 添加新密钥（不删除旧密钥）
    await this.addKeyPair(appId, newKeyPair);
    
    // 3. 通知客户端更新
    await this.notifyKeyRotation(appId, newKeyPair.keyId);
    
    // 4. 等待宽限期后删除旧密钥
    setTimeout(async () => {
      await this.removeOldKeys(appId);
    }, this.policy.gracePeriod * 24 * 60 * 60 * 1000);
  }
}
```

#### 密钥版本管理

```typescript
interface KeyPair {
  keyId: string;
  publicKey: string;
  algorithm: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'deprecated' | 'revoked';
  version: number;
}

// 支持多版本密钥
class VersionedKeyManager {
  async getActiveKeys(appId: string): Promise<KeyPair[]> {
    const allKeys = await this.getAllKeys(appId);
    return allKeys.filter(key => key.status === 'active');
  }
  
  async verifyWithAnyActiveKey(
    appId: string,
    signature: string,
    data: string
  ): Promise<boolean> {
    const activeKeys = await this.getActiveKeys(appId);
    
    for (const key of activeKeys) {
      try {
        const isValid = await this.verifySignature(data, signature, key.publicKey, key.algorithm);
        if (isValid) {
          return true;
        }
      } catch (error) {
        // 继续尝试下一个密钥
        continue;
      }
    }
    
    return false;
  }
}
```

## 传输安全

### 1. HTTPS 强制

```typescript
// 强制 HTTPS 中间件
app.use('*', async (c, next) => {
  const proto = c.req.header('x-forwarded-proto');
  const host = c.req.header('host');
  
  if (proto !== 'https' && !host?.includes('localhost')) {
    return c.redirect(`https://${host}${c.req.path}`, 301);
  }
  
  await next();
});
```

### 2. 安全头设置

```typescript
// 安全响应头
app.use('*', async (c, next) => {
  await next();
  
  // 防止内容类型嗅探
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  
  // 防止点击劫持
  c.res.headers.set('X-Frame-Options', 'DENY');
  
  // XSS 保护
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  
  // HSTS
  c.res.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  
  // CSP
  c.res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  );
  
  // 引用者策略
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
});
```

### 3. 请求头保护

```typescript
// 敏感请求头验证
const SENSITIVE_HEADERS = ['x-signature', 'x-timestamp', 'x-app-id', 'x-key-id'];

app.use('*', async (c, next) => {
  // 检查敏感头是否通过 HTTPS 传输
  if (c.req.header('x-forwarded-proto') !== 'https') {
    const hasSensitiveHeaders = SENSITIVE_HEADERS.some(header => 
      c.req.header(header)
    );
    
    if (hasSensitiveHeaders) {
      return c.json({
        success: false,
        error: {
          code: 'INSECURE_TRANSPORT',
          message: 'Signature headers require HTTPS'
        }
      }, 400);
    }
  }
  
  await next();
});
```

## 访问控制

### 1. 应用级别权限

```typescript
interface AppPermissions {
  /** 允许的 HTTP 方法 */
  methods: string[];
  /** 允许的路径模式 */
  paths: string[];
  /** 速率限制 */
  rateLimit: {
    requests: number;
    window: number; // 秒
  };
  /** IP 白名单 */
  allowedIPs?: string[];
  /** 时间窗口限制 */
  timeWindow?: number;
}

class PermissionManager {
  async checkPermissions(
    appId: string,
    method: string,
    path: string,
    clientIP: string
  ): Promise<boolean> {
    const permissions = await this.getAppPermissions(appId);
    
    // 检查 HTTP 方法
    if (!permissions.methods.includes(method)) {
      return false;
    }
    
    // 检查路径权限
    if (!this.matchesPathPattern(path, permissions.paths)) {
      return false;
    }
    
    // 检查 IP 白名单
    if (permissions.allowedIPs && !permissions.allowedIPs.includes(clientIP)) {
      return false;
    }
    
    return true;
  }
  
  private matchesPathPattern(path: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(path);
    });
  }
}
```

### 2. 基于角色的访问控制 (RBAC)

```typescript
interface Role {
  name: string;
  permissions: string[];
}

interface AppConfig {
  appId: string;
  roles: Role[];
  defaultRole: string;
}

class RBACManager {
  async checkAccess(
    appId: string,
    action: string,
    resource: string
  ): Promise<boolean> {
    const appConfig = await this.getAppConfig(appId);
    const userRole = await this.getUserRole(appId);
    
    const role = appConfig.roles.find(r => r.name === userRole);
    if (!role) {
      return false;
    }
    
    const permission = `${action}:${resource}`;
    return role.permissions.includes(permission) || 
           role.permissions.includes('*');
  }
}
```

### 3. 速率限制

```typescript
// 基于令牌桶的速率限制
class TokenBucketRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  
  async checkLimit(
    appId: string,
    clientIP: string,
    maxRequests: number,
    windowMs: number
  ): Promise<boolean> {
    const key = `${appId}:${clientIP}`;
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      bucket = new TokenBucket(maxRequests, windowMs);
      this.buckets.set(key, bucket);
    }
    
    return bucket.consume();
  }
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  consume(): boolean {
    this.refill();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    
    return false;
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.refillRate);
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}
```

## 防重放攻击

### 1. 时间戳验证

```typescript
class TimestampValidator {
  private readonly maxClockSkew = 30; // 30 秒时钟偏差容忍
  
  validateTimestamp(
    timestamp: string,
    windowSeconds: number = 300
  ): { valid: boolean; reason?: string } {
    try {
      const requestTime = new Date(timestamp).getTime();
      const now = Date.now();
      
      // 检查时间戳格式
      if (isNaN(requestTime)) {
        return { valid: false, reason: 'Invalid timestamp format' };
      }
      
      // 检查未来时间（考虑时钟偏差）
      if (requestTime > now + this.maxClockSkew * 1000) {
        return { valid: false, reason: 'Timestamp is too far in the future' };
      }
      
      // 检查过期时间
      const age = now - requestTime;
      if (age > windowSeconds * 1000) {
        return { valid: false, reason: 'Timestamp expired' };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Timestamp parsing error' };
    }
  }
}
```

### 2. Nonce 机制

```typescript
// 可选的 nonce 防重放机制
class NonceManager {
  private usedNonces = new Map<string, number>();
  private cleanupInterval: NodeJS.Timeout;
  
  constructor(private ttlMs: number = 300000) { // 5 分钟 TTL
    // 定期清理过期的 nonce
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 每分钟清理一次
  }
  
  isNonceUsed(nonce: string): boolean {
    const expiry = this.usedNonces.get(nonce);
    if (!expiry) {
      return false;
    }
    
    if (Date.now() > expiry) {
      this.usedNonces.delete(nonce);
      return false;
    }
    
    return true;
  }
  
  markNonceUsed(nonce: string): void {
    this.usedNonces.set(nonce, Date.now() + this.ttlMs);
  }
  
  private cleanup(): void {
    const now = Date.now();
    for (const [nonce, expiry] of this.usedNonces.entries()) {
      if (now > expiry) {
        this.usedNonces.delete(nonce);
      }
    }
  }
  
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
```

### 3. 请求指纹

```typescript
// 基于请求内容的指纹防重放
class RequestFingerprintManager {
  private recentRequests = new Map<string, number>();
  
  generateFingerprint(
    appId: string,
    timestamp: string,
    method: string,
    path: string,
    body?: string
  ): string {
    const content = [appId, timestamp, method, path, body || ''].join('|');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  isRequestDuplicate(fingerprint: string, windowMs: number = 300000): boolean {
    const lastSeen = this.recentRequests.get(fingerprint);
    const now = Date.now();
    
    if (lastSeen && (now - lastSeen) < windowMs) {
      return true;
    }
    
    this.recentRequests.set(fingerprint, now);
    return false;
  }
}
```

## 监控和审计

### 1. 安全事件日志

```typescript
interface SecurityEvent {
  type: 'auth_success' | 'auth_failure' | 'key_rotation' | 'suspicious_activity';
  appId: string;
  clientIP: string;
  userAgent?: string;
  details: Record<string, any>;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class SecurityLogger {
  async logEvent(event: SecurityEvent): Promise<void> {
    // 结构化日志记录
    console.log(JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString()
    }));
    
    // 高严重性事件立即告警
    if (event.severity === 'critical' || event.severity === 'high') {
      await this.sendAlert(event);
    }
    
    // 存储到审计日志
    await this.storeAuditLog(event);
  }
  
  private async sendAlert(event: SecurityEvent): Promise<void> {
    // 发送到监控系统
    await fetch('https://monitoring.example.com/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Security Event: ${event.type}`,
        description: `App: ${event.appId}, IP: ${event.clientIP}`,
        severity: event.severity,
        timestamp: event.timestamp.toISOString()
      })
    });
  }
}
```

### 2. 异常检测

```typescript
class AnomalyDetector {
  private readonly thresholds = {
    failureRate: 0.1,        // 10% 失败率
    requestSpike: 10,        // 10 倍请求量增长
    newIPThreshold: 5,       // 新 IP 地址阈值
    timeWindowMs: 300000     // 5 分钟时间窗口
  };
  
  async detectAnomalies(appId: string): Promise<string[]> {
    const anomalies: string[] = [];
    const metrics = await this.getMetrics(appId);
    
    // 检测高失败率
    if (metrics.failureRate > this.thresholds.failureRate) {
      anomalies.push(`High failure rate: ${(metrics.failureRate * 100).toFixed(1)}%`);
    }
    
    // 检测请求量异常
    if (metrics.requestSpike > this.thresholds.requestSpike) {
      anomalies.push(`Request spike detected: ${metrics.requestSpike}x normal`);
    }
    
    // 检测新 IP 地址
    if (metrics.newIPs > this.thresholds.newIPThreshold) {
      anomalies.push(`Unusual number of new IPs: ${metrics.newIPs}`);
    }
    
    return anomalies;
  }
}
```

### 3. 实时监控

```typescript
class SecurityMonitor {
  private metrics = {
    authAttempts: 0,
    authFailures: 0,
    uniqueIPs: new Set<string>(),
    suspiciousActivities: 0
  };
  
  async monitorRequest(
    appId: string,
    clientIP: string,
    success: boolean,
    suspicious: boolean = false
  ): Promise<void> {
    this.metrics.authAttempts++;
    this.metrics.uniqueIPs.add(clientIP);
    
    if (!success) {
      this.metrics.authFailures++;
    }
    
    if (suspicious) {
      this.metrics.suspiciousActivities++;
    }
    
    // 每分钟检查一次异常
    if (this.metrics.authAttempts % 100 === 0) {
      await this.checkForAnomalies(appId);
    }
  }
  
  private async checkForAnomalies(appId: string): Promise<void> {
    const failureRate = this.metrics.authFailures / this.metrics.authAttempts;
    
    if (failureRate > 0.5) { // 50% 失败率
      await this.triggerAlert({
        type: 'high_failure_rate',
        appId,
        failureRate,
        severity: 'high'
      });
    }
  }
}
```

## 合规性和标准

### 1. 加密标准合规

```typescript
// 确保使用符合标准的算法
const APPROVED_ALGORITHMS = {
  'RS256': { keySize: 2048, hash: 'SHA-256' },
  'RS384': { keySize: 2048, hash: 'SHA-384' },
  'RS512': { keySize: 2048, hash: 'SHA-512' },
  'ES256': { curve: 'P-256', hash: 'SHA-256' },
  'ES384': { curve: 'P-384', hash: 'SHA-384' },
  'ES512': { curve: 'P-521', hash: 'SHA-512' }
};

function validateAlgorithm(algorithm: string): boolean {
  return algorithm in APPROVED_ALGORITHMS;
}
```

### 2. 数据保护

```typescript
// 敏感数据处理
class DataProtection {
  static sanitizeForLogging(data: any): any {
    const sanitized = { ...data };
    
    // 移除敏感字段
    const sensitiveFields = ['signature', 'privateKey', 'secret', 'token'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  static hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
  }
}
```

### 3. 审计要求

```typescript
// 审计日志记录
interface AuditLog {
  eventId: string;
  timestamp: Date;
  actor: string; // App ID
  action: string;
  resource: string;
  outcome: 'success' | 'failure';
  clientIP: string;
  userAgent?: string;
  details?: Record<string, any>;
}

class AuditLogger {
  async logAuditEvent(event: Omit<AuditLog, 'eventId' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
      ...event
    };
    
    // 确保审计日志的完整性
    const signature = this.signAuditLog(auditLog);
    
    await this.storeAuditLog({
      ...auditLog,
      signature
    });
  }
  
  private signAuditLog(log: AuditLog): string {
    const data = JSON.stringify(log);
    return crypto.createHmac('sha256', process.env.AUDIT_SECRET!)
      .update(data)
      .digest('hex');
  }
}
```

## 应急响应

### 1. 安全事件响应

```typescript
class SecurityIncidentResponse {
  async handleSecurityIncident(
    type: 'key_compromise' | 'brute_force' | 'data_breach',
    appId: string,
    details: any
  ): Promise<void> {
    switch (type) {
      case 'key_compromise':
        await this.handleKeyCompromise(appId, details);
        break;
      case 'brute_force':
        await this.handleBruteForce(appId, details);
        break;
      case 'data_breach':
        await this.handleDataBreach(appId, details);
        break;
    }
  }
  
  private async handleKeyCompromise(appId: string, details: any): Promise<void> {
    // 1. 立即禁用受影响的密钥
    await this.disableApp(appId);
    
    // 2. 通知相关人员
    await this.notifySecurityTeam('Key compromise detected', { appId, details });
    
    // 3. 生成新密钥
    const newKeyPair = await this.generateEmergencyKeyPair();
    
    // 4. 记录事件
    await this.logSecurityEvent({
      type: 'key_compromise',
      appId,
      severity: 'critical',
      response: 'app_disabled_new_key_generated'
    });
  }
}
```

### 2. 自动防护机制

```typescript
class AutoDefense {
  private suspiciousIPs = new Set<string>();
  private blockedIPs = new Map<string, number>(); // IP -> 解封时间
  
  async checkAndBlock(
    clientIP: string,
    appId: string,
    failureCount: number
  ): Promise<boolean> {
    // 检查是否已被阻止
    const blockExpiry = this.blockedIPs.get(clientIP);
    if (blockExpiry && Date.now() < blockExpiry) {
      return false; // 仍在阻止期内
    }
    
    // 检查失败次数
    if (failureCount > 10) { // 10 次失败
      const blockDuration = this.calculateBlockDuration(failureCount);
      this.blockedIPs.set(clientIP, Date.now() + blockDuration);
      
      await this.logSecurityEvent({
        type: 'ip_blocked',
        clientIP,
        appId,
        failureCount,
        blockDuration
      });
      
      return false;
    }
    
    return true;
  }
  
  private calculateBlockDuration(failureCount: number): number {
    // 指数退避：2^(failureCount-10) 分钟，最大 24 小时
    const minutes = Math.min(Math.pow(2, failureCount - 10), 1440);
    return minutes * 60 * 1000;
  }
}
```

## 定期安全评估

### 1. 安全检查清单

```typescript
interface SecurityCheckItem {
  id: string;
  description: string;
  category: 'keys' | 'access' | 'monitoring' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  check: () => Promise<boolean>;
}

const securityChecks: SecurityCheckItem[] = [
  {
    id: 'key_rotation',
    description: '检查密钥是否需要轮换',
    category: 'keys',
    severity: 'high',
    check: async () => {
      const apps = await keyManager.listApps();
      for (const app of apps) {
        const needsRotation = await keyManager.checkRotationNeeded(app.appId);
        if (needsRotation) return false;
      }
      return true;
    }
  },
  {
    id: 'weak_keys',
    description: '检查是否存在弱密钥',
    category: 'keys',
    severity: 'critical',
    check: async () => {
      const apps = await keyManager.listApps();
      for (const app of apps) {
        for (const keyPair of app.keyPairs) {
          if (!validateKeyStrength(keyPair.publicKey)) {
            return false;
          }
        }
      }
      return true;
    }
  }
];
```

### 2. 自动化安全扫描

```typescript
class SecurityScanner {
  async runSecurityScan(): Promise<SecurityScanReport> {
    const report: SecurityScanReport = {
      timestamp: new Date(),
      checks: [],
      summary: { passed: 0, failed: 0, warnings: 0 }
    };
    
    for (const check of securityChecks) {
      try {
        const passed = await check.check();
        report.checks.push({
          ...check,
          passed,
          timestamp: new Date()
        });
        
        if (passed) {
          report.summary.passed++;
        } else {
          report.summary.failed++;
          if (check.severity === 'critical' || check.severity === 'high') {
            await this.alertSecurityTeam(check);
          }
        }
      } catch (error) {
        report.checks.push({
          ...check,
          passed: false,
          error: error.message,
          timestamp: new Date()
        });
        report.summary.warnings++;
      }
    }
    
    return report;
  }
}
```

## 总结

遵循这些安全最佳实践可以显著提高 API 签名认证系统的安全性：

### 关键要点

1. **密钥安全**：使用强密钥、安全存储、定期轮换
2. **传输保护**：强制 HTTPS、设置安全头
3. **访问控制**：实现细粒度权限管理和速率限制
4. **防重放**：时间戳验证和可选的 nonce 机制
5. **监控审计**：全面的日志记录和异常检测
6. **应急响应**：自动防护和事件响应机制
7. **持续评估**：定期安全检查和漏洞扫描

### 实施建议

1. 从最关键的安全措施开始实施
2. 建立安全监控和告警机制
3. 定期进行安全评估和渗透测试
4. 保持安全知识和威胁情报的更新
5. 建立完善的安全事件响应流程

通过系统性地实施这些安全措施，可以构建一个强健、安全的 API 签名认证系统。