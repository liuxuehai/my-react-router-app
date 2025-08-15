/**
 * API 配置管理系统
 * 支持环境变量读取、配置验证和不同环境的配置
 */

/**
 * 环境类型枚举
 */
export enum Environment {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
  TEST = "test",
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

/**
 * CORS 配置接口
 */
export interface CorsConfig {
  /** 允许的源 */
  origin: string | string[];
  /** 允许的 HTTP 方法 */
  methods: string[];
  /** 允许的请求头 */
  headers: string[];
  /** 是否允许凭据 */
  credentials?: boolean;
  /** 预检请求缓存时间（秒） */
  maxAge?: number;
}

/**
 * 日志配置接口
 */
export interface LoggingConfig {
  /** 是否启用日志 */
  enabled: boolean;
  /** 日志级别 */
  level: LogLevel;
  /** 是否在生产环境显示详细错误 */
  showErrorDetails: boolean;
  /** 是否记录请求体 */
  logRequestBody: boolean;
  /** 是否记录响应体 */
  logResponseBody: boolean;
}

/**
 * 签名认证配置接口
 */
export interface SignatureAuthConfig {
  /** 是否启用签名认证 */
  enabled: boolean;
  /** 时间窗口容差（秒） */
  timeWindowSeconds: number;
  /** 支持的签名算法 */
  algorithms: string[];
  /** 是否启用调试模式 */
  debug: boolean;
  /** 跳过验证的路径模式 */
  skipPaths: string[];
  /** 密钥存储类型 */
  keyStorageType: 'env' | 'kv' | 'memory';
  /** KV 命名空间（当使用 KV 存储时） */
  kvNamespace?: string;
}

/**
 * 安全配置接口
 */
export interface SecurityConfig {
  /** JWT 密钥 */
  jwtSecret?: string;
  /** JWT 过期时间 */
  jwtExpiresIn: string;
  /** 请求频率限制 */
  rateLimit: {
    /** 是否启用频率限制 */
    enabled: boolean;
    /** 时间窗口（毫秒） */
    windowMs: number;
    /** 最大请求数 */
    maxRequests: number;
  };
  /** 请求体大小限制（字节） */
  maxRequestSize: number;
  /** 签名认证配置 */
  signatureAuth: SignatureAuthConfig;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  /** 数据库连接 URL */
  url?: string;
  /** 连接池大小 */
  poolSize: number;
  /** 连接超时时间（毫秒） */
  connectionTimeout: number;
  /** 查询超时时间（毫秒） */
  queryTimeout: number;
  /** 是否启用 SSL */
  ssl: boolean;
}

/**
 * API 配置接口
 */
export interface ApiConfig {
  /** 环境类型 */
  environment: Environment;
  /** API 基础路径 */
  basePath: string;
  /** 服务器端口（开发环境） */
  port: number;
  /** 服务器主机（开发环境） */
  host: string;
  /** CORS 配置 */
  cors: CorsConfig;
  /** 日志配置 */
  logging: LoggingConfig;
  /** 安全配置 */
  security: SecurityConfig;
  /** 数据库配置 */
  database: DatabaseConfig;
  /** API 版本 */
  version: string;
  /** 是否启用 API 文档 */
  enableDocs: boolean;
}

/**
 * 默认配置
 */
const defaultConfig: ApiConfig = {
  environment: Environment.DEVELOPMENT,
  basePath: "/api",
  port: 3000,
  host: "localhost",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    headers: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: false,
    maxAge: 86400, // 24 hours
  },
  logging: {
    enabled: true,
    level: LogLevel.INFO,
    showErrorDetails: true,
    logRequestBody: false,
    logResponseBody: false,
  },
  security: {
    jwtExpiresIn: "24h",
    rateLimit: {
      enabled: false,
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
    },
    maxRequestSize: 1024 * 1024, // 1MB
    signatureAuth: {
      enabled: false,
      timeWindowSeconds: 300, // 5 minutes
      algorithms: ['RS256', 'ES256'],
      debug: false,
      skipPaths: ['/api/health', '/api/docs'],
      keyStorageType: 'env',
    },
  },
  database: {
    poolSize: 10,
    connectionTimeout: 30000, // 30 seconds
    queryTimeout: 10000, // 10 seconds
    ssl: false,
  },
  version: "1.0.0",
  enableDocs: true,
};

