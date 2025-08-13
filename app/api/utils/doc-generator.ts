/**
 * API 文档生成器
 * 自动生成 API 文档，用于开发环境调试和测试
 */

import type { Context } from 'hono';
import { isDevelopment } from '../config/index.js';

export interface ApiEndpoint {
  method: string;
  path: string;
  description?: string;
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses?: ApiResponse[];
  examples?: ApiExample[];
}

export interface ApiParameter {
  name: string;
  type: 'query' | 'path' | 'header';
  dataType: string;
  required: boolean;
  description?: string;
  example?: any;
}

export interface ApiRequestBody {
  contentType: string;
  schema: any;
  example?: any;
  description?: string;
}

export interface ApiResponse {
  status: number;
  description: string;
  schema?: any;
  example?: any;
}

export interface ApiExample {
  name: string;
  description?: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    headers?: Record<string, string>;
    body: any;
  };
}

/**
 * API 文档生成器类
 */
export class ApiDocGenerator {
  private endpoints: Map<string, ApiEndpoint> = new Map();
  private enabled: boolean;

  constructor() {
    this.enabled = isDevelopment();
  }

  /**
   * 注册 API 端点
   */
  registerEndpoint(endpoint: ApiEndpoint): void {
    if (!this.enabled) return;
    
    const key = `${endpoint.method.toUpperCase()} ${endpoint.path}`;
    this.endpoints.set(key, endpoint);
  }

  /**
   * 生成 HTML 格式的 API 文档
   */
  generateHtmlDocs(): string {
    if (!this.enabled) {
      return '<h1>API Documentation is only available in development mode</h1>';
    }

    const endpoints = Array.from(this.endpoints.values());
    
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .endpoint { margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .endpoint-header { background: #f9fafb; padding: 15px; border-bottom: 1px solid #e5e7eb; }
        .method { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .method.GET { background: #10b981; color: white; }
        .method.POST { background: #3b82f6; color: white; }
        .method.PUT { background: #f59e0b; color: white; }
        .method.DELETE { background: #ef4444; color: white; }
        .path { font-family: monospace; font-size: 16px; margin-left: 10px; }
        .endpoint-body { padding: 15px; }
        .section { margin-bottom: 20px; }
        .section h4 { margin: 0 0 10px 0; color: #374151; }
        .parameter, .response { background: #f9fafb; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 3px solid #3b82f6; }
        .example { background: #1f2937; color: #f9fafb; padding: 15px; border-radius: 4px; overflow-x: auto; }
        .example pre { margin: 0; font-family: 'Courier New', monospace; }
        .test-button { background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        .test-button:hover { background: #059669; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 API Documentation</h1>
            <p>Development Environment - Generated at ${new Date().toLocaleString()}</p>
        </div>
        <div class="content">
            ${endpoints.map(endpoint => this.generateEndpointHtml(endpoint)).join('')}
        </div>
    </div>
    <script>
        function testEndpoint(method, path, example) {
            const url = window.location.origin + path;
            const options = {
                method: method,
                headers: example.request.headers || {'Content-Type': 'application/json'}
            };
            
            if (example.request.body && method !== 'GET') {
                options.body = typeof example.request.body === 'string' 
                    ? example.request.body 
                    : JSON.stringify(example.request.body);
            }
            
            fetch(url, options)
                .then(response => response.json())
                .then(data => {
                    alert('Response: ' + JSON.stringify(data, null, 2));
                })
                .catch(error => {
                    alert('Error: ' + error.message);
                });
        }
    </script>
</body>
</html>`;
  }

  /**
   * 生成单个端点的 HTML
   */
  private generateEndpointHtml(endpoint: ApiEndpoint): string {
    return `
        <div class="endpoint">
            <div class="endpoint-header">
                <span class="method ${endpoint.method.toUpperCase()}">${endpoint.method.toUpperCase()}</span>
                <span class="path">${endpoint.path}</span>
            </div>
            <div class="endpoint-body">
                ${endpoint.description ? `<p>${endpoint.description}</p>` : ''}
                
                ${endpoint.parameters && endpoint.parameters.length > 0 ? `
                <div class="section">
                    <h4>Parameters</h4>
                    ${endpoint.parameters.map(param => `
                        <div class="parameter">
                            <strong>${param.name}</strong> (${param.type}) - ${param.dataType}
                            ${param.required ? '<span style="color: red;">*</span>' : ''}
                            ${param.description ? `<br><small>${param.description}</small>` : ''}
                            ${param.example ? `<br><code>Example: ${JSON.stringify(param.example)}</code>` : ''}
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                ${endpoint.requestBody ? `
                <div class="section">
                    <h4>Request Body</h4>
                    <div class="parameter">
                        <strong>Content-Type:</strong> ${endpoint.requestBody.contentType}<br>
                        ${endpoint.requestBody.description ? `<strong>Description:</strong> ${endpoint.requestBody.description}<br>` : ''}
                        ${endpoint.requestBody.example ? `
                            <div class="example">
                                <pre>${JSON.stringify(endpoint.requestBody.example, null, 2)}</pre>
                            </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${endpoint.responses && endpoint.responses.length > 0 ? `
                <div class="section">
                    <h4>Responses</h4>
                    ${endpoint.responses.map(response => `
                        <div class="response">
                            <strong>${response.status}</strong> - ${response.description}
                            ${response.example ? `
                                <div class="example">
                                    <pre>${JSON.stringify(response.example, null, 2)}</pre>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                ${endpoint.examples && endpoint.examples.length > 0 ? `
                <div class="section">
                    <h4>Examples</h4>
                    ${endpoint.examples.map(example => `
                        <div style="margin-bottom: 15px;">
                            <h5>${example.name}</h5>
                            ${example.description ? `<p>${example.description}</p>` : ''}
                            <button class="test-button" onclick="testEndpoint('${endpoint.method}', '${endpoint.path}', ${JSON.stringify(example).replace(/"/g, '&quot;')})">
                                Test this endpoint
                            </button>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>
        </div>
    `;
  }

  /**
   * 生成 JSON 格式的 API 文档
   */
  generateJsonDocs(): any {
    if (!this.enabled) {
      return { error: 'API documentation is only available in development mode' };
    }

    return {
      title: 'API Documentation',
      version: '1.0.0',
      generated: new Date().toISOString(),
      baseUrl: '/api',
      endpoints: Array.from(this.endpoints.values()),
    };
  }

  /**
   * 获取所有注册的端点
   */
  getEndpoints(): ApiEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * 清除所有端点
   */
  clear(): void {
    this.endpoints.clear();
  }
}

/**
 * 全局文档生成器实例
 */
export const apiDocGenerator = new ApiDocGenerator();

/**
 * 装饰器：自动注册 API 端点到文档生成器
 */
export function documentEndpoint(endpoint: Omit<ApiEndpoint, 'method' | 'path'>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!isDevelopment()) return descriptor;

    const originalMethod = descriptor.value;
    descriptor.value = function (c: Context) {
      // 从上下文中提取方法和路径信息
      const method = c.req.method;
      const path = c.req.path;
      
      // 注册端点到文档生成器
      apiDocGenerator.registerEndpoint({
        method,
        path,
        ...endpoint,
      });

      return originalMethod.call(this, c);
    };

    return descriptor;
  };
}