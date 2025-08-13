import { Hono } from 'hono';
import { createExampleRoutes } from './example.js';
import { createHealthRoutes } from './health.js';
import { createSuccessResponse, type ApiResponse } from '../types/index.js';


// Cloudflare Workers 环境变量接口
interface Env {
  APP_VERSION?: string;
  NODE_ENV?: string;
  [key: string]: any;
}

// 路由配置接口
export interface RouteConfig {
  /** 路由路径前缀 */
  path: string;
  /** 路由版本 */
  version?: string;
  /** 路由描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 路由标签 */
  tags?: string[];
  /** 路由创建函数 */
  factory: () => Hono;
}

// 路由组配置接口
export interface RouteGroup {
  /** 组名称 */
  name: string;
  /** 组路径前缀 */
  prefix: string;
  /** 组版本 */
  version?: string;
  /** 组描述 */
  description?: string;
  /** 组中的路由 */
  routes: RouteConfig[];
  /** 是否启用整个组 */
  enabled?: boolean;
}

// 路由注册表接口
export interface RouteRegistry {
  /** 已注册的路由组 */
  groups: RouteGroup[];
  /** 获取所有启用的路由 */
  getEnabledRoutes(): RouteConfig[];
  /** 根据路径查找路由 */
  findRoute(path: string): RouteConfig | undefined;
  /** 获取路由统计信息 */
  getStats(): RouteStats;
}

// 路由统计信息接口
export interface RouteStats {
  totalGroups: number;
  totalRoutes: number;
  enabledGroups: number;
  enabledRoutes: number;
  versions: string[];
  tags: string[];
}

// 路由信息接口（用于 API 响应）
export interface RouteInfo {
  path: string;
  version?: string;
  description?: string;
  enabled: boolean;
  tags?: string[];
  group: string;
}

/**
 * 路由注册表实现
 */
class RouteRegistryImpl implements RouteRegistry {
  public groups: RouteGroup[] = [];

  getEnabledRoutes(): RouteConfig[] {
    return this.groups
      .filter(group => group.enabled !== false)
      .flatMap(group => group.routes)
      .filter(route => route.enabled !== false);
  }

  findRoute(path: string): RouteConfig | undefined {
    for (const group of this.groups) {
      if (group.enabled === false) continue;
      
      for (const route of group.routes) {
        if (route.enabled === false) continue;
        
        const fullPath = `${group.prefix}${route.path}`.replace(/\/+/g, '/');
        if (fullPath === path || path.startsWith(fullPath)) {
          return route;
        }
      }
    }
    return undefined;
  }

  getStats(): RouteStats {
    const enabledGroups = this.groups.filter(g => g.enabled !== false);
    const enabledRoutes = this.getEnabledRoutes();
    
    const versions = new Set<string>();
    const tags = new Set<string>();

    for (const group of this.groups) {
      if (group.version) versions.add(group.version);
      for (const route of group.routes) {
        if (route.version) versions.add(route.version);
        if (route.tags) route.tags.forEach(tag => tags.add(tag));
      }
    }

    return {
      totalGroups: this.groups.length,
      totalRoutes: this.groups.reduce((sum, g) => sum + g.routes.length, 0),
      enabledGroups: enabledGroups.length,
      enabledRoutes: enabledRoutes.length,
      versions: Array.from(versions).sort(),
      tags: Array.from(tags).sort(),
    };
  }
}

// 全局路由注册表实例
export const routeRegistry = new RouteRegistryImpl();

/**
 * 注册路由组
 */
export function registerRouteGroup(group: RouteGroup): void {
  // 检查是否已存在同名组
  const existingIndex = routeRegistry.groups.findIndex(g => g.name === group.name);
  
  if (existingIndex >= 0) {
    // 替换现有组
    routeRegistry.groups[existingIndex] = group;
  } else {
    // 添加新组
    routeRegistry.groups.push(group);
  }
}

/**
 * 注册单个路由到指定组
 */
export function registerRoute(groupName: string, route: RouteConfig): void {
  const group = routeRegistry.groups.find(g => g.name === groupName);
  
  if (!group) {
    throw new Error(`Route group '${groupName}' not found`);
  }

  // 检查是否已存在同路径的路由
  const existingIndex = group.routes.findIndex(r => r.path === route.path);
  
  if (existingIndex >= 0) {
    // 替换现有路由
    group.routes[existingIndex] = route;
  } else {
    // 添加新路由
    group.routes.push(route);
  }
}

/**
 * 创建路由发现和管理的 API 端点
 */
