/**
 * API 测试客户端
 * 提供开发环境下的 API 测试工具
 */

import { isDevelopment } from '../config/index.js';

export interface TestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  description?: string;
}

export interface TestResponse {
  status: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
  success: boolean;
  error?: string;
}

export interface TestSuite {
  name: string;
  description?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  description?: string;
  request: TestRequest;
  expectedStatus?: number;
  expectedBody?: any;
  validate?: (response: TestResponse) => boolean | string;
}

/**
 * API 测试客户端类
 */
export class ApiTestClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private enabled: boolean;

  constructor(baseUrl: string = '/api', defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
    };
    this.enabled = isDevelopment();
  }

  /**
   * 执行单个测试请求
   */
  async executeRequest(request: TestRequest): Promise<TestResponse> {
    if (!this.enabled) {
      throw new Error('API test client is only available in development mode');
    }

    const startTime = Date.now();
    
    try {
      // 构建 URL
      const url = new URL(this.baseUrl + request.path, 
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
      );
      
      // 添加查询参数
      if (request.query) {
        Object.entries(request.query).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      // 构建请求选项
      const options: RequestInit = {
        method: request.method,
        headers: {
          ...this.defaultHeaders,
          ...request.headers,
        },
      };

      // 添加请求体
      if (request.body && request.method !== 'GET' && request.method !== 'DELETE') {
        if (typeof request.body === 'string') {
          options.body = request.body;
        } else {
          options.body = JSON.stringify(request.body);
        }
      }

      // 发送请求
      const response = await fetch(url.toString(), options);
      const duration = Date.now() - startTime;

      // 解析响应
      let body: any;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        body = await response.json();
      } else if (contentType?.includes('text/')) {
        body = await response.text();
      } else {
        body = await response.arrayBuffer();
      }

      // 构建响应对象
      const testResponse: TestResponse = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        duration,
        success: response.ok,
      };

      return testResponse;

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        status: 0,
        headers: {},
        body: null,
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 执行测试用例
   */
  async executeTestCase(testCase: TestCase): Promise<{
    name: string;
    passed: boolean;
    response: TestResponse;
    error?: string;
  }> {
    if (!this.enabled) {
      throw new Error('API test client is only available in development mode');
    }

    try {
      const response = await this.executeRequest(testCase.request);
      
      let passed = true;
      let error: string | undefined;

      // 检查期望的状态码
      if (testCase.expectedStatus && response.status !== testCase.expectedStatus) {
        passed = false;
        error = `Expected status ${testCase.expectedStatus}, got ${response.status}`;
      }

      // 检查期望的响应体
      if (passed && testCase.expectedBody) {
        const bodyMatch = JSON.stringify(response.body) === JSON.stringify(testCase.expectedBody);
        if (!bodyMatch) {
          passed = false;
          error = 'Response body does not match expected body';
        }
      }

      // 执行自定义验证
      if (passed && testCase.validate) {
        const validationResult = testCase.validate(response);
        if (typeof validationResult === 'string') {
          passed = false;
          error = validationResult;
        } else if (!validationResult) {
          passed = false;
          error = 'Custom validation failed';
        }
      }

      return {
        name: testCase.name,
        passed,
        response,
        error,
      };

    } catch (error) {
      return {
        name: testCase.name,
        passed: false,
        response: {
          status: 0,
          headers: {},
          body: null,
          duration: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 执行测试套件
   */
  async executeTestSuite(testSuite: TestSuite): Promise<{
    name: string;
    passed: number;
    failed: number;
    total: number;
    results: Array<{
      name: string;
      passed: boolean;
      response: TestResponse;
      error?: string;
    }>;
  }> {
    if (!this.enabled) {
      throw new Error('API test client is only available in development mode');
    }

    console.group(`🧪 Running test suite: ${testSuite.name}`);
    
    const results = [];
    let passed = 0;
    let failed = 0;

    // 临时更新基础 URL 和默认头部
    const originalBaseUrl = this.baseUrl;
    const originalDefaultHeaders = this.defaultHeaders;
    
    if (testSuite.baseUrl) {
      this.baseUrl = testSuite.baseUrl;
    }
    if (testSuite.defaultHeaders) {
      this.defaultHeaders = { ...this.defaultHeaders, ...testSuite.defaultHeaders };
    }

    try {
      for (const testCase of testSuite.tests) {
        console.log(`Running: ${testCase.name}`);
        const result = await this.executeTestCase(testCase);
        results.push(result);
        
        if (result.passed) {
          passed++;
          console.log(`✅ ${testCase.name} - ${result.response.status} (${result.response.duration}ms)`);
        } else {
          failed++;
          console.error(`❌ ${testCase.name} - ${result.error}`);
        }
      }
    } finally {
      // 恢复原始配置
      this.baseUrl = originalBaseUrl;
      this.defaultHeaders = originalDefaultHeaders;
    }

    const total = testSuite.tests.length;
    console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`);
    console.groupEnd();

    return {
      name: testSuite.name,
      passed,
      failed,
      total,
      results,
    };
  }

  /**
   * 生成测试报告 HTML
   */
  generateTestReport(suiteResults: Array<{
    name: string;
    passed: number;
    failed: number;
    total: number;
    results: Array<{
      name: string;
      passed: boolean;
      response: TestResponse;
      error?: string;
    }>;
  }>): string {
    if (!this.enabled) {
      return '<h1>Test reports are only available in development mode</h1>';
    }

    const totalPassed = suiteResults.reduce((sum, suite) => sum + suite.passed, 0);
    const totalFailed = suiteResults.reduce((sum, suite) => sum + suite.failed, 0);
    const totalTests = totalPassed + totalFailed;

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: #1f2937; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .stat { background: #f9fafb; padding: 15px; border-radius: 6px; text-align: center; flex: 1; }
        .stat.passed { border-left: 4px solid #10b981; }
        .stat.failed { border-left: 4px solid #ef4444; }
        .stat.total { border-left: 4px solid #3b82f6; }
        .suite { margin: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .suite-header { background: #f9fafb; padding: 15px; border-bottom: 1px solid #e5e7eb; }
        .test-case { padding: 15px; border-bottom: 1px solid #f3f4f6; }
        .test-case:last-child { border-bottom: none; }
        .test-case.passed { border-left: 4px solid #10b981; }
        .test-case.failed { border-left: 4px solid #ef4444; }
        .response-details { background: #1f2937; color: #f9fafb; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 12px; }
        .toggle-details { background: #6b7280; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 API Test Report</h1>
            <p>Generated at ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="summary">
            <div class="stat total">
                <h3>${totalTests}</h3>
                <p>Total Tests</p>
            </div>
            <div class="stat passed">
                <h3>${totalPassed}</h3>
                <p>Passed</p>
            </div>
            <div class="stat failed">
                <h3>${totalFailed}</h3>
                <p>Failed</p>
            </div>
        </div>

        ${suiteResults.map(suite => `
            <div class="suite">
                <div class="suite-header">
                    <h3>${suite.name}</h3>
                    <p>${suite.passed}/${suite.total} tests passed</p>
                </div>
                ${suite.results.map(result => `
                    <div class="test-case ${result.passed ? 'passed' : 'failed'}">
                        <h4>${result.passed ? '✅' : '❌'} ${result.name}</h4>
                        <p>Status: ${result.response.status} | Duration: ${result.response.duration}ms</p>
                        ${result.error ? `<p style="color: #ef4444;">Error: ${result.error}</p>` : ''}
                        <button class="toggle-details" onclick="toggleDetails('${result.name.replace(/\s+/g, '-')}')">
                            Toggle Details
                        </button>
                        <div id="${result.name.replace(/\s+/g, '-')}" class="response-details" style="display: none;">
                            <pre>${JSON.stringify(result.response, null, 2)}</pre>
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('')}
    </div>
    
    <script>
        function toggleDetails(id) {
            const element = document.getElementById(id);
            element.style.display = element.style.display === 'none' ? 'block' : 'none';
        }
    </script>
</body>
</html>`;
  }
}

/**
 * 默认测试客户端实例
 */
export const apiTestClient = new ApiTestClient();

/**
 * 创建示例测试套件
 */
export function createExampleTestSuite(): TestSuite {
  return {
    name: 'API Example Tests',
    description: 'Basic API functionality tests',
    tests: [
      {
        name: 'Health Check',
        description: 'Test the health endpoint',
        request: {
          method: 'GET',
          path: '/health',
        },
        expectedStatus: 200,
        validate: (response) => {
          return response.body?.success === true;
        },
      },
      {
        name: 'Get All Items',
        description: 'Test getting all items',
        request: {
          method: 'GET',
          path: '/example',
        },
        expectedStatus: 200,
      },
      {
        name: 'Create New Item',
        description: 'Test creating a new item',
        request: {
          method: 'POST',
          path: '/example',
          body: {
            name: 'Test Item',
            description: 'This is a test item',
          },
        },
        expectedStatus: 201,
      },
    ],
  };
}