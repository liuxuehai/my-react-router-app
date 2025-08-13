// Export all middleware for convenient importing
export * from './cors.js';
export * from './logger.js';
export * from './error-handler.js';
export * from './validation.js';

// Re-export commonly used types and utilities
export type { Context, Next } from 'hono';