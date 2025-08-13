import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { 
  ApiException, 
  ApiErrorCode, 
  HTTP_STATUS_CODES, 
  createErrorResponse,
  type ApiError 
} from '../types/index.js';

/**
 * 错误处理中间件配置接口
 */
export interface ErrorHandlerConfig {
  /** 是否在开发环境显示错误堆栈 */
  showStack?: boolean;
  /** 是否记录错误日志 */
  logErrors?: boolean;
  /** 自定义错误消息映射 */
  customMessages?: Record<string, string>;
}

/**
 * 默认错误处理配置
 */
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  showStack: false,
  logErrors: true,
  customMessages: {},
};

/**
 * 错误分类和状态码映射
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  [ApiErrorCode.BAD_REQUEST]: HTTP_STATUS_CODES.BAD_REQUEST,
  [ApiErrorCode.UNAUTHORIZED]: HTTP_STATUS_CODES.UNAUTHORIZED,
  [ApiErrorCode.FORBIDDEN]: HTTP_STATUS_CODES.FORBIDDEN,
  [ApiErrorCode.NOT_FOUND]: HTTP_STATUS_CODES.NOT_FOUND,
  [ApiErrorCode.METHOD_NOT_ALLOWED]: HTTP_STATUS_CODES.METHOD_NOT_ALLOWED,
  [ApiErrorCode.VALIDATION_ERROR]: HTTP_STATUS_CODES.VALIDATION_ERROR,
  [ApiErrorCode.RATE_LIMIT_EXCEEDED]: HTTP_STATUS_CODES.RATE_LIMIT_EXCEEDED,
  [ApiErrorCode.INTERNAL_SERVER_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ApiErrorCode.SERVICE_UNAVAILABLE]: HTTP_STATUS_CODES.SERVICE_UNAVAILABLE,
  [ApiErrorCode.DATABASE_ERROR]: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  [ApiErrorCode.EXTERNAL_SERVICE_ERROR]: HTTP_STATUS_CODES.SERVICE_UNAVAILABLE,
};

/**
 * 生成请求 ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 将未知错误转换为 ApiError
 */
function normalizeError(error: unknown, config: ErrorHandlerConfig): ApiError {
  // 处理 ApiException
  if (error instanceof ApiException) {
    return {
      code: error.code,
      message: config.customMessages?.[error.code] || error.message,
      details: error.details,
      ...(config.showStack && { stack: error.stack }),
    };
  }

  // 处理 Hono HTTPException
  if (error instanceof HTTPException) {
    const code = getErrorCodeByStatus(error.status);
    return {
      code,
      message: config.customMessages?.[code] || error.message,
      ...(config.showStack && { stack: error.stack }),
    };
  }

  // 处理标准 Error
  if (error instanceof Error) {
    return {
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      message: config.customMessages?.[ApiErrorCode.INTERNAL_SERVER_ERROR] || 
               (config.showStack ? error.message : 'Internal server error'),
      ...(config.showStack && { stack: error.stack }),
    };
  }

  // 处理其他类型的错误
  return {
    code: ApiErrorCode.INTERNAL_SERVER_ERROR,
    message: config.customMessages?.[ApiErrorCode.INTERNAL_SERVER_ERROR] || 'Unknown error occurred',
    details: config.showStack ? error : undefined,
  };
}

/**
 * 根据 HTTP 状态码获取错误代码
 */
function getErrorCodeByStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400: return ApiErrorCode.BAD_REQUEST;
    case 401: return ApiErrorCode.UNAUTHORIZED;
    case 403: return ApiErrorCode.FORBIDDEN;
    case 404: return ApiErrorCode.NOT_FOUND;
    case 405: return ApiErrorCode.METHOD_NOT_ALLOWED;
    case 422: return ApiErrorCode.VALIDATION_ERROR;
    case 429: return ApiErrorCode.RATE_LIMIT_EXCEEDED;
    case 503: return ApiErrorCode.SERVICE_UNAVAILABLE;
    default: return ApiErrorCode.INTERNAL_SERVER_ERROR;
  }
}

/**
 * 获取错误对应的 HTTP 状态码
 */
function getStatusCode(error: ApiError): number {
  return ERROR_STATUS_MAP[error.code] || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR;
}

/**
 * 记录错误日志
 */
function logError(error: unknown, context: Context, requestId: string): void {
  const logData = {
    requestId,
    method: context.req.method,
    url: context.req.url,
    userAgent: context.req.header('user-agent'),
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error,
  };

  console.error('[API Error]', JSON.stringify(logData, null, 2));
}

/**
 * 创建错误处理中间件
 */
export function createErrorHandler(config: ErrorHandlerConfig = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    try {
      await next();
    } catch (error) {
      const requestId = generateRequestId();
      
      // 记录错误日志
      if (finalConfig.logErrors) {
        logError(error, c, requestId);
      }

      // 标准化错误
      const apiError = normalizeError(error, finalConfig);
      const statusCode = getStatusCode(apiError);

      // 创建错误响应
      const errorResponse = createErrorResponse(apiError, {
        requestId,
        processingTime: Date.now() - (c.get('startTime') || Date.now()),
      });

      // 设置响应头
      c.header('Content-Type', 'application/json');
      c.header('X-Request-ID', requestId);

      // 返回错误响应
      return c.json(errorResponse, statusCode as any);
    }
  };
}

/**
 * 默认错误处理中间件实例
 */
export const errorHandler = createErrorHandler();

/**
 * 开发环境错误处理中间件（显示详细错误信息）
 */
export const devErrorHandler = createErrorHandler({
  showStack: true,
  logErrors: true,
});

/**
 * 生产环境错误处理中间件（隐藏敏感信息）
 */
export const prodErrorHandler = createErrorHandler({
  showStack: false,
  logErrors: true,
  customMessages: {
    [ApiErrorCode.INTERNAL_SERVER_ERROR]: 'Something went wrong. Please try again later.',
    [ApiErrorCode.DATABASE_ERROR]: 'Service temporarily unavailable. Please try again later.',
    [ApiErrorCode.EXTERNAL_SERVICE_ERROR]: 'External service unavailable. Please try again later.',
  },
});

/**
 * 手动抛出 API 异常的辅助函数
 */
export function throwApiError(
  code: ApiErrorCode,
  message: string,
  details?: any
): never {
  const statusCode = ERROR_STATUS_MAP[code] || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR;
  throw new ApiException(code, message, statusCode, details);
}

/**
 * 异步错误处理包装器
 */
export function asyncHandler<T extends any[], R>(
  fn: (...args: T) => Promise<R>
) {
  return (...args: T): Promise<R> => {
    return Promise.resolve(fn(...args)).catch((error) => {
      throw error;
    });
  };
}