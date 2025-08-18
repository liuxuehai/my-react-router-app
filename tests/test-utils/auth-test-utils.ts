/**
 * Test utilities for authentication testing
 */

import { SignatureUtils } from '../../app/api/auth/signature-utils.js';
import { KeyGenerator } from '../../app/api/auth/key-generator.js';
import { MemoryStorageProvider } from '../../app/api/auth/storage/memory-storage.js';
import { KeyManagerImpl } from '../../app/api/auth/key-manager.js';
import type { KeyManager, AppConfig, KeyPair } from '../../app/api/auth/types.js';

export interface TestSignatureOptions {
  method: string;
  path: string;
  appId: string;
  keyId: string;
  privateKey: string;
  body?: string;
  timestamp?: string;
}

export interface TestSignatureResult {
  headers: Record<string, string>;
  signature: string;
  timestamp: string;
}

export interface TestKeyManagerData {
  keyManager: KeyManager;
  testAppId: string;
  testKeyId: string;
  testPrivateKey: string;
  testPublicKey: string;
}

/**
 * Create a test signature for API requests
 */
export async function createTestSignature(options: TestSignatureOptions): Promise<TestSignatureResult> {
  const timestamp = options.timestamp || new Date().toISOString();
  
  const signatureData = {
    timestamp,
    method: options.method,
    path: options.path,
    body: options.body,
    appId: options.appId,
  };

  const dataString = SignatureUtils.buildSignatureString(signatureData);
  const signature = await SignatureUtils.generateSignature(
    dataString,
    options.privateKey,
    'RS256'
  );

  const headers: Record<string, string> = {
    'X-Signature': signature,
    'X-Timestamp': timestamp,
    'X-App-Id': options.appId,
  };

  if (options.keyId) {
    headers['X-Key-Id'] = options.keyId;
  }

  return {
    headers,
    signature,
    timestamp,
  };
}

/**
 * Create a test key manager with sample data
 */
export async function createTestKeyManager(): Promise<TestKeyManagerData> {
  const testAppId = 'test-app-123';
  const testKeyId = 'default';
  
  // Use mock keys for testing
  const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUvtUs8cKB
wjgHm6S4KaYP+9gsr+eCYy4rF8mXADPMxCXpbOhgEQy+37+jqM6xjwwk5c5/qV1j
GT98aZfxOvtfmcdVXrD4Hr/Yz56+0kEcWF/ji2O47MuCzGBAUHRVlRbdaa3Nn6hL
TZXGsoIhfqfvlJ2hdMpVEBPVF8SfGmhhuebXo0BTC5pmKEkk6GOXKt8Sgiz6VsY9
Oy/Hi/Dxnh0E0Bnj5NqEAjIyHHGg71OjfAXeuTXuYnjbGE6m/Zg2uFJn5uwhTyKj
jMsmKEoG0iLEVQ==
-----END PRIVATE KEY-----`;

  const testPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgcI4B5uk
uCmmD/vYLK/ngmMuKxfJlwAzzMQl6WzoYBEMvt+/o6jOsY8MJOXOf6ldYxk/fGmX
8Tr7X5nHVV6w+B6/2M+evtJBHFhf44tjuOzLgsxgQFB0VZUWnWmtzZ+oS02VxrKC
IX6n75SdoXTKVRAT1RfEnxpoYbnm16NAUwuaZihJJOhjlyrf0oIs+lbGPTsvx4vw
8Z4dBNAZ4+TahAIyMhxxoO9To3wF3rk17mJ42xhOpv2YNrhSZ+bsIU8io4zLJihK
BtIixFUwIDAQAB
-----END PUBLIC KEY-----`;

  // Create memory storage with test data
  const storage = new MemoryStorageProvider({
    debug: true,
    retryConfig: {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    },
  });
  
  const appConfig: AppConfig = {
    appId: testAppId,
    name: 'Test Application',
    keyPairs: [{
      keyId: testKeyId,
      publicKey: testPublicKey,
      algorithm: 'RS256',
      createdAt: new Date(),
      enabled: true,
    }],
    enabled: true,
    permissions: ['read', 'write'],
    createdAt: new Date(),
    accessControl: {
      allowedPaths: ['*'],
      customTimeWindow: 300,
    },
  };

  await storage.saveAppConfig(appConfig);

  // Create key manager
  const keyManager = new KeyManagerImpl({
    storageType: 'memory',
    cacheExpiry: 300,
    enableCache: true,
    debug: true,
  }, undefined, undefined, storage);

  return {
    keyManager,
    testAppId,
    testKeyId,
    testPrivateKey,
    testPublicKey,
  };
}