/**
 * 生产环境配置覆盖
 */
const productionOverrides: Partial<ApiConfig> = {
  environment: Environment.PRODUCTION,
  cors: {
    origin: [], // 生产环境需要明确指定允许的源
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  },
  logging: {
    enabled: true,
    level: LogLevel.WARN,
    showErrorDetails: false,
    logRequestBody: false,
    logResponseBody: false,
  },
  security: {
    jwtExpiresIn: "1h",
    rateLimit: {
      enabled: true,
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
    },
    maxRequestSize: 512 * 1024, // 512KB
    signatureAuth: {
      enabled: true,
      timeWindowSeconds: 300,
      algorithms: ['RS256', 'ES256'],
      debug: false,
      skipPaths: ['/api/health'],
      keyStorageType: 'kv',
      kvNamespace: 'SIGNATURE_KEYS',
    },
  },
  database: {
    poolSize: 20,
    connectionTimeout: 10000,
    queryTimeout: 5000,
    ssl: true,
  },
  enableDocs: false,
};

/**
 * 测试环境配置覆盖
 */
const testOverrides: Partial<ApiConfig> = {
  environment: Environment.TEST,
  logging: {
    enabled: false,
    level: LogLevel.ERROR,
    showErrorDetails: true,
    logRequestBody: false,
    logResponseBody: false,
  },
  security: {
    jwtExpiresIn: "1h",
    rateLimit: {
      enabled: false,
      windowMs: 15 * 60 * 1000,
      maxRequests: 1000,
    },
    maxRequestSize: 1024 * 1024,
    signatureAuth: {
      enabled: false,
      timeWindowSeconds: 300,
      algorithms: ['RS256', 'ES256'],
      debug: true,
      skipPaths: ['/api/health', '/api/docs', '/api/test'],
      keyStorageType: 'env',
    },
  },
  database: {
    poolSize: 5,
    connectionTimeout: 5000,
    queryTimeout: 3000,
    ssl: false,
  },
  enableDocs: false,
};

/**
 * 配置验证错误类
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * 验证配置的有效性
 */
function validateConfig(config: ApiConfig): void {
  // 验证环境
  if (!Object.values(Environment).includes(config.environment)) {
    throw new ConfigValidationError(
      `Invalid environment: ${config.environment}`,
      "environment"
    );
  }

  // 验证端口
  if (config.port < 1 || config.port > 65535) {
    throw new ConfigValidationError(
      `Invalid port: ${config.port}. Must be between 1 and 65535`,
      "port"
    );
  }

  // 验证基础路径
  if (!config.basePath.startsWith("/")) {
    throw new ConfigValidationError(
      `Base path must start with '/': ${config.basePath}`,
      "basePath"
    );
  }

  // 验证日志级别
  if (!Object.values(LogLevel).includes(config.logging.level)) {
    throw new ConfigValidationError(
      `Invalid log level: ${config.logging.level}`,
      "logging.level"
    );
  }

  // 验证 CORS 配置
  if (Array.isArray(config.cors.origin) && config.cors.origin.length === 0) {
    throw new ConfigValidationError(
      "CORS origin cannot be empty array in production",
      "cors.origin"
    );
  }

  // 验证 JWT 配置
  if (
    config.environment === Environment.PRODUCTION &&
    !config.security.jwtSecret
  ) {
    throw new ConfigValidationError(
      "JWT secret is required in production environment",
      "security.jwtSecret"
    );
  }

  // 验证数据库配置
  if (config.database.poolSize < 1) {
    throw new ConfigValidationError(
      `Database pool size must be at least 1: ${config.database.poolSize}`,
      "database.poolSize"
    );
  }
}

/**
 * 从环境变量读取配置
 */
