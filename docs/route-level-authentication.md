# Route-Level Authentication Control

This document describes how to implement and configure route-level authentication control using the signature authentication system.

## Overview

The route-level authentication system allows you to:

- Define which routes require authentication and which are public
- Control which applications can access specific routes
- Implement custom permission logic for complex scenarios
- Group routes with common authentication requirements
- Configure different authentication rules for different HTTP methods

## Basic Usage

### 1. Create Route Configuration

```typescript
import { createRouteAuthConfig } from './app/api/auth/route-auth-builder.js';

const routeConfig = createRouteAuthConfig(false) // default: no auth required
  .addPublicPaths([
    '/health',
    '/api/public/*',
    '/api/docs/*',
  ])
  .addProtectedPaths([
    '/api/admin/*',
    '/api/secure/*',
  ])
  .route('/api/users/profile')
    .methods(['GET', 'PUT'])
    .requireAuth(true)
    .description('User profile management')
    .end()
  .enableDebug(true)
  .build();
```

### 2. Apply Middleware

```typescript
import { Hono } from 'hono';
import { createRouteSignatureAuth } from './app/api/middleware/route-signature-auth.js';
import { createKeyManager } from './app/api/auth/key-manager.js';

const app = new Hono();
const keyManager = createKeyManager(/* config */);

// Apply route-level signature authentication
app.use('*', createRouteSignatureAuth(keyManager, {
  routeConfig,
  skipUnauthenticatedRoutes: true,
  debug: true,
}));

// Define your routes
app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/api/admin/users', (c) => c.json({ users: [] }));
```

## Advanced Configuration

### Route Groups

Organize related routes with common authentication requirements:

```typescript
const config = createRouteAuthConfig(true)
  .group('admin', '/api/admin')
    .description('Admin interface')
    .defaultRequireAuth(true)
    .defaultAllowApps(['admin-app'])
    .route('/users/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .description('User management')
      .end()
    .route('/config')
      .method('GET')
      .allowApps(['admin-app', 'config-app'])
      .description('Configuration access')
      .end()
    .end()
  .build();
```

### App-Level Permissions

Control which applications can access specific routes:

```typescript
const config = createRouteAuthConfig()
  .route('/api/data/*')
    .requireAuth(true)
    .allowApps(['data-client', 'analytics-service'])
    .description('Data access endpoints')
    .end()
  .route('/api/internal/*')
    .requireAuth(true)
    .denyApps(['external-client'])
    .description('Internal API endpoints')
    .end()
  .build();
```

### Custom Permission Logic

Implement complex permission checks:

```typescript
const config = createRouteAuthConfig()
  .route('/api/webhook')
    .method('POST')
    .requireAuth(true)
    .customPermission(async (appId, path, method) => {
      // Only webhook-specific apps can access webhook endpoints
      if (!appId.startsWith('webhook_')) {
        return false;
      }
      
      // Additional checks (e.g., database lookup)
      const isActive = await checkWebhookAppStatus(appId);
      return isActive;
    })
    .description('Webhook endpoint')
    .end()
  .build();
```

### Method-Specific Rules

Configure different rules for different HTTP methods:

```typescript
const config = createRouteAuthConfig()
  .route('/api/posts')
    .method('GET')
    .requireAuth(false) // Public read access
    .end()
  .route('/api/posts')
    .methods(['POST', 'PUT', 'DELETE'])
    .requireAuth(true) // Auth required for modifications
    .allowApps(['content-manager', 'admin-app'])
    .end()
  .build();
```

## Pre-built Configurations

Use common configuration patterns:

```typescript
import { CommonRouteConfigs } from './app/api/auth/route-auth-builder.js';

// REST API configuration
const restConfig = CommonRouteConfigs.createRestApiConfig();

// Microservice configuration
const microserviceConfig = CommonRouteConfigs.createMicroserviceConfig();

// Environment-specific configurations
const devConfig = CommonRouteConfigs.createDevelopmentConfig();
const prodConfig = CommonRouteConfigs.createProductionConfig();
```

## Context Information

Access authentication information in your route handlers:

```typescript
import { getRouteAuthInfo, isRouteAuthenticated, getAuthenticatedAppId } from './app/api/middleware/route-signature-auth.js';

app.get('/api/profile', (c) => {
  // Check if request is authenticated
  if (!isRouteAuthenticated(c)) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  
  // Get authenticated app ID
  const appId = getAuthenticatedAppId(c);
  
  // Get detailed route auth info
  const routeInfo = getRouteAuthInfo(c);
  
  return c.json({
    message: 'Profile data',
    authenticatedAs: appId,
    routeInfo,
  });
});
```

## Configuration Examples

### E-commerce Platform

```typescript
const ecommerceConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/api/products/search',
    '/api/categories',
  ])
  .group('customer', '/api/customer')
    .defaultRequireAuth(true)
    .defaultAllowApps(['mobile-app', 'web-app'])
    .route('/profile')
      .methods(['GET', 'PUT'])
      .end()
    .route('/orders')
      .methods(['GET', 'POST'])
      .end()
    .end()
  .group('admin', '/api/admin')
    .defaultRequireAuth(true)
    .defaultAllowApps(['admin-panel'])
    .route('/products/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .end()
    .end()
  .build();
```

### Multi-tenant SaaS

```typescript
const multiTenantConfig = createRouteAuthConfig(true)
  .addPublicPaths(['/health', '/api/auth/*'])
  .route('/api/tenant/*/data/*')
    .customPermission(async (appId, path, method) => {
      const tenantId = path.split('/')[3];
      return appId === `tenant-${tenantId}` || appId === 'super-admin';
    })
    .description('Tenant-specific data access')
    .end()
  .build();
```

## Error Handling

The middleware provides detailed error responses:

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "App mobile-app does not have permission to access POST /api/admin/users",
    "details": {
      "appId": "mobile-app",
      "path": "/api/admin/users",
      "method": "POST"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "req-123"
  }
}
```

## Testing

Test your route configurations:

```typescript
import { RouteAuthConfigManager } from './app/api/auth/route-config.js';

describe('Route Configuration', () => {
  const manager = new RouteAuthConfigManager(myConfig);
  
  it('should require auth for admin routes', () => {
    expect(manager.requiresAuth('/api/admin/users', 'GET')).toBe(true);
  });
  
  it('should allow admin app access', async () => {
    const hasPermission = await manager.checkAppPermission(
      'admin-app', 
      '/api/admin/users', 
      'GET'
    );
    expect(hasPermission).toBe(true);
  });
});
```

## Best Practices

1. **Start with defaults**: Use `createRouteAuthConfig(true)` for secure-by-default configurations
2. **Use route groups**: Organize related routes for easier maintenance
3. **Be specific**: Use exact paths when possible, wildcards when necessary
4. **Test thoroughly**: Test both positive and negative cases
5. **Document permissions**: Use descriptions to document route purposes
6. **Monitor access**: Use debug mode in development, monitoring in production
7. **Principle of least privilege**: Only grant necessary permissions to each app

## Performance Considerations

- Route matching is optimized with compiled patterns
- More specific routes are matched first
- Use wildcards judiciously to avoid performance impact
- Consider caching for complex custom permission checks
- Monitor authentication overhead in production

## Migration Guide

To migrate from basic signature authentication to route-level control:

1. Create a route configuration that matches your current setup
2. Replace `signatureAuth` middleware with `createRouteSignatureAuth`
3. Test thoroughly with your existing applications
4. Gradually add more specific route rules as needed
5. Monitor for any authentication failures during migration