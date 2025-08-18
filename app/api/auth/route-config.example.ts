/**
 * Example route authentication configurations
 * This file demonstrates how to configure route-level authentication control
 */

import { createRouteAuthConfig, CommonRouteConfigs } from './route-auth-builder.js';
import type { GlobalRouteAuthConfig } from './route-config.js';

/**
 * Example 1: Basic API with public and protected routes
 */
export const basicApiConfig: GlobalRouteAuthConfig = createRouteAuthConfig(false)
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
  .route('/api/data/*')
    .requireAuth(true)
    .allowApps(['data-client', 'admin-app'])
    .description('Data access endpoints')
    .end()
  .enableDebug(true)
  .build();

/**
 * Example 2: Multi-tenant SaaS application
 */
export const multiTenantConfig: GlobalRouteAuthConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/api/public/info',
    '/api/auth/login',
    '/api/auth/register',
  ])
  .group('tenant', '/api/tenant')
    .description('Tenant-specific APIs')
    .defaultRequireAuth(true)
    .route('/*/users')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .customPermission(async (appId, path, method) => {
        // Extract tenant ID from path
        const tenantId = path.split('/')[3];
        // Check if app has access to this tenant
        return appId === `tenant-${tenantId}` || appId === 'super-admin';
      })
      .description('Tenant user management')
      .end()
    .route('/*/data/*')
      .customPermission(async (appId, path, method) => {
        const tenantId = path.split('/')[3];
        return appId === `tenant-${tenantId}` || appId.startsWith('data-service-');
      })
      .description('Tenant data access')
      .end()
    .end()
  .group('admin', '/api/admin')
    .description('System administration')
    .defaultRequireAuth(true)
    .defaultAllowApps(['super-admin'])
    .route('/tenants/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .description('Tenant management')
      .end()
    .route('/system/*')
      .methods(['GET', 'POST'])
      .description('System configuration')
      .end()
    .end()
  .build();

/**
 * Example 3: Microservices with service-to-service authentication
 */
export const microservicesConfig: GlobalRouteAuthConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/metrics',
    '/ready',
  ])
  .group('internal', '/internal')
    .description('Internal service communication')
    .defaultRequireAuth(true)
    .defaultAllowApps(['user-service', 'order-service', 'payment-service', 'gateway'])
    .route('/users/sync')
      .method('POST')
      .allowApps(['user-service', 'gateway'])
      .description('User data synchronization')
      .end()
    .route('/orders/callback')
      .method('POST')
      .allowApps(['order-service', 'payment-service'])
      .description('Order status callback')
      .end()
    .route('/health-check')
      .method('GET')
      .allowApps(['monitoring-service', 'gateway'])
      .description('Internal health check')
      .end()
    .end()
  .group('external', '/api/v1')
    .description('External API endpoints')
    .defaultRequireAuth(true)
    .route('/webhooks/*')
      .method('POST')
      .customPermission(async (appId, path, method) => {
        // Only webhook-specific apps can access webhook endpoints
        return appId.startsWith('webhook-') || appId === 'gateway';
      })
      .description('Webhook endpoints')
      .end()
    .route('/public/*')
      .requireAuth(false)
      .description('Public API endpoints')
      .end()
    .end()
  .build();

/**
 * Example 4: E-commerce platform with role-based access
 */