function loadConfigFromEnv(env: Record<string, any> = {}): Partial<ApiConfig> {
  const config: Partial<ApiConfig> = {};

  // 基础配置
  if (env.NODE_ENV) {
    config.environment = env.NODE_ENV as Environment;
  }
  if (env.API_BASE_PATH) {
    config.basePath = env.API_BASE_PATH;
  }
  if (env.PORT) {
    config.port = parseInt(env.PORT, 10);
  }
  if (env.HOST) {
    config.host = env.HOST;
  }
  if (env.API_VERSION) {
    config.version = env.API_VERSION;
  }
  if (env.ENABLE_DOCS !== undefined) {
    config.enableDocs = env.ENABLE_DOCS === "true";
  }

  // CORS 配置
  const corsConfig: Partial<CorsConfig> = {};
  if (env.CORS_ORIGIN) {
    corsConfig.origin =
      env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(",");
  }
  if (env.CORS_METHODS) {
    corsConfig.methods = env.CORS_METHODS.split(",");
  }
  if (env.CORS_HEADERS) {
    corsConfig.headers = env.CORS_HEADERS.split(",");
  }
  if (env.CORS_CREDENTIALS !== undefined) {
    corsConfig.credentials = env.CORS_CREDENTIALS === "true";
  }
  if (env.CORS_MAX_AGE) {
    corsConfig.maxAge = parseInt(env.CORS_MAX_AGE, 10);
  }
  if (Object.keys(corsConfig).length > 0) {
    config.cors = corsConfig as CorsConfig;
  }

  // 日志配置
  const loggingConfig: Partial<LoggingConfig> = {};
  if (env.LOGGING_ENABLED !== undefined) {
    loggingConfig.enabled = env.LOGGING_ENABLED === "true";
  }
  if (env.LOG_LEVEL) {
    loggingConfig.level = env.LOG_LEVEL as LogLevel;
  }
  if (env.SHOW_ERROR_DETAILS !== undefined) {
    loggingConfig.showErrorDetails = env.SHOW_ERROR_DETAILS === "true";
  }
  if (env.LOG_REQUEST_BODY !== undefined) {
    loggingConfig.logRequestBody = env.LOG_REQUEST_BODY === "true";
  }
  if (env.LOG_RESPONSE_BODY !== undefined) {
    loggingConfig.logResponseBody = env.LOG_RESPONSE_BODY === "true";
  }
  if (Object.keys(loggingConfig).length > 0) {
    config.logging = loggingConfig as LoggingConfig;
  }

  // 安全配置
  const securityConfig: Partial<SecurityConfig> = {};
  if (env.JWT_SECRET) {
    securityConfig.jwtSecret = env.JWT_SECRET;
  }
  if (env.JWT_EXPIRES_IN) {
    securityConfig.jwtExpiresIn = env.JWT_EXPIRES_IN;
  }
  if (env.MAX_REQUEST_SIZE) {
    securityConfig.maxRequestSize = parseInt(env.MAX_REQUEST_SIZE, 10);
  }

  // 频率限制配置
  const rateLimitConfig: Partial<SecurityConfig["rateLimit"]> = {};
  if (env.RATE_LIMIT_ENABLED !== undefined) {
    rateLimitConfig.enabled = env.RATE_LIMIT_ENABLED === "true";
  }
  if (env.RATE_LIMIT_WINDOW_MS) {
    rateLimitConfig.windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS, 10);
  }
  if (env.RATE_LIMIT_MAX_REQUESTS) {
    rateLimitConfig.maxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10);
  }
  if (Object.keys(rateLimitConfig).length > 0) {
    securityConfig.rateLimit = rateLimitConfig as SecurityConfig["rateLimit"];
  }

  // 签名认证配置
  const signatureAuthConfig: Partial<SignatureAuthConfig> = {};
  if (env.SIGNATURE_AUTH_ENABLED !== undefined) {
    signatureAuthConfig.enabled = env.SIGNATURE_AUTH_ENABLED === "true";
  }
  if (env.SIGNATURE_TIME_WINDOW) {
    signatureAuthConfig.timeWindowSeconds = parseInt(env.SIGNATURE_TIME_WINDOW, 10);
  }
  if (env.SIGNATURE_ALGORITHMS) {
    signatureAuthConfig.algorithms = env.SIGNATURE_ALGORITHMS.split(",");
  }
  if (env.SIGNATURE_DEBUG !== undefined) {
    signatureAuthConfig.debug = env.SIGNATURE_DEBUG === "true";
  }
  if (env.SIGNATURE_SKIP_PATHS) {
    signatureAuthConfig.skipPaths = env.SIGNATURE_SKIP_PATHS.split(",");
  }
  if (env.SIGNATURE_KEY_STORAGE_TYPE) {
    signatureAuthConfig.keyStorageType = env.SIGNATURE_KEY_STORAGE_TYPE as 'env' | 'kv' | 'memory';
  }
  if (env.SIGNATURE_KV_NAMESPACE) {
    signatureAuthConfig.kvNamespace = env.SIGNATURE_KV_NAMESPACE;
  }
  if (Object.keys(signatureAuthConfig).length > 0) {
    securityConfig.signatureAuth = signatureAuthConfig as SignatureAuthConfig;
  }

  if (Object.keys(securityConfig).length > 0) {
    config.security = securityConfig as SecurityConfig;
  }

  // 数据库配置
  const databaseConfig: Partial<DatabaseConfig> = {};
  if (env.DATABASE_URL) {
    databaseConfig.url = env.DATABASE_URL;
  }
  if (env.DB_POOL_SIZE) {
    databaseConfig.poolSize = parseInt(env.DB_POOL_SIZE, 10);
  }
  if (env.DB_CONNECTION_TIMEOUT) {
    databaseConfig.connectionTimeout = parseInt(env.DB_CONNECTION_TIMEOUT, 10);
  }
  if (env.DB_QUERY_TIMEOUT) {
    databaseConfig.queryTimeout = parseInt(env.DB_QUERY_TIMEOUT, 10);
  }
  if (env.DB_SSL !== undefined) {
    databaseConfig.ssl = env.DB_SSL === "true";
  }
  if (Object.keys(databaseConfig).length > 0) {
    config.database = databaseConfig as DatabaseConfig;
  }

  return config;
}