export function createRouteManagementRoutes(): Hono {
  const app = new Hono();

  // GET /routes - 获取所有路由信息
  app.get('/', async (c) => {
    const routes: RouteInfo[] = [];

    for (const group of routeRegistry.groups) {
      for (const route of group.routes) {
        routes.push({
          path: `${group.prefix}${route.path}`.replace(/\/+/g, '/'),
          version: route.version || group.version,
          description: route.description,
          enabled: route.enabled !== false && group.enabled !== false,
          tags: route.tags,
          group: group.name,
        });
      }
    }

    const response: ApiResponse<RouteInfo[]> = createSuccessResponse(
      routes,
      'Routes retrieved successfully'
    );

    return c.json(response);
  });

  // GET /routes/stats - 获取路由统计信息
  app.get('/stats', async (c) => {
    const stats = routeRegistry.getStats();

    const response: ApiResponse<RouteStats> = createSuccessResponse(
      stats,
      'Route statistics retrieved successfully'
    );

    return c.json(response);
  });

  // GET /routes/groups - 获取路由组信息
  app.get('/groups', async (c) => {
    const groups = routeRegistry.groups.map(group => ({
      name: group.name,
      prefix: group.prefix,
      version: group.version,
      description: group.description,
      enabled: group.enabled !== false,
      routeCount: group.routes.length,
      enabledRouteCount: group.routes.filter(r => r.enabled !== false).length,
    }));

    const response: ApiResponse<typeof groups> = createSuccessResponse(
      groups,
      'Route groups retrieved successfully'
    );

    return c.json(response);
  });

  // GET /routes/versions - 获取所有版本信息
  app.get('/versions', async (c) => {
    const stats = routeRegistry.getStats();
    const versionInfo = stats.versions.map(version => {
      const routesInVersion = routeRegistry.groups
        .flatMap(group => group.routes.map(route => ({
          ...route,
          groupName: group.name,
          groupPrefix: group.prefix,
          effectiveVersion: route.version || group.version,
        })))
        .filter(route => route.effectiveVersion === version);

      return {
        version,
        routeCount: routesInVersion.length,
        groups: [...new Set(routesInVersion.map(r => r.groupName))],
      };
    });

    const response: ApiResponse<typeof versionInfo> = createSuccessResponse(
      versionInfo,
      'Version information retrieved successfully'
    );

    return c.json(response);
  });

  return app;
}

/**
 * 注册所有默认路由组
 */
export function registerDefaultRoutes(): void {
  // 注册健康检查路由组
  registerRouteGroup({
    name: 'health',
    prefix: '/health',
    version: 'v1',
    description: 'Health check and system monitoring endpoints',
    enabled: true,
    routes: [
      {
        path: '',
        description: 'Main health check endpoint',
        enabled: true,
        tags: ['health', 'monitoring'],
        factory: createHealthRoutes,
      },
    ],
  });

  // 注册示例 API 路由组
  registerRouteGroup({
    name: 'examples',
    prefix: '/examples',
    version: 'v1',
    description: 'Example CRUD API endpoints',
    enabled: true,
    routes: [
      {
        path: '',
        description: 'Example items CRUD operations',
        enabled: true,
        tags: ['crud', 'examples'],
        factory: createExampleRoutes,
      },
    ],
  });

  // 注册路由管理 API 组
  registerRouteGroup({
    name: 'meta',
    prefix: '/meta/routes',
    version: 'v1',
    description: 'Route discovery and management endpoints',
    enabled: true,
    routes: [
      {
        path: '',
        description: 'Route management and discovery',
        enabled: true,
        tags: ['meta', 'management'],
        factory: createRouteManagementRoutes,
      },
    ],
  });

  
}

/**
 * 构建完整的 API 应用，包含所有注册的路由
 */
export function buildApiApp(): Hono {
  const app = new Hono();

  // 注册默认路由
  registerDefaultRoutes();

  // 添加所有启用的路由组
  for (const group of routeRegistry.groups) {
    if (group.enabled === false) continue;

    for (const route of group.routes) {
      if (route.enabled === false) continue;

      const routePath = `${group.prefix}${route.path}`.replace(/\/+/g, '/');
      const routeApp = route.factory();
      
      app.route(routePath, routeApp);
    }
  }

  // 添加根路径的 API 信息端点
  app.get('/', async (c) => {
    const stats = routeRegistry.getStats();
    const env = (c.env as Env) || {};
    
    const apiInfo = {
      name: 'Hono API',
      version: env.APP_VERSION || '1.0.0',
      description: 'RESTful API built with Hono framework',
      timestamp: new Date().toISOString(),
      routes: {
        total: stats.totalRoutes,
        enabled: stats.enabledRoutes,
        groups: stats.totalGroups,
      },
      versions: stats.versions,
      endpoints: {
        health: '/api/health',
        examples: '/api/examples',
        routes: '/api/meta/routes',
        documentation: '/api/meta/routes'
      },
    };

    const response: ApiResponse<typeof apiInfo> = createSuccessResponse(
      apiInfo,
      'API information retrieved successfully'
    );

    return c.json(response);
  });

  return app;
}

// 导出路由工厂函数以便在其他地方使用
export { createExampleRoutes, createHealthRoutes };