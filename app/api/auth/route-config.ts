/**
 * 路由级别的认证控制配置
 */

export interface RouteAuthConfig {
  /** 路径模式 */
  path: string | RegExp;
  /** HTTP 方法，* 表示所有方法 */
  methods: string[] | '*';
  /** 是否需要签名认证 */
  requireAuth: boolean;
  /** 允许访问的应用 ID 列表，空数组表示所有已认证应用都可以访问 */
  allowedApps?: string[];
  /** 拒绝访问的应用 ID 列表 */
  deniedApps?: string[];
  /** 自定义权限检查函数 */
  customPermissionCheck?: (appId: string, path: string, method: string) => boolean | Promise<boolean>;
  /** 配置描述 */
  description?: string;
  /** 配置标签 */
  tags?: string[];
}

export interface RouteGroupConfig {
  /** 组名 */
  name: string;
  /** 基础路径前缀 */
  basePath: string;
  /** 组级别的默认配置 */
  defaultConfig: Partial<RouteAuthConfig>;
  /** 组内的路由配置 */
  routes: RouteAuthConfig[];
  /** 组描述 */
  description?: string;
}

export interface GlobalRouteAuthConfig {
  /** 默认是否需要认证 */
  defaultRequireAuth: boolean;
  /** 全局公开路径（不需要认证） */
  publicPaths: (string | RegExp)[];
  /** 全局受保护路径（必须认证） */
  protectedPaths: (string | RegExp)[];
  /** 路由组配置 */
  routeGroups: RouteGroupConfig[];
  /** 独立路由配置 */
  routes: RouteAuthConfig[];
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 路由认证配置管理器
 */
export class RouteAuthConfigManager {
  private config: GlobalRouteAuthConfig;
  private compiledRoutes: CompiledRouteConfig[] = [];

  constructor(config: GlobalRouteAuthConfig) {
    this.config = config;
    this.compileRoutes();
  }

  /**
   * 更新配置
   */
  updateConfig(config: GlobalRouteAuthConfig): void {
    this.config = config;
    this.compileRoutes();
  }

  /**
   * 检查路径是否需要认证
   */
  requiresAuth(path: string, method: string): boolean {
    // 首先检查全局公开路径
    if (this.matchesPatterns(path, this.config.publicPaths)) {
      return false;
    }

    // 然后检查全局受保护路径
    if (this.matchesPatterns(path, this.config.protectedPaths)) {
      return true;
    }

    // 检查编译后的路由配置
    const matchedRoute = this.findMatchingRoute(path, method);
    if (matchedRoute) {
      return matchedRoute.requireAuth;
    }

    // 返回默认配置
    return this.config.defaultRequireAuth;
  }

  /**
   * 检查应用是否有权限访问指定路径
   */
  async checkAppPermission(appId: string, path: string, method: string): Promise<boolean> {
    const matchedRoute = this.findMatchingRoute(path, method);
    
    if (!matchedRoute) {
      // 没有匹配的路由配置，默认允许（如果已通过基础认证）
      return true;
    }

    // 检查拒绝列表
    if (matchedRoute.deniedApps && matchedRoute.deniedApps.includes(appId)) {
      if (this.config.debug) {
        console.log(`[RouteAuthConfig] App ${appId} is denied access to ${path}`);
      }
      return false;
    }

    // 检查允许列表
    if (matchedRoute.allowedApps && matchedRoute.allowedApps.length > 0) {
      const isAllowed = matchedRoute.allowedApps.includes(appId);
      if (!isAllowed && this.config.debug) {
        console.log(`[RouteAuthConfig] App ${appId} is not in allowed list for ${path}`);
      }
      return isAllowed;
    }

    // 执行自定义权限检查
    if (matchedRoute.customPermissionCheck) {
      try {
        const result = await matchedRoute.customPermissionCheck(appId, path, method);
        if (this.config.debug) {
          console.log(`[RouteAuthConfig] Custom permission check for app ${appId} on ${path}: ${result}`);
        }
        return result;
      } catch (error) {
        if (this.config.debug) {
          console.error(`[RouteAuthConfig] Custom permission check failed:`, error);
        }
        return false;
      }
    }

    // 默认允许
    return true;
  }

