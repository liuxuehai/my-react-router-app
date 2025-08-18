import { describe, it, expect, beforeEach } from 'vitest';
import { 
  RouteAuthConfigManager, 
  createDefaultRouteAuthConfig,
  type GlobalRouteAuthConfig,
  type RouteAuthConfig 
} from '../../../app/api/auth/route-config.js';

describe('RouteAuthConfigManager', () => {
  let configManager: RouteAuthConfigManager;
  let config: GlobalRouteAuthConfig;

  beforeEach(() => {
    config = {
      defaultRequireAuth: false,
      publicPaths: ['/health', '/api/public/*'],
      protectedPaths: ['/api/admin/*'],
      routeGroups: [
        {
          name: 'admin',
          basePath: '/api/admin',
          defaultConfig: {
            requireAuth: true,
            allowedApps: ['admin-app'],
          },
          routes: [
            {
              path: '/users',
              methods: ['GET', 'POST'],
              requireAuth: true,
            },
            {
              path: '/config',
              methods: ['GET', 'PUT'],
              requireAuth: true,
              allowedApps: ['admin-app', 'config-app'],
            },
          ],
        },
      ],
      routes: [
        {
          path: '/api/webhook',
          methods: ['POST'],
          requireAuth: true,
          customPermissionCheck: async (appId) => appId.startsWith('webhook_'),
        },
        {
          path: '/api/data/*',
          methods: '*',
          requireAuth: true,
          allowedApps: ['data-app'],
        },
      ],
      debug: true,
    };

    configManager = new RouteAuthConfigManager(config);
  });

  describe('requiresAuth', () => {
    it('should return false for public paths', () => {
      expect(configManager.requiresAuth('/health', 'GET')).toBe(false);
      expect(configManager.requiresAuth('/api/public/info', 'GET')).toBe(false);
    });

    it('should return true for protected paths', () => {
      expect(configManager.requiresAuth('/api/admin/users', 'GET')).toBe(true);
      expect(configManager.requiresAuth('/api/admin/config', 'POST')).toBe(true);
    });

    it('should return true for specific route configurations', () => {
      expect(configManager.requiresAuth('/api/webhook', 'POST')).toBe(true);
      expect(configManager.requiresAuth('/api/data/users', 'GET')).toBe(true);
    });

    it('should return default value for unmatched paths', () => {
      expect(configManager.requiresAuth('/api/unknown', 'GET')).toBe(false);
    });

    it('should handle regex patterns in public paths', () => {
      const configWithRegex: GlobalRouteAuthConfig = {
        ...config,
        publicPaths: [/^\/api\/v\d+\/public/],
      };
      const manager = new RouteAuthConfigManager(configWithRegex);
      
      expect(manager.requiresAuth('/api/v1/public/info', 'GET')).toBe(false);
      expect(manager.requiresAuth('/api/v2/public/data', 'GET')).toBe(false);
      expect(manager.requiresAuth('/api/public/info', 'GET')).toBe(false); // default
    });
  });

  describe('checkAppPermission', () => {
    it('should allow access when no specific app restrictions', async () => {
      const result = await configManager.checkAppPermission('any-app', '/api/webhook', 'POST');
      expect(result).toBe(false); // custom permission check should fail for non-webhook apps
    });

    it('should allow access for webhook apps with custom permission check', async () => {
      const result = await configManager.checkAppPermission('webhook_123', '/api/webhook', 'POST');
      expect(result).toBe(true);
    });

    it('should deny access for apps in denied list', async () => {
      const configWithDenied: GlobalRouteAuthConfig = {
        ...config,
        routes: [
          {
            path: '/api/test',
            methods: ['GET'],
            requireAuth: true,
            deniedApps: ['blocked-app'],
          },
        ],
      };
      const manager = new RouteAuthConfigManager(configWithDenied);
      
      const result = await manager.checkAppPermission('blocked-app', '/api/test', 'GET');
      expect(result).toBe(false);
    });

    it('should allow only apps in allowed list when specified', async () => {
      const result1 = await configManager.checkAppPermission('data-app', '/api/data/users', 'GET');
      expect(result1).toBe(true);

      const result2 = await configManager.checkAppPermission('other-app', '/api/data/users', 'GET');
      expect(result2).toBe(false);
    });

    it('should handle route group permissions', async () => {
      const result1 = await configManager.checkAppPermission('admin-app', '/api/admin/users', 'GET');
      expect(result1).toBe(true);

      const result2 = await configManager.checkAppPermission('other-app', '/api/admin/users', 'GET');
      expect(result2).toBe(false);
    });

    it('should merge route group and route specific permissions', async () => {
      // config-app is allowed for /api/admin/config but not for /api/admin/users
      const result1 = await configManager.checkAppPermission('config-app', '/api/admin/config', 'GET');
      expect(result1).toBe(true);

      const result2 = await configManager.checkAppPermission('config-app', '/api/admin/users', 'GET');
      expect(result2).toBe(false);
    });
  });

  describe('getRouteAuthInfo', () => {
    it('should return complete route information', () => {
      const info = configManager.getRouteAuthInfo('/api/admin/users', 'GET');
      
      expect(info).toEqual({
        path: '/api/admin/users',
        method: 'GET',
        requiresAuth: true,
        matchedRoute: {
          path: '/api/admin/users',
          methods: ['GET', 'POST'],
          allowedApps: ['admin-app'],
          deniedApps: undefined,
          description: undefined,
          tags: undefined,
        },
        isPublic: false,
        isProtected: true,
      });
    });

    it('should identify public routes', () => {
      const info = configManager.getRouteAuthInfo('/health', 'GET');
      
      expect(info.isPublic).toBe(true);
      expect(info.requiresAuth).toBe(false);
    });

    it('should handle unmatched routes', () => {
      const info = configManager.getRouteAuthInfo('/api/unknown', 'GET');
      
      expect(info.matchedRoute).toBeNull();
      expect(info.requiresAuth).toBe(false); // default
    });
  });

  describe('route management', () => {
    it('should add new routes', () => {
      const newRoute: RouteAuthConfig = {
        path: '/api/new',
        methods: ['GET'],
        requireAuth: true,
      };

      configManager.addRoute(newRoute);
      
      const info = configManager.getRouteAuthInfo('/api/new', 'GET');
      expect(info.requiresAuth).toBe(true);
    });

    it('should remove routes', () => {
      const removed = configManager.removeRoute('/api/webhook', ['POST']);
      expect(removed).toBe(true);
      
      const info = configManager.getRouteAuthInfo('/api/webhook', 'POST');
      expect(info.matchedRoute).toBeNull();
    });

    it('should get all routes', () => {
      const routes = configManager.getAllRoutes();
      expect(routes).toHaveLength(2); // webhook and data routes
    });

    it('should get all route groups', () => {
      const groups = configManager.getAllRouteGroups();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('admin');
    });
  });

  describe('path matching', () => {
    it('should match exact paths', () => {
      expect(configManager.requiresAuth('/health', 'GET')).toBe(false);
    });

    it('should match wildcard paths', () => {
      expect(configManager.requiresAuth('/api/public/info', 'GET')).toBe(false);
      expect(configManager.requiresAuth('/api/public/data/users', 'GET')).toBe(false);
    });

    it('should match regex patterns', () => {
      const configWithRegex: GlobalRouteAuthConfig = {
        ...config,
        routes: [
          ...config.routes, // keep existing routes
          {
            path: /^\/api\/v\d+\/data/,
            methods: '*',
            requireAuth: true,
          },
        ],
      };
      const manager = new RouteAuthConfigManager(configWithRegex);
      
      expect(manager.requiresAuth('/api/v1/data', 'GET')).toBe(true);
      expect(manager.requiresAuth('/api/v2/data/users', 'POST')).toBe(true);
      expect(manager.requiresAuth('/api/data/users', 'GET')).toBe(true); // matches existing wildcard route
    });

    it('should prioritize more specific paths', () => {
      const configWithPriority: GlobalRouteAuthConfig = {
        ...config,
        routes: [
          {
            path: '/api/data/*',
            methods: '*',
            requireAuth: true,
            allowedApps: ['data-app'],
          },
          {
            path: '/api/data/public',
            methods: '*',
            requireAuth: false,
          },
        ],
      };
      const manager = new RouteAuthConfigManager(configWithPriority);
      
      // More specific path should take precedence
      expect(manager.requiresAuth('/api/data/public', 'GET')).toBe(false);
      expect(manager.requiresAuth('/api/data/private', 'GET')).toBe(true);
    });
  });

  describe('method matching', () => {
    it('should match specific methods', () => {
      expect(configManager.requiresAuth('/api/admin/users', 'GET')).toBe(true);
      expect(configManager.requiresAuth('/api/admin/users', 'POST')).toBe(true);
      expect(configManager.requiresAuth('/api/admin/users', 'DELETE')).toBe(true); // falls back to protected path pattern
    });

    it('should match all methods with wildcard', () => {
      expect(configManager.requiresAuth('/api/data/users', 'GET')).toBe(true);
      expect(configManager.requiresAuth('/api/data/users', 'POST')).toBe(true);
      expect(configManager.requiresAuth('/api/data/users', 'DELETE')).toBe(true);
    });
  });
});

describe('createDefaultRouteAuthConfig', () => {
  it('should create a valid default configuration', () => {
    const config = createDefaultRouteAuthConfig();
    
    expect(config.defaultRequireAuth).toBe(false);
    expect(config.publicPaths).toContain('/health');
    expect(config.protectedPaths).toContain('/api/admin/*');
    expect(config.routeGroups).toHaveLength(2);
    expect(config.routes).toHaveLength(1);
  });

  it('should work with RouteAuthConfigManager', () => {
    const config = createDefaultRouteAuthConfig();
    const manager = new RouteAuthConfigManager(config);
    
    expect(manager.requiresAuth('/health', 'GET')).toBe(false);
    expect(manager.requiresAuth('/api/admin/users', 'GET')).toBe(true);
  });
});