/**
 * 深度合并配置对象
 */
function mergeConfig(base: ApiConfig, override: Partial<ApiConfig>): ApiConfig {
  const merged: any = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // 深度合并对象
        merged[key] = {
          ...merged[key],
          ...value,
        };
      } else {
        // 直接覆盖原始值和数组
        merged[key] = value;
      }
    }
  }

  return merged as ApiConfig;
}

/**
 * 创建并验证 API 配置
 */
export function createApiConfig(env: Record<string, any> = {}): ApiConfig {
  // 从环境变量加载配置
  const envConfig = loadConfigFromEnv(env);

  // 根据环境选择基础配置
  let baseConfig = defaultConfig;
  const environment = envConfig.environment || defaultConfig.environment;

  switch (environment) {
    case Environment.PRODUCTION:
      baseConfig = mergeConfig(defaultConfig, productionOverrides);
      break;
    case Environment.TEST:
      baseConfig = mergeConfig(defaultConfig, testOverrides);
      break;
    default:
      baseConfig = defaultConfig;
  }

  // 合并环境变量配置
  const finalConfig = mergeConfig(baseConfig, envConfig);

  // 验证配置
  validateConfig(finalConfig);

  return finalConfig;
}

/**
 * 获取当前配置实例
 */
let currentConfig: ApiConfig | null = null;

/**
 * 初始化配置
 */
export function initializeConfig(env: Record<string, any> = {}): ApiConfig {
  currentConfig = createApiConfig(env);
  return currentConfig;
}

/**
 * 获取当前配置
 */
export function getConfig(): ApiConfig {
  if (!currentConfig) {
    throw new Error(
      "Configuration not initialized. Call initializeConfig() first."
    );
  }
  return currentConfig;
}

/**
 * 检查是否为开发环境
 */
export function isDevelopment(): boolean {
  return getConfig().environment === Environment.DEVELOPMENT;
}

/**
 * 检查是否为生产环境
 */
export function isProduction(): boolean {
  return getConfig().environment === Environment.PRODUCTION;
}

/**
 * 检查是否为测试环境
 */
export function isTest(): boolean {
  return getConfig().environment === Environment.TEST;
}



/**
 * 导出中间件配置管理
 */
export * from "./middleware.js";
