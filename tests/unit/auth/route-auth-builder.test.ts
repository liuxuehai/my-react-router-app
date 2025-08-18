import { describe, it, expect } from 'vitest';
import { 
  createRouteAuthConfig, 
  CommonRouteConfigs,
  RouteAuthConfigBuilder 
} from '../../../app/api/auth/route-auth-builder.js';

describe('RouteAuthConfigBuilder', () => {
  describe('basic configuration', () => {
    it('should create a basic configuration', () => {
      const config = createRouteAuthConfig(true)
        .addPublicPath('/health')
        .addProtectedPath('/api/admin/*')
        .enableDebug(true)
        .build();

      expect(config.defaultRequireAuth).toBe(true);
      expect(config.publicPaths).toContain('/health');
      expect(config.protectedPaths).toContain('/api/admin/*');
      expect(config.debug).toBe(true);
    });

    it('should handle multiple public and protected paths', () => {
      const config = createRouteAuthConfig()
        .addPublicPaths(['/health', '/status', '/api/public/*'])
        .addProtectedPaths(['/api/admin/*', '/api/secure/*'])
        .build();

      expect(config.publicPaths).toHaveLength(3);
      expect(config.protectedPaths).toHaveLength(2);
    });
  });

  describe('route configuration', () => {
    it('should add simple routes', () => {
      const config = createRouteAuthConfig()
        .route('/api/users')
          .method('GET')
          .requireAuth(true)
          .description('Get users')
          .end()
        .build();

      expect(config.routes).toHaveLength(1);
      expect(config.routes[0]).toEqual({
        path: '/api/users',
        methods: ['GET'],
        requireAuth: true,
        description: 'Get users',
      });
    });

    it('should configure route permissions', () => {
      const config = createRouteAuthConfig()
        .route('/api/data')
          .methods(['GET', 'POST'])
          .allowApps(['app1', 'app2'])
          .denyApp('blocked-app')
          .tags(['data', 'api'])
          .end()
        .build();

      const route = config.routes[0];
      expect(route.methods).toEqual(['GET', 'POST']);
      expect(route.allowedApps).toEqual(['app1', 'app2']);
      expect(route.deniedApps).toEqual(['blocked-app']);
      expect(route.tags).toEqual(['data', 'api']);
    });

    it('should support custom permission checks', () => {
      const customCheck = (appId: string) => appId.startsWith('webhook_');
      
      const config = createRouteAuthConfig()
        .route('/api/webhook')
          .method('POST')
          .customPermission(customCheck)
          .end()
        .build();

      expect(config.routes[0].customPermissionCheck).toBe(customCheck);
    });

    it('should support public and protected shortcuts', () => {
      const config = createRouteAuthConfig()
        .route('/api/public')
          .public()
          .end()
        .route('/api/secure')
          .protected()
          .end()
        .build();

      expect(config.routes[0].requireAuth).toBe(false);
      expect(config.routes[1].requireAuth).toBe(true);
    });
  });

  describe('route group configuration', () => {
    it('should create route groups with default config', () => {
      const config = createRouteAuthConfig()
        .group('admin', '/api/admin')
          .description('Admin APIs')
          .defaultRequireAuth(true)
          .defaultAllowApps(['admin-app'])
          .route('/users')
            .methods(['GET', 'POST'])
            .end()
          .route('/config')
            .method('PUT')
            .allowApp('config-app')
            .end()
          .end()
        .build();

      expect(config.routeGroups).toHaveLength(1);
      
      const group = config.routeGroups[0];
      expect(group.name).toBe('admin');
      expect(group.basePath).toBe('/api/admin');
      expect(group.description).toBe('Admin APIs');
      expect(group.defaultConfig.requireAuth).toBe(true);
      expect(group.defaultConfig.allowedApps).toEqual(['admin-app']);
      expect(group.routes).toHaveLength(2);
    });

    it('should merge group defaults with route specifics', () => {
      const config = createRouteAuthConfig()
        .group('api', '/api')
          .defaultRequireAuth(true)
          .defaultAllowApps(['default-app'])
          .route('/data')
            .allowApp('data-app') // should merge with default
            .end()
          .route('/public')
            .public() // should override default
            .end()
          .end()
        .build();

      const group = config.routeGroups[0];
      expect(group.routes[0].allowedApps).toEqual(['data-app']);
      expect(group.routes[1].requireAuth).toBe(false);
    });
  });

  describe('fluent API chaining', () => {
    it('should support complex chaining', () => {
      const config = createRouteAuthConfig(false)
        .addPublicPaths(['/health', '/status'])
        .addProtectedPath('/api/admin/*')
        .route('/api/webhook')
          .method('POST')
          .customPermission(async (appId) => appId.startsWith('webhook_'))
          .description('Webhook endpoint')
          .tag('webhook')
          .end()
        .group('admin', '/api/admin')
          .description('Admin interface')
          .defaultRequireAuth(true)
          .defaultAllowApps(['admin-app'])
          .route('/users/*')
            .methods(['GET', 'POST', 'PUT', 'DELETE'])
            .description('User management')
            .end()
          .route('/logs')
            .method('GET')
            .allowApp('log-viewer')
            .description('View logs')
            .end()
          .end()
        .enableDebug(true)
        .build();

      expect(config.defaultRequireAuth).toBe(false);
      expect(config.publicPaths).toHaveLength(2);
      expect(config.protectedPaths).toHaveLength(1);
      expect(config.routes).toHaveLength(1);
      expect(config.routeGroups).toHaveLength(1);
      expect(config.debug).toBe(true);
    });
  });
});