  /**
   * 获取路径的认证配置信息
   */
  getRouteAuthInfo(path: string, method: string): RouteAuthInfo {
    const requiresAuth = this.requiresAuth(path, method);
    const matchedRoute = this.findMatchingRoute(path, method);

    return {
      path,
      method,
      requiresAuth,
      matchedRoute: matchedRoute ? {
        path: matchedRoute.path,
        methods: matchedRoute.methods,
        allowedApps: matchedRoute.allowedApps,
        deniedApps: matchedRoute.deniedApps,
        description: matchedRoute.description,
        tags: matchedRoute.tags,
      } : null,
      isPublic: this.matchesPatterns(path, this.config.publicPaths),
      isProtected: this.matchesPatterns(path, this.config.protectedPaths),
    };
  }

  /**
   * 添加路由配置
   */
  addRoute(route: RouteAuthConfig): void {
    this.config.routes.push(route);
    this.compileRoutes();
  }

  /**
   * 添加路由组
   */
  addRouteGroup(group: RouteGroupConfig): void {
    this.config.routeGroups.push(group);
    this.compileRoutes();
  }

  /**
   * 移除路由配置
   */
  removeRoute(path: string | RegExp, methods?: string[] | '*'): boolean {
    const initialLength = this.config.routes.length;
    this.config.routes = this.config.routes.filter(route => {
      if (typeof path === 'string' && typeof route.path === 'string') {
        return !(route.path === path && (!methods || this.methodsMatch(route.methods, methods)));
      }
      if (path instanceof RegExp && route.path instanceof RegExp) {
        return !(route.path.source === path.source && (!methods || this.methodsMatch(route.methods, methods)));
      }
      return true;
    });

    if (this.config.routes.length !== initialLength) {
      this.compileRoutes();
      return true;
    }
    return false;
  }

  /**
   * 获取所有路由配置
   */
  getAllRoutes(): RouteAuthConfig[] {
    return [...this.config.routes];
  }

  /**
   * 获取所有路由组配置
   */
  getAllRouteGroups(): RouteGroupConfig[] {
    return [...this.config.routeGroups];
  }

  private compileRoutes(): void {
    this.compiledRoutes = [];

    // 编译独立路由
    for (const route of this.config.routes) {
      this.compiledRoutes.push(this.compileRoute(route));
    }

    // 编译路由组
    for (const group of this.config.routeGroups) {
      for (const route of group.routes) {
        const compiledRoute = this.compileRoute(route, group);
        this.compiledRoutes.push(compiledRoute);
      }
    }

    // 按优先级排序（更具体的路径优先）
    this.compiledRoutes.sort((a, b) => {
      // RegExp 路径优先级较低
      if (a.isRegex && !b.isRegex) return 1;
      if (!a.isRegex && b.isRegex) return -1;
      
      // 字符串路径按长度排序（更长的更具体）
      if (!a.isRegex && !b.isRegex) {
        return (b.path as string).length - (a.path as string).length;
      }
      
      return 0;
    });
  }

  private compileRoute(route: RouteAuthConfig, group?: RouteGroupConfig): CompiledRouteConfig {
    let compiledPath: string | RegExp;
    
    if (group) {
      // 如果是路由组中的路由，需要合并基础路径
      if (typeof route.path === 'string') {
        compiledPath = this.joinPaths(group.basePath, route.path);
      } else {
        // 对于正则表达式，需要特殊处理
        compiledPath = route.path;
      }
    } else {
      compiledPath = route.path;
    }

    // 合并组默认配置和路由配置
    const mergedConfig = group ? { ...group.defaultConfig, ...route } : route;

    return {
      path: compiledPath,
      isRegex: compiledPath instanceof RegExp,
      methods: mergedConfig.methods || '*',
      requireAuth: mergedConfig.requireAuth ?? true,
      allowedApps: mergedConfig.allowedApps,
      deniedApps: mergedConfig.deniedApps,
      customPermissionCheck: mergedConfig.customPermissionCheck,
      description: mergedConfig.description,
      tags: mergedConfig.tags,
      groupName: group?.name,
    };
  }

