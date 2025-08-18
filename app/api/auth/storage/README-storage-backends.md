# Storage Backend Configuration Guide

This document provides comprehensive guidance on configuring and using different storage backends for the API signature authentication system.

## Overview

The signature authentication system supports multiple storage backends for key configuration:

- **Environment Variables** - Simple configuration via environment variables
- **Cloudflare KV** - Distributed key-value storage with global replication
- **File Storage** - JSON configuration files (read-only)
- **Memory Storage** - In-memory storage for testing and development

## Storage Backend Types

### 1. Environment Variable Storage

Best for: Simple deployments, development, testing

```typescript
import { EnvStorageProvider } from './storage/env-storage.js';

const provider = new EnvStorageProvider(process.env, {
  debug: true,
  retryConfig: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
  }
});
```

#### Environment Variable Format

```bash
# Basic app configuration
APP_MYAPP_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
APP_MYAPP_ALGORITHM="RS256"
APP_MYAPP_ENABLED="true"
APP_MYAPP_NAME="My Application"
APP_MYAPP_PERMISSIONS="read,write,admin"
APP_MYAPP_DESCRIPTION="My application description"
APP_MYAPP_TAGS="production,api"

# Access control
APP_MYAPP_ALLOWED_PATHS="/api/secure/*,/api/admin/*"
APP_MYAPP_DENIED_PATHS="/api/internal/*"
APP_MYAPP_ALLOWED_IPS="192.168.1.0/24,10.0.0.0/8"
APP_MYAPP_RATE_LIMIT="1000:50"  # requests_per_minute:burst_limit
APP_MYAPP_TIME_WINDOW="300"     # custom time window in seconds

# Multiple keys for single app
APP_MYAPP_KEY_PRIMARY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
APP_MYAPP_KEY_PRIMARY_ALGORITHM="RS256"
APP_MYAPP_KEY_PRIMARY_ENABLED="true"
APP_MYAPP_KEY_PRIMARY_EXPIRES_AT="2025-12-31T23:59:59.000Z"

APP_MYAPP_KEY_BACKUP_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
APP_MYAPP_KEY_BACKUP_ALGORITHM="ES256"
APP_MYAPP_KEY_BACKUP_ENABLED="false"
```

#### Advantages
- Simple configuration
- No external dependencies
- Good for development and testing
- Automatic environment variable parsing

#### Limitations
- Read-only (cannot modify at runtime)
- Limited scalability for many apps
- Environment variable size limits

### 2. Cloudflare KV Storage

Best for: Production deployments, global distribution, dynamic configuration

```typescript
import { KVStorageProvider } from './storage/kv-storage.js';

const provider = new KVStorageProvider(env.SIGNATURE_KV, {
  debug: false,
  keyPrefix: "signature_auth:app:",
  retryConfig: {
    maxRetries: 3,
    baseDelay: 100,
    maxDelay: 2000,
  }
});
```

#### KV Configuration

```typescript
// wrangler.toml
[[kv_namespaces]]
binding = "SIGNATURE_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

#### Programmatic Usage

```typescript
import { createKeyManager } from './key-manager.js';

const keyManager = createKeyManager({
  storageType: 'kv',
  debug: false,
  enableCache: true,
  cacheExpiry: 300,
}, env, env.SIGNATURE_KV);

// Add new app
await keyManager.addApp({
  appId: 'new-app',
  name: 'New Application',
  keyPairs: [{
    keyId: 'default',
    publicKey: '-----BEGIN PUBLIC KEY-----...',
    algorithm: 'RS256',
    createdAt: new Date(),
    enabled: true,
  }],
  enabled: true,
  permissions: ['read', 'write'],
  createdAt: new Date(),
});
```

#### Advantages
- Read-write operations
- Global distribution
- Automatic replication
- High availability
- Built-in retry mechanisms
- Cleanup utilities for expired keys

#### Limitations
- Eventual consistency
- KV operation limits
- Requires Cloudflare Workers environment

### 3. File Storage

Best for: Static configurations, version-controlled setups

```typescript
import { FileStorageProvider } from './storage/file-storage.js';

