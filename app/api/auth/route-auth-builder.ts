/**
 * 路由认证配置构建器
 * 提供流畅的 API 来构建复杂的路由认证配置
 */

import type { 
  RouteAuthConfig, 
  RouteGroupConfig, 
  GlobalRouteAuthConfig 
} from "./route-config.js";

export class RouteAuthConfigBuilder {
  private config: GlobalRouteAuthConfig;

  constructor(defaultRequireAuth: boolean = false) {
    this.config = {
      defaultRequireAuth,
      publicPaths: [],
      protectedPaths: [],
      routeGroups: [],
      routes: [],
      debug: false,
    };
  }

  /**
   * 设置默认认证要求
   */
  setDefaultRequireAuth(requireAuth: boolean): this {
    this.config.defaultRequireAuth = requireAuth;
    return this;
  }

  /**
   * 添加公开路径（不需要认证）
   */
  addPublicPath(path: string | RegExp): this {
    this.config.publicPaths.push(path);
    return this;
  }

  /**
   * 批量添加公开路径
   */
  addPublicPaths(paths: (string | RegExp)[]): this {
    this.config.publicPaths.push(...paths);
    return this;
  }

  /**
   * 添加受保护路径（必须认证）
   */
  addProtectedPath(path: string | RegExp): this {
    this.config.protectedPaths.push(path);
    return this;
  }

  /**
   * 批量添加受保护路径
   */
  addProtectedPaths(paths: (string | RegExp)[]): this {
    this.config.protectedPaths.push(...paths);
    return this;
  }

  /**
   * 添加路由配置
   */
  addRoute(route: RouteAuthConfig): this {
    this.config.routes.push(route);
    return this;
  }

  /**
   * 添加路由组
   */
  addRouteGroup(group: RouteGroupConfig): this {
    this.config.routeGroups.push(group);
    return this;
  }

  /**
   * 启用调试模式
   */
  enableDebug(debug: boolean = true): this {
    this.config.debug = debug;
    return this;
  }

  /**
   * 构建配置
   */
  build(): GlobalRouteAuthConfig {
    return { ...this.config };
  }

  /**
   * 创建路由构建器
   */
  route(path: string | RegExp): RouteBuilder {
    return new RouteBuilder(path, this);
  }

  /**
   * 创建路由组构建器
   */
  group(name: string, basePath: string): RouteGroupBuilder {
    return new RouteGroupBuilder(name, basePath, this);
  }
}

export class RouteBuilder {
  private route: RouteAuthConfig;
  private parent: RouteAuthConfigBuilder;

  constructor(path: string | RegExp, parent: RouteAuthConfigBuilder) {
    this.route = {
      path,
      methods: '*',
      requireAuth: true,
    };
    this.parent = parent;
  }

  /**
   * 设置 HTTP 方法
   */
  methods(methods: string[] | '*'): this {
    this.route.methods = methods;
    return this;
  }

  /**
   * 设置单个 HTTP 方法
   */
  method(method: string): this {
    this.route.methods = [method.toUpperCase()];
    return this;
  }

  /**
   * 设置是否需要认证
   */
  requireAuth(requireAuth: boolean = true): this {
    this.route.requireAuth = requireAuth;
    return this;
  }

  /**
   * 设置为公开路由（不需要认证）
   */
  public(): this {
    this.route.requireAuth = false;
    return this;
  }

  /**
   * 设置为受保护路由（需要认证）
   */
  protected(): this {
    this.route.requireAuth = true;
    return this;
  }

  /**
   * 设置允许访问的应用 ID 列表
   */
  allowApps(appIds: string[]): this {
    this.route.allowedApps = appIds;
    return this;
  }

  /**
   * 添加允许访问的应用 ID
   */
  allowApp(appId: string): this {
    if (!this.route.allowedApps) {
      this.route.allowedApps = [];
    }
    this.route.allowedApps.push(appId);
    return this;
  }

  /**
   * 设置拒绝访问的应用 ID 列表
   */
  denyApps(appIds: string[]): this {
    this.route.deniedApps = appIds;
    return this;
  }

  /**
   * 添加拒绝访问的应用 ID
   */
  denyApp(appId: string): this {
    if (!this.route.deniedApps) {
      this.route.deniedApps = [];
    }
    this.route.deniedApps.push(appId);
    return this;
  }