export const ecommerceConfig: GlobalRouteAuthConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/api/products/search',
    '/api/categories',
    '/api/public/*',
  ])
  .group('customer', '/api/customer')
    .description('Customer-facing APIs')
    .defaultRequireAuth(true)
    .defaultAllowApps(['mobile-app', 'web-app', 'customer-service'])
    .route('/profile')
      .methods(['GET', 'PUT'])
      .description('Customer profile')
      .end()
    .route('/orders')
      .methods(['GET', 'POST'])
      .description('Customer orders')
      .end()
    .route('/cart/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .description('Shopping cart')
      .end()
    .end()
  .group('merchant', '/api/merchant')
    .description('Merchant APIs')
    .defaultRequireAuth(true)
    .defaultAllowApps(['merchant-portal', 'admin-panel'])
    .route('/products/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .description('Product management')
      .end()
    .route('/orders/*')
      .methods(['GET', 'PUT'])
      .description('Order management')
      .end()
    .route('/analytics/*')
      .method('GET')
      .allowApps(['merchant-portal', 'analytics-service'])
      .description('Sales analytics')
      .end()
    .end()
  .group('admin', '/api/admin')
    .description('Platform administration')
    .defaultRequireAuth(true)
    .defaultAllowApps(['admin-panel'])
    .route('/merchants/*')
      .methods(['GET', 'POST', 'PUT', 'DELETE'])
      .description('Merchant management')
      .end()
    .route('/system/*')
      .methods(['GET', 'POST', 'PUT'])
      .description('System configuration')
      .end()
    .end()
  .build();

/**
 * Example 5: Development vs Production configurations
 */
export const developmentConfig: GlobalRouteAuthConfig = createRouteAuthConfig(false)
  .addPublicPaths([
    '/health',
    '/api/docs/*',
    '/api/dev/*',
    '/debug/*',
    '/test/*',
  ])
  .addProtectedPaths([
    '/api/admin/*',
  ])
  .route('/api/dev/reset-db')
    .method('POST')
    .requireAuth(false)
    .description('Reset development database')
    .end()
  .route('/api/dev/seed-data')
    .method('POST')
    .requireAuth(false)
    .description('Seed test data')
    .end()
  .enableDebug(true)
  .build();

export const productionConfig: GlobalRouteAuthConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/api/public/info',
  ])
  .addProtectedPaths([
    '/api/*',
  ])
  .enableDebug(false)
  .build();

/**
 * Example 6: API Gateway configuration with rate limiting considerations
 */
export const apiGatewayConfig: GlobalRouteAuthConfig = createRouteAuthConfig(true)
  .addPublicPaths([
    '/health',
    '/api/v1/public/*',
  ])
  .group('v1', '/api/v1')
    .description('API Version 1')
    .defaultRequireAuth(true)
    .route('/users/*')
      .allowApps(['web-app', 'mobile-app', 'admin-panel'])
      .description('User management API')
      .tag('user-service')
      .end()
    .route('/orders/*')
      .allowApps(['web-app', 'mobile-app', 'order-service'])
      .description('Order management API')
      .tag('order-service')
      .end()
    .route('/payments/*')
      .allowApps(['web-app', 'mobile-app', 'payment-service'])
      .description('Payment processing API')
      .tag('payment-service')
      .end()
    .end()
  .group('v2', '/api/v2')
    .description('API Version 2 (Beta)')
    .defaultRequireAuth(true)
    .defaultAllowApps(['beta-testers', 'internal-tools'])
    .route('/users/*')
      .description('Enhanced user management API')
      .tag('user-service-v2')
      .end()
    .end()
  .route('/api/webhooks/*')
    .method('POST')
    .customPermission(async (appId, path, method) => {
      // Webhook apps must be registered and active
      return appId.startsWith('webhook-') && await isWebhookAppActive(appId);
    })
    .description('Webhook endpoints')
    .tag('webhooks')
    .end()
  .build();

// Helper function for webhook validation (example)
async function isWebhookAppActive(appId: string): Promise<boolean> {
  // In a real implementation, this would check a database or cache
  // to verify if the webhook app is still active
  return true;
}

/**
 * Function to get configuration based on environment
 */
export function getConfigForEnvironment(env: string): GlobalRouteAuthConfig {
  switch (env) {
    case 'development':
      return developmentConfig;
    case 'staging':
      return CommonRouteConfigs.createRestApiConfig();
    case 'production':
      return productionConfig;
    default:
      return CommonRouteConfigs.createDevelopmentConfig();
  }
}

/**
 * Function to merge multiple configurations
 */
export function mergeConfigurations(...configs: GlobalRouteAuthConfig[]): GlobalRouteAuthConfig {
  const merged: GlobalRouteAuthConfig = {
    defaultRequireAuth: false,
    publicPaths: [],
    protectedPaths: [],
    routeGroups: [],
    routes: [],
    debug: false,
  };

  for (const config of configs) {
    merged.defaultRequireAuth = config.defaultRequireAuth || merged.defaultRequireAuth;
    merged.publicPaths.push(...config.publicPaths);
    merged.protectedPaths.push(...config.protectedPaths);
    merged.routeGroups.push(...config.routeGroups);
    merged.routes.push(...config.routes);
    merged.debug = config.debug || merged.debug;
  }

  return merged;
}