const provider = new FileStorageProvider('/path/to/config.json', {
  debug: true,
  retryConfig: {
    maxRetries: 2,
    baseDelay: 100,
    maxDelay: 1000,
  }
});
```

#### Configuration File Format

```json
{
  "apps": {
    "my-app": {
      "name": "My Application",
      "enabled": true,
      "description": "Production API application",
      "permissions": ["read", "write"],
      "tags": ["production", "api"],
      "keyPairs": [
        {
          "keyId": "primary",
          "publicKey": "-----BEGIN PUBLIC KEY-----...",
          "algorithm": "RS256",
          "enabled": true,
          "createdAt": "2024-01-01T00:00:00.000Z",
          "expiresAt": "2025-01-01T00:00:00.000Z"
        },
        {
          "keyId": "backup",
          "publicKey": "-----BEGIN PUBLIC KEY-----...",
          "algorithm": "ES256",
          "enabled": false,
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "accessControl": {
        "allowedPaths": ["/api/secure/*"],
        "deniedPaths": ["/api/internal/*"],
        "allowedIPs": ["192.168.1.0/24"],
        "rateLimit": {
          "requestsPerMinute": 1000,
          "burstLimit": 50
        },
        "customTimeWindow": 300
      }
    }
  }
}
```

#### Advantages
- Version control friendly
- Human readable
- Good for static configurations
- Supports complex nested configurations

#### Limitations
- Read-only
- Requires file system access
- Not suitable for dynamic updates

### 4. Memory Storage

Best for: Testing, development, temporary storage

```typescript
import { MemoryStorageProvider } from './storage/memory-storage.js';

const provider = new MemoryStorageProvider({
  debug: true,
  retryConfig: {
    maxRetries: 1,
    baseDelay: 50,
    maxDelay: 500,
  }
});
```

#### Advantages
- Fast operations
- Full read-write support
- No external dependencies
- Perfect for testing

#### Limitations
- Data lost on restart
- Not suitable for production
- Memory usage grows with data

## Multi-Layer Storage

Combine multiple storage backends for redundancy:

```typescript
import { StorageProviderFactory } from './storage/storage-factory.js';

const provider = StorageProviderFactory.createMultiLayerProvider(
  // Primary: KV storage
  {
    type: 'kv',
    kv: { namespace: env.SIGNATURE_KV },
    debug: false,
  },
  // Fallback: Environment variables
  {
    type: 'env',
    env: process.env,
    debug: false,
  }
);
```

## Storage Factory Usage

The `StorageProviderFactory` provides a unified interface for creating storage providers:

```typescript
import { StorageProviderFactory } from './storage/storage-factory.js';

// Create from configuration
const provider = StorageProviderFactory.createProvider({
  type: 'kv',
  debug: true,
  kv: {
    namespace: kvNamespace,
    keyPrefix: 'auth:',
    retryConfig: {
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 2000,
    }
  }
});

// Create from environment
const envProvider = StorageProviderFactory.createFromEnv(process.env);

// Create from KeyManager config
const keyManagerProvider = StorageProviderFactory.createFromKeyManagerConfig(
  keyManagerConfig,
  process.env,
  kvNamespace
);
```

## Error Handling and Retry Mechanisms

All storage providers implement robust error handling:

### Retry Configuration

```typescript
interface RetryConfig {
  maxRetries: number;    // Maximum number of retry attempts
  baseDelay: number;     // Base delay in milliseconds
  maxDelay: number;      // Maximum delay in milliseconds
}
```

### Error Types

```typescript
import { KeyManagerError } from './types.js';

try {
  const config = await provider.getAppConfig('my-app');
} catch (error) {
  if (error instanceof KeyManagerError) {
    switch (error.code) {
      case 'APP_NOT_FOUND':
        // Handle missing app
        break;
      case 'KEY_NOT_FOUND':
        // Handle missing key
        break;
      case 'STORAGE_ERROR':
        // Handle storage failures
        break;
      case 'VALIDATION_ERROR':
        // Handle validation failures
        break;
      case 'INVALID_KEY_FORMAT':
        // Handle key format errors
        break;
    }
  }
}
```

### Exponential Backoff

All providers use exponential backoff for retries:

```
Attempt 1: baseDelay ms
Attempt 2: baseDelay * 2 ms
Attempt 3: baseDelay * 4 ms
...
Max delay: maxDelay ms
```

## Storage Utilities

### Connection Testing

```typescript
import { StorageUtils } from './storage/storage-factory.js';

const isConnected = await StorageUtils.testConnection(provider);
if (!isConnected) {
  console.error('Storage provider is not accessible');
}
```

### Provider Information

```typescript
const info = StorageUtils.getProviderInfo(provider);
console.log(`Provider: ${info.type}`);
console.log(`Features: ${info.features.join(', ')}`);
```

### Data Migration

```typescript
const result = await StorageUtils.migrateData(
  sourceProvider,
  targetProvider,
  {
    dryRun: false,
    debug: true,
  }
);

console.log(`Migrated: ${result.migrated}, Failed: ${result.failed}`);
if (result.errors.length > 0) {
  console.error('Migration errors:', result.errors);
}
```

## Performance Considerations

### KV Storage
- Use appropriate key prefixes to organize data
- Implement caching for frequently accessed keys
- Consider KV operation limits and costs
- Use cleanup utilities to remove expired data

### Environment Variables
- Limit the number of apps (environment variable limits)
- Use for static configurations only
- Consider startup time with many variables

### File Storage
- Cache file contents to avoid repeated reads
- Use file watching for configuration updates
- Consider file size limits

### Memory Storage
- Monitor memory usage with large datasets
- Implement data cleanup for long-running processes
- Use only for testing and development

## Best Practices

1. **Choose the Right Backend**
   - Development: Memory or Environment
   - Testing: Memory with controlled data
   - Production: KV with Environment fallback

2. **Error Handling**
   - Always handle `KeyManagerError` exceptions
   - Implement appropriate retry logic
   - Log errors with sufficient context

3. **Security**
   - Never store private keys in any backend
   - Use appropriate access controls for KV namespaces
   - Validate all configuration data

4. **Performance**
   - Enable caching for frequently accessed data
   - Use batch operations when available
   - Monitor storage operation latency

5. **Monitoring**
   - Track storage operation success rates
   - Monitor cache hit rates
   - Set up alerts for storage failures

## Troubleshooting

### Common Issues

1. **KV Operations Failing**
   ```typescript
   // Check KV namespace binding
   if (!env.SIGNATURE_KV) {
     throw new Error('KV namespace not bound');
   }
   ```

2. **Environment Variables Not Loading**
   ```typescript
   // Verify environment variable format
   const appId = 'myapp';
   const key = `APP_${appId.toUpperCase()}_PUBLIC_KEY`;
   console.log(`Looking for: ${key}`);
   console.log(`Value: ${process.env[key] ? 'Found' : 'Not found'}`);
   ```

3. **File Loading Errors**
   ```typescript
   // Check file accessibility
   try {
     const response = await fetch(configPath);
     if (!response.ok) {
       throw new Error(`HTTP ${response.status}`);
     }
   } catch (error) {
     console.error('File loading failed:', error);
   }
   ```

4. **Validation Errors**
   ```typescript
   // Validate public key format
   const pemRegex = /^-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----[\s\S]*-----END (PUBLIC KEY|RSA PUBLIC KEY|EC PUBLIC KEY)-----$/;
   if (!pemRegex.test(publicKey.trim())) {
     throw new Error('Invalid PEM format');
   }
   ```

### Debug Mode

Enable debug mode for detailed logging:

```typescript
const provider = new KVStorageProvider(kvNamespace, {
  debug: true,  // Enable detailed logging
});
```

Debug logs include:
- Operation attempts and retries
- Cache hits and misses
- Validation steps
- Error details with context

## Migration Guide

### From Environment to KV

```typescript
import { StorageUtils, EnvStorageProvider, KVStorageProvider } from './storage/index.js';

const envProvider = new EnvStorageProvider(process.env);
const kvProvider = new KVStorageProvider(env.SIGNATURE_KV);

// Migrate all data
const result = await StorageUtils.migrateData(envProvider, kvProvider, {
  debug: true,
});

console.log(`Migration completed: ${result.migrated} apps migrated`);
```

### From File to KV

```typescript
const fileProvider = new FileStorageProvider('/path/to/config.json');
const kvProvider = new KVStorageProvider(env.SIGNATURE_KV);

const result = await StorageUtils.migrateData(fileProvider, kvProvider);
```

This comprehensive storage backend system provides flexibility, reliability, and scalability for managing API signature authentication configurations across different deployment scenarios.