import { createRouteDispatcher } from './route-dispatcher';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

// 创建路由分发器实例
const routeDispatcher = createRouteDispatcher({
  apiPrefix: '/api',
  enableLogging: true,
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return routeDispatcher(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