  /**
   * 设置自定义权限检查函数
   */
  customPermission(check: (appId: string, path: string, method: string) => boolean | Promise<boolean>): this {
    this.route.customPermissionCheck = check;
    return this;
  }

  /**
   * 设置描述
   */
  description(description: string): this {
    this.route.description = description;
    return this;
  }

  /**
   * 设置标签
   */
  tags(tags: string[]): this {
    this.route.tags = tags;
    return this;
  }

  /**
   * 添加标签
   */
  tag(tag: string): this {
    if (!this.route.tags) {
      this.route.tags = [];
    }
    this.route.tags.push(tag);
    return this;
  }

  /**
   * 完成路由配置并返回父构建器
   */
  end(): RouteAuthConfigBuilder {
    this.parent.addRoute(this.route);
    return this.parent;
  }
}

export class RouteGroupBuilder {
  private group: RouteGroupConfig;
  private parent: RouteAuthConfigBuilder;

  constructor(name: string, basePath: string, parent: RouteAuthConfigBuilder) {
    this.group = {
      name,
      basePath,
      defaultConfig: {},
      routes: [],
    };
    this.parent = parent;
  }

  /**
   * 设置描述
   */
  description(description: string): this {
    this.group.description = description;
    return this;
  }

  /**
   * 设置默认认证要求
   */
  defaultRequireAuth(requireAuth: boolean = true): this {
    this.group.defaultConfig.requireAuth = requireAuth;
    return this;
  }

  /**
   * 设置默认允许的应用列表
   */
  defaultAllowApps(appIds: string[]): this {
    this.group.defaultConfig.allowedApps = appIds;
    return this;
  }

  /**
   * 设置默认拒绝的应用列表
   */
  defaultDenyApps(appIds: string[]): this {
    this.group.defaultConfig.deniedApps = appIds;
    return this;
  }

  /**
   * 添加路由到组
   */
  route(path: string | RegExp): GroupRouteBuilder {
    return new GroupRouteBuilder(path, this);
  }

  /**
   * 完成路由组配置并返回父构建器
   */
  end(): RouteAuthConfigBuilder {
    this.parent.addRouteGroup(this.group);
    return this.parent;
  }

  /**
   * 内部方法：添加路由到组
   */
  addRouteToGroup(route: RouteAuthConfig): void {
    this.group.routes.push(route);
  }
}

export class GroupRouteBuilder {
  private route: RouteAuthConfig;
  private parent: RouteGroupBuilder;

  constructor(path: string | RegExp, parent: RouteGroupBuilder) {
    this.route = {
      path,
      methods: '*',
      requireAuth: true,
    };
    this.parent = parent;
  }

  /**
   * 设置 HTTP 方法
   */
  methods(methods: string[] | '*'): this {
    this.route.methods = methods;
    return this;
  }

  /**
   * 设置单个 HTTP 方法
   */
  method(method: string): this {
    this.route.methods = [method.toUpperCase()];
    return this;
  }

  /**
   * 设置是否需要认证
   */
  requireAuth(requireAuth: boolean = true): this {
    this.route.requireAuth = requireAuth;
    return this;
  }

  /**
   * 设置为公开路由
   */
  public(): this {
    this.route.requireAuth = false;
    return this;
  }

  /**
   * 设置为受保护路由
   */
  protected(): this {
    this.route.requireAuth = true;
    return this;
  }

  /**
   * 设置允许访问的应用 ID 列表
   */
  allowApps(appIds: string[]): this {
    this.route.allowedApps = appIds;
    return this;
  }

  /**
   * 添加允许访问的应用 ID
   */
  allowApp(appId: string): this {
    if (!this.route.allowedApps) {
      this.route.allowedApps = [];
    }
    this.route.allowedApps.push(appId);
    return this;
  }

  /**
   * 设置拒绝访问的应用 ID 列表
   */
  denyApps(appIds: string[]): this {
    this.route.deniedApps = appIds;
    return this;
  }

  /**
   * 添加拒绝访问的应用 ID
   */
  denyApp(appId: string): this {
    if (!this.route.deniedApps) {
      this.route.deniedApps = [];
    }
    this.route.deniedApps.push(appId);
    return this;
  }