describe('CommonRouteConfigs', () => {
  describe('createRestApiConfig', () => {
    it('should create a valid REST API configuration', () => {
      const config = CommonRouteConfigs.createRestApiConfig();

      expect(config.defaultRequireAuth).toBe(true);
      expect(config.publicPaths).toContain('/health');
      expect(config.publicPaths).toContain('/api/public/*');
      expect(config.protectedPaths).toContain('/api/admin/*');
      expect(config.routeGroups).toHaveLength(3);
    });

    it('should have proper route group structure', () => {
      const config = CommonRouteConfigs.createRestApiConfig();
      
      const publicGroup = config.routeGroups.find(g => g.name === 'public');
      expect(publicGroup).toBeDefined();
      expect(publicGroup?.defaultConfig.requireAuth).toBe(false);
      
      const adminGroup = config.routeGroups.find(g => g.name === 'admin');
      expect(adminGroup).toBeDefined();
      expect(adminGroup?.defaultConfig.requireAuth).toBe(true);
    });
  });

  describe('createMicroserviceConfig', () => {
    it('should create a valid microservice configuration', () => {
      const config = CommonRouteConfigs.createMicroserviceConfig();

      expect(config.defaultRequireAuth).toBe(true);
      expect(config.publicPaths).toContain('/health');
      expect(config.publicPaths).toContain('/metrics');
      expect(config.routeGroups).toHaveLength(2);
    });

    it('should have internal service restrictions', () => {
      const config = CommonRouteConfigs.createMicroserviceConfig();
      
      const internalGroup = config.routeGroups.find(g => g.name === 'internal');
      expect(internalGroup?.defaultConfig.allowedApps).toContain('service-a');
      expect(internalGroup?.defaultConfig.allowedApps).toContain('gateway');
    });
  });

  describe('createDevelopmentConfig', () => {
    it('should create a permissive development configuration', () => {
      const config = CommonRouteConfigs.createDevelopmentConfig();

      expect(config.defaultRequireAuth).toBe(false);
      expect(config.publicPaths).toContain('/debug/*');
      expect(config.debug).toBe(true);
    });
  });

  describe('createProductionConfig', () => {
    it('should create a restrictive production configuration', () => {
      const config = CommonRouteConfigs.createProductionConfig();

      expect(config.defaultRequireAuth).toBe(true);
      expect(config.publicPaths).toHaveLength(2); // only health and public info
      expect(config.debug).toBe(false);
    });
  });
});