  private findMatchingRoute(path: string, method: string): CompiledRouteConfig | null {
    for (const route of this.compiledRoutes) {
      if (this.matchesRoute(path, method, route)) {
        return route;
      }
    }
    return null;
  }

  private matchesRoute(path: string, method: string, route: CompiledRouteConfig): boolean {
    // 检查路径匹配
    const pathMatches = route.isRegex 
      ? (route.path as RegExp).test(path)
      : this.matchPath(path, route.path as string);

    if (!pathMatches) {
      return false;
    }

    // 检查方法匹配
    if (route.methods === '*') {
      return true;
    }

    return (route.methods as string[]).includes(method.toUpperCase());
  }

  private matchPath(path: string, pattern: string): boolean {
    // 支持通配符匹配
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}$`).test(path);
    }

    // 精确匹配或前缀匹配
    return path === pattern || path.startsWith(pattern);
  }

  private matchesPatterns(path: string, patterns: (string | RegExp)[]): boolean {
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return this.matchPath(path, pattern);
      }
      return pattern.test(path);
    });
  }

  private methodsMatch(methods1: string[] | '*', methods2: string[] | '*'): boolean {
    if (methods1 === '*' && methods2 === '*') return true;
    if (methods1 === '*' || methods2 === '*') return false;
    
    const set1 = new Set(methods1);
    const set2 = new Set(methods2);
    
    if (set1.size !== set2.size) return false;
    
    for (const method of set1) {
      if (!set2.has(method)) return false;
    }
    
    return true;
  }

  private joinPaths(basePath: string, path: string): string {
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    return `${cleanBase}/${cleanPath}`;
  }
}

interface CompiledRouteConfig extends RouteAuthConfig {
  isRegex: boolean;
  groupName?: string;
}

export interface RouteAuthInfo {
  path: string;
  method: string;
  requiresAuth: boolean;
  matchedRoute: {
    path: string | RegExp;
    methods: string[] | '*';
    allowedApps?: string[];
    deniedApps?: string[];
    description?: string;
    tags?: string[];
  } | null;
  isPublic: boolean;
  isProtected: boolean;
}

/**
 * 创建默认的路由认证配置
 */
export function createDefaultRouteAuthConfig(): GlobalRouteAuthConfig {
  return {
    defaultRequireAuth: false,
    publicPaths: [
      '/health',
      '/api/health',
      '/api/public/*',
      /^\/api\/docs/,
    ],
    protectedPaths: [
      '/api/admin/*',
      '/api/secure/*',
    ],
    routeGroups: [
      {
        name: 'admin',
        basePath: '/api/admin',
        description: '管理员接口',
        defaultConfig: {
          requireAuth: true,
          allowedApps: [], // 需要在具体配置中指定
        },
        routes: [
          {
            path: '/users/*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            requireAuth: true,
            description: '用户管理接口',
          },
          {
            path: '/config/*',
            methods: ['GET', 'POST', 'PUT'],
            requireAuth: true,
            description: '配置管理接口',
          },
        ],
      },
      {
        name: 'api',
        basePath: '/api',
        description: '通用 API 接口',
        defaultConfig: {
          requireAuth: true,
        },
        routes: [
          {
            path: '/users/profile',
            methods: ['GET', 'PUT'],
            requireAuth: true,
            description: '用户个人资料接口',
          },
          {
            path: '/data/*',
            methods: '*',
            requireAuth: true,
            description: '数据接口',
          },
        ],
      },
    ],
    routes: [
      {
        path: '/api/webhook',
        methods: ['POST'],
        requireAuth: true,
        description: 'Webhook 接口',
        customPermissionCheck: async (appId, path, method) => {
          // 自定义权限检查逻辑
          return appId.startsWith('webhook_');
        },
      },
    ],
    debug: false,
  };
}