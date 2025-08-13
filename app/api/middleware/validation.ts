import type { Context, Next } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z, ZodError, type ZodType } from "zod";
import { ApiException, ApiErrorCode } from "../types/index.js";

export interface ValidationOptions {
  onError?: (error: ZodError<any>, c: Context) => Response | Promise<Response>;
  stripUnknown?: boolean;
}

// Re-export zValidator for convenience
export { zValidator };

// Custom validation middleware that integrates with our error handling
export function validate<T extends ZodType>(
  target: "json" | "query" | "param" | "header" | "cookie",
  schema: T,
  options: ValidationOptions = {}
) {
  const defaultOptions: ValidationOptions = {
    stripUnknown: true,
    onError: (error: ZodError<any>, c: Context) => {
      const validationError = new ApiException(
        ApiErrorCode.VALIDATION_ERROR,
        "Validation failed",
        422,
        formatZodError(error)
      );
      throw validationError;
    },
  };

  const opts = { ...defaultOptions, ...options };

  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return opts.onError!(result.error as unknown as ZodError<any>, c);
    }
  });
}

// Convenience functions for common validation scenarios
export const validateJson = <T extends ZodType>(
  schema: T,
  options?: ValidationOptions
) => validate("json", schema, options);

export const validateQuery = <T extends ZodType>(
  schema: T,
  options?: ValidationOptions
) => validate("query", schema, options);

export const validateParam = <T extends ZodType>(
  schema: T,
  options?: ValidationOptions
) => validate("param", schema, options);

export const validateHeader = <T extends ZodType>(
  schema: T,
  options?: ValidationOptions
) => validate("header", schema, options);

// Common validation schemas
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).default("asc"),
  }),

  // ID parameter
  id: z.object({
    id: z.string().min(1, "ID is required"),
  }),

  // UUID parameter
  uuid: z.object({
    id: z.string().uuid("Invalid UUID format"),
  }),

  // Numeric ID parameter
  numericId: z.object({
    id: z.coerce.number().int().positive("ID must be a positive integer"),
  }),

  // Search query
  search: z.object({
    q: z.string().min(1, "Search query is required"),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),

  // Date range
  dateRange: z
    .object({
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    })
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: "Start date must be before or equal to end date",
        path: ["dateRange"],
      }
    ),

  // Common headers
  authHeader: z.object({
    authorization: z
      .string()
      .regex(/^Bearer .+/, "Invalid authorization header format"),
  }),

  contentType: z.object({
    "content-type": z
      .string()
      .includes("application/json", {
        message: "Content-Type must be application/json",
      }),
  }),
};

// Utility function to format Zod errors for API responses
export function formatZodError(error: ZodError<any>): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const key = path || "root";

    if (!formatted[key]) {
      formatted[key] = [];
    }

    formatted[key].push(issue.message);
  }

  return formatted;
}

// Middleware for validating request content type
export function requireContentType(expectedType: string = "application/json") {
  return async (c: Context, next: Next) => {
    const contentType = c.req.header("content-type");

    if (!contentType || !contentType.includes(expectedType)) {
      throw new ApiException(
        ApiErrorCode.BAD_REQUEST,
        `Content-Type must be ${expectedType}`,
        400,
        {
          received: contentType,
          expected: expectedType,
        }
      );
    }

    await next();
  };
}

// Middleware for validating request size
export function limitRequestSize(maxSize: number = 1024 * 1024) {
  // Default 1MB
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header("content-length");

    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new ApiException(
        ApiErrorCode.BAD_REQUEST,
        `Request body too large. Maximum size is ${maxSize} bytes`,
        400,
        { size: parseInt(contentLength), maxSize }
      );
    }

    await next();
  };
}

// Custom validation middleware for complex scenarios
export function customValidation<T>(
  validator: (c: Context) => Promise<T> | T,
  onError?: (error: any, c: Context) => Response | Promise<Response>
) {
  return async (c: Context, next: Next) => {
    try {
      const result = await validator(c);
      c.set("validatedData", result);
      await next();
    } catch (error) {
      if (onError) {
        return onError(error, c);
      }

      if (error instanceof ZodError) {
        throw new ApiException(
          ApiErrorCode.VALIDATION_ERROR,
          "Validation failed",
          422,
          formatZodError(error)
        );
      }

      throw error;
    }
  };
}

// Utility to create conditional validation
export function conditionalValidation<T extends ZodType>(
  condition: (c: Context) => boolean,
  schema: T,
  target: "json" | "query" | "param" | "header" | "cookie" = "json"
) {
  return async (c: Context, next: Next) => {
    if (condition(c)) {
      return validate(target, schema)(c, next);
    }
    await next();
  };
}

// Validation for multipart form data
export function validateFormData(schema: ZodType) {
  return async (c: Context, next: Next) => {
    try {
      const formData = await c.req.formData();
      const data: Record<string, any> = {};

      for (const [key, value] of formData.entries()) {
        if (data[key]) {
          // Handle multiple values for the same key
          if (Array.isArray(data[key])) {
            data[key].push(value);
          } else {
            data[key] = [data[key], value];
          }
        } else {
          data[key] = value;
        }
      }

      const result = schema.parse(data);
      c.set("validatedFormData", result);
      await next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiException(
          ApiErrorCode.VALIDATION_ERROR,
          "Form validation failed",
          422,
          formatZodError(error)
        );
      }
      throw error;
    }
  };
}