  /**
   * 设置自定义权限检查函数
   */
  customPermission(check: (appId: string, path: string, method: string) => boolean | Promise<boolean>): this {
    this.route.customPermissionCheck = check;
    return this;
  }

  /**
   * 设置描述
   */
  description(description: string): this {
    this.route.description = description;
    return this;
  }

  /**
   * 设置标签
   */
  tags(tags: string[]): this {
    this.route.tags = tags;
    return this;
  }

  /**
   * 添加标签
   */
  tag(tag: string): this {
    if (!this.route.tags) {
      this.route.tags = [];
    }
    this.route.tags.push(tag);
    return this;
  }

  /**
   * 完成路由配置并返回组构建器
   */
  end(): RouteGroupBuilder {
    this.parent.addRouteToGroup(this.route);
    return this.parent;
  }
}

/**
 * 创建路由认证配置构建器
 */
export function createRouteAuthConfig(defaultRequireAuth: boolean = false): RouteAuthConfigBuilder {
  return new RouteAuthConfigBuilder(defaultRequireAuth);
}

/**
 * 预定义的常用路由配置
 */
export class CommonRouteConfigs {
  /**
   * 创建标准的 REST API 路由配置
   */
  static createRestApiConfig(): GlobalRouteAuthConfig {
    return createRouteAuthConfig(true)
      .addPublicPaths([
        '/health',
        '/api/health',
        '/api/docs/*',
        '/api/public/*',
        /^\/api\/v\d+\/public/,
      ])
      .addProtectedPaths([
        '/api/admin/*',
        '/api/secure/*',
        '/api/internal/*',
      ])
      .group('public', '/api/public')
        .description('公开 API 接口')
        .defaultRequireAuth(false)
        .route('/info').method('GET').description('系统信息').end()
        .route('/status').method('GET').description('服务状态').end()
        .end()
      .group('admin', '/api/admin')
        .description('管理员接口')
        .defaultRequireAuth(true)
        .route('/users/*').methods(['GET', 'POST', 'PUT', 'DELETE']).description('用户管理').end()
        .route('/config/*').methods(['GET', 'POST', 'PUT']).description('配置管理').end()
        .route('/logs/*').method('GET').description('日志查看').end()
        .end()
      .group('api', '/api')
        .description('通用 API')
        .defaultRequireAuth(true)
        .route('/users/profile').methods(['GET', 'PUT']).description('用户资料').end()
        .route('/data/*').description('数据接口').end()
        .end()
      .enableDebug(false)
      .build();
  }

  /**
   * 创建微服务路由配置
   */
  static createMicroserviceConfig(): GlobalRouteAuthConfig {
    return createRouteAuthConfig(true)
      .addPublicPaths([
        '/health',
        '/metrics',
        '/ready',
        '/live',
      ])
      .group('internal', '/internal')
        .description('内部服务接口')
        .defaultRequireAuth(true)
        .defaultAllowApps(['service-a', 'service-b', 'gateway'])
        .route('/sync').method('POST').description('数据同步').end()
        .route('/callback').method('POST').description('回调接口').end()
        .end()
      .group('external', '/api')
        .description('外部 API')
        .defaultRequireAuth(true)
        .route('/webhook').method('POST')
          .customPermission(async (appId) => appId.startsWith('webhook_'))
          .description('Webhook 接口')
          .end()
        .end()
      .build();
  }

  /**
   * 创建开发环境路由配置
   */
  static createDevelopmentConfig(): GlobalRouteAuthConfig {
    return createRouteAuthConfig(false)
      .addPublicPaths([
        '/health',
        '/api/docs/*',
        '/api/dev/*',
        '/debug/*',
      ])
      .addProtectedPaths([
        '/api/admin/*',
      ])
      .enableDebug(true)
      .build();
  }

  /**
   * 创建生产环境路由配置
   */
  static createProductionConfig(): GlobalRouteAuthConfig {
    return createRouteAuthConfig(true)
      .addPublicPaths([
        '/health',
        '/api/public/info',
      ])
      .addProtectedPaths([
        '/api/*',
      ])
      .enableDebug(false)
      .build();
  }
}