/**
 * 标准 API 响应格式接口
 */
export interface ApiResponse<T = any> {
  /** 请求是否成功 */
  success: boolean;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: ApiError;
  /** 响应消息 */
  message?: string;
  /** 元数据信息 */
  meta?: ApiMeta;
}

/**
 * API 错误信息接口
 */
export interface ApiError {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 错误详细信息 */
  details?: any;
  /** 错误堆栈（仅开发环境） */
  stack?: string;
}

/**
 * API 元数据接口
 */
export interface ApiMeta {
  /** 请求时间戳 */
  timestamp: string;
  /** 请求 ID */
  requestId?: string;
  /** 处理时间（毫秒） */
  processingTime?: number;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  /** 分页信息 */
  pagination: PaginationMeta;
}

/**
 * 分页元数据接口
 */
export interface PaginationMeta {
  /** 当前页码 */
  page: number;
  /** 每页数量 */
  limit: number;
  /** 总记录数 */
  total: number;
  /** 总页数 */
  totalPages: number;
  /** 是否有下一页 */
  hasNext: boolean;
  /** 是否有上一页 */
  hasPrev: boolean;
}

/**
 * 分页请求参数接口
 */
export interface PaginationParams {
  /** 页码，默认为 1 */
  page?: number;
  /** 每页数量，默认为 10 */
  limit?: number;
  /** 排序字段 */
  sortBy?: string;
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * API 错误类型枚举
 */
export enum ApiErrorCode {
  // 客户端错误 (4xx)
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // 服务器错误 (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * HTTP 状态码映射
 */
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  VALIDATION_ERROR: 422,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * 成功响应构造函数
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
  meta?: Partial<ApiMeta>
): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * 错误响应构造函数
 */
export function createErrorResponse(
  error: ApiError,
  meta?: Partial<ApiMeta>
): ApiResponse<never> {
  return {
    success: false,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * 分页响应构造函数
 */
export function createPaginatedResponse<T>(
  data: T[],
  pagination: PaginationMeta,
  message?: string,
  meta?: Partial<ApiMeta>
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    message,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * 分页元数据计算函数
 */
export function calculatePaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * API 错误类
 */
export class ApiException extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
    details?: any
  ) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  /**
   * 转换为 API 错误对象
   */
  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * 常用 API 异常工厂函数
 */
export const ApiExceptions = {
  badRequest: (message: string, details?: any) =>
    new ApiException(ApiErrorCode.BAD_REQUEST, message, HTTP_STATUS_CODES.BAD_REQUEST, details),
  
  unauthorized: (message: string = 'Unauthorized') =>
    new ApiException(ApiErrorCode.UNAUTHORIZED, message, HTTP_STATUS_CODES.UNAUTHORIZED),
  
  forbidden: (message: string = 'Forbidden') =>
    new ApiException(ApiErrorCode.FORBIDDEN, message, HTTP_STATUS_CODES.FORBIDDEN),
  
  notFound: (message: string = 'Resource not found') =>
    new ApiException(ApiErrorCode.NOT_FOUND, message, HTTP_STATUS_CODES.NOT_FOUND),
  
  validationError: (message: string, details?: any) =>
    new ApiException(ApiErrorCode.VALIDATION_ERROR, message, HTTP_STATUS_CODES.VALIDATION_ERROR, details),
  
  internalServerError: (message: string = 'Internal server error', details?: any) =>
    new ApiException(ApiErrorCode.INTERNAL_SERVER_ERROR, message, HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, details),
};