/**
 * Create a test app configuration
 */
export function createTestAppConfig(appId: string, keyPairs: KeyPair[]): AppConfig {
  return {
    appId,
    name: `Test App ${appId}`,
    keyPairs,
    enabled: true,
    permissions: ['read', 'write'],
    createdAt: new Date(),
    accessControl: {
      allowedPaths: ['*'],
      customTimeWindow: 300,
    },
  };
}

/**
 * Create a test key pair
 */
export async function createTestKeyPair(keyId: string = 'default'): Promise<KeyPair> {
  const generated = await KeyGenerator.generateKeyPair('RS256');
  return {
    keyId,
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    algorithm: 'RS256',
    createdAt: new Date(),
    enabled: true,
  };
}

/**
 * Create multiple test apps for testing
 */
export async function createMultipleTestApps(count: number): Promise<{
  apps: AppConfig[];
  keyPairs: Map<string, KeyPair>;
}> {
  const apps: AppConfig[] = [];
  const keyPairs = new Map<string, KeyPair>();

  for (let i = 0; i < count; i++) {
    const appId = `test-app-${i + 1}`;
    const keyPair = await createTestKeyPair();
    keyPairs.set(appId, keyPair);
    
    apps.push(createTestAppConfig(appId, [keyPair]));
  }

  return { apps, keyPairs };
}

/**
 * Create a test request with signature
 */
export async function createSignedTestRequest(
  method: string,
  path: string,
  options: {
    appId: string;
    keyId: string;
    privateKey: string;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}> {
  const body = options.body ? JSON.stringify(options.body) : undefined;
  
  const signature = await createTestSignature({
    method,
    path,
    appId: options.appId,
    keyId: options.keyId,
    privateKey: options.privateKey,
    body,
  });

  const headers = {
    ...signature.headers,
    ...options.headers,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return {
    method,
    url: path,
    headers,
    body,
  };
}

/**
 * Verify a signature using test utilities
 */
export async function verifyTestSignature(
  signature: string,
  data: string,
  publicKey: string,
  algorithm: string = 'RS256'
): Promise<boolean> {
  return SignatureUtils.verifySignature(data, signature, publicKey, algorithm);
}

/**
 * Create expired signature for testing
 */
export async function createExpiredSignature(options: TestSignatureOptions): Promise<TestSignatureResult> {
  const expiredTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
  
  return createTestSignature({
    ...options,
    timestamp: expiredTimestamp,
  });
}

/**
 * Create invalid signature for testing
 */
export async function createInvalidSignature(options: TestSignatureOptions): Promise<TestSignatureResult> {
  const result = await createTestSignature(options);
  
  // Corrupt the signature
  result.signature = result.signature.slice(0, -10) + 'INVALID123';
  result.headers['X-Signature'] = result.signature;
  
  return result;
}

/**
 * Mock environment for testing
 */
export function createMockEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    SIGNATURE_TIME_WINDOW: '300',
    SIGNATURE_DEBUG: 'true',
    ...overrides,
  };
}

/**
 * Wait for a specified amount of time (useful for testing time-based features)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random app ID for testing
 */
export function generateRandomAppId(): string {
  return `test-app-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate random key ID for testing
 */
export function generateRandomKeyId(): string {
  return `key-${Math.random().toString(36).substr(2, 9)}`;
}