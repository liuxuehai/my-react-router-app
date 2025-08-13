import type { Context, Next } from "hono";

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultOptions: CorsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: [],
  credentials: false,
  maxAge: 86400, // 24 hours
};

export function cors(options: CorsOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  return async (c: Context, next: Next) => {
    const origin = c.req.header("Origin");
    const requestMethod = c.req.header("Access-Control-Request-Method");

    // Handle preflight requests
    if (c.req.method === "OPTIONS") {
      // Set CORS headers for preflight
      if (origin && isOriginAllowed(origin, opts.origin)) {
        c.header("Access-Control-Allow-Origin", origin);
      } else if (opts.origin === "*") {
        c.header("Access-Control-Allow-Origin", "*");
      }

      if (opts.credentials) {
        c.header("Access-Control-Allow-Credentials", "true");
      }

      if (opts.methods && opts.methods.length > 0) {
        c.header("Access-Control-Allow-Methods", opts.methods.join(", "));
      }

      if (opts.allowedHeaders && opts.allowedHeaders.length > 0) {
        c.header(
          "Access-Control-Allow-Headers",
          opts.allowedHeaders.join(", ")
        );
      }

      if (opts.maxAge) {
        c.header("Access-Control-Max-Age", opts.maxAge.toString());
      }

      return new Response(null, { status: 204 });
    }

    // Handle actual requests
    if (origin && isOriginAllowed(origin, opts.origin)) {
      c.header("Access-Control-Allow-Origin", origin);
    } else if (opts.origin === "*") {
      c.header("Access-Control-Allow-Origin", "*");
    }

    if (opts.credentials) {
      c.header("Access-Control-Allow-Credentials", "true");
    }

    if (opts.exposedHeaders && opts.exposedHeaders.length > 0) {
      c.header("Access-Control-Expose-Headers", opts.exposedHeaders.join(", "));
    }

    await next();
  };
}

function isOriginAllowed(
  origin: string,
  allowedOrigin?: string | string[] | ((origin: string) => boolean)
): boolean {
  if (!allowedOrigin) return false;

  if (typeof allowedOrigin === "string") {
    return allowedOrigin === "*" || allowedOrigin === origin;
  }

  if (Array.isArray(allowedOrigin)) {
    return allowedOrigin.includes(origin);
  }

  if (typeof allowedOrigin === "function") {
    return allowedOrigin(origin);
  }

  return false;
}
