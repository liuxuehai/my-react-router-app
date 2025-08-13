/**
 * 中间件配置系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  MiddlewareConfigManager, 
  MiddlewareType, 
  MiddlewareConfigError,
  type MiddlewareConfig 
} from './middleware.js';
import type { ApiConfig } from './index.js';
import { Environment, LogLevel } from './index.js';

describe('MiddlewareConfigManager', () => {
  let manager: MiddlewareConfigManager;

  beforeEach(() => {
    manager = new MiddlewareConfigManager();
  });

  describe('默认配置', () => {
    it('应该加载默认的中间件配置', () => {
      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(3);
      
      const configNames = configs.map(c => c.name);
      expect(configNames).toContain('errorHandler');
      expect(configNames).toContain('cors');
      expect(configNames).toContain('logger');
    });

    it('默认配置应该按正确顺序排列', () => {
      const middleware = manager.getEnabledMiddleware();
      expect(middleware).toHaveLength(3);
      
      const configs = manager.getAllConfigs().sort((a, b) => a.order - b.order);
      expect(configs[0].name).toBe('errorHandler');
      expect(configs[1].name).toBe('cors');
      expect(configs[2].name).toBe('logger');
    });
  });

  describe('配置管理', () => {
    it('应该能够添加新的中间件配置', () => {
      const config: MiddlewareConfig = {
        name: 'testMiddleware',
        type: MiddlewareType.AUTH,
        enabled: true,
        order: 15,
        options: { secret: 'test-secret' },
      };

      manager.addMiddleware(config);
      
      const retrieved = manager.getConfig('testMiddleware');
      expect(retrieved).toEqual(config);
    });

    it('应该能够更新现有的中间件配置', () => {
      const updates = {
        enabled: false,
        options: { level: 'debug' },
      };

      manager.updateMiddleware('logger', updates);
      
      const config = manager.getConfig('logger');
      expect(config?.enabled).toBe(false);
      expect(config?.options.level).toBe('debug');
    });

    it('应该能够删除中间件配置', () => {
      manager.removeMiddleware('logger');
      
      const config = manager.getConfig('logger');
      expect(config).toBeUndefined();
    });

    it('应该能够启用/禁用中间件', () => {
      manager.toggleMiddleware('cors', false);
      
      const config = manager.getConfig('cors');
      expect(config?.enabled).toBe(false);
      
      const enabledMiddleware = manager.getEnabledMiddleware();
      expect(enabledMiddleware).toHaveLength(2);
    });
  });

  describe('配置验证', () => {
    it('应该验证中间件名称', () => {
      const config = {
        name: '',
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {},
      };

      expect(() => manager.addMiddleware(config)).toThrow('Middleware name is required');
    });

    it('应该验证中间件类型', () => {
      const config = {
        name: 'test',
        type: 'invalid' as MiddlewareType,
        enabled: true,
        order: 10,
        options: {},
      };

      expect(() => manager.addMiddleware(config)).toThrow('Invalid middleware type');
    });

    it('应该验证执行顺序', () => {
      const config = {
        name: 'test',
        type: MiddlewareType.CORS,
        enabled: true,
        order: -1,
        options: {},
      };

      expect(() => manager.addMiddleware(config)).toThrow('Middleware order must be a non-negative number');
    });
  });

  describe('从 API 配置更新', () => {
    it('应该能够从 API 配置更新中间件配置', () => {
      const apiConfig: ApiConfig = {
        environment: Environment.DEVELOPMENT,
        basePath: '/api',
        port: 3000,
        host: 'localhost',
        cors: {
          origin: ['https://example.com'],
          methods: ['GET', 'POST'],
          headers: ['Content-Type'],
          credentials: true,
          maxAge: 3600,
        },
        logging: {
          enabled: false,
          level: LogLevel.ERROR,
          showErrorDetails: false,
          logRequestBody: true,
          logResponseBody: true,
        },
        security: {
          jwtExpiresIn: '1h',
          rateLimit: {
            enabled: false,
            windowMs: 15 * 60 * 1000,
            maxRequests: 100,
          },
          maxRequestSize: 1024 * 1024,
        },
        database: {
          poolSize: 10,
          connectionTimeout: 30000,
          queryTimeout: 10000,
          ssl: false,
        },
        version: '1.0.0',
        enableDocs: true,
      };

      manager.updateFromApiConfig(apiConfig);

      const corsConfig = manager.getConfig('cors');
      expect(corsConfig?.options.origin).toEqual(['https://example.com']);
      expect(corsConfig?.options.credentials).toBe(true);

      const loggerConfig = manager.getConfig('logger');
      expect(loggerConfig?.enabled).toBe(false);
      expect(loggerConfig?.options.level).toBe('error');
      expect(loggerConfig?.options.includeRequestBody).toBe(true);
    });
  });

  describe('配置导入导出', () => {
    it('应该能够导出配置为 JSON', () => {
      const json = manager.exportConfig();
      const configs = JSON.parse(json);
      
      expect(Array.isArray(configs)).toBe(true);
      expect(configs).toHaveLength(3);
    });

    it('应该能够从 JSON 导入配置', () => {
      const testConfigs: MiddlewareConfig[] = [
        {
          name: 'testCors',
          type: MiddlewareType.CORS,
          enabled: true,
          order: 10,
          options: { origin: 'https://test.com' },
        },
      ];

      const json = JSON.stringify(testConfigs);
      manager.importConfig(json);

      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe('testCors');
    });

    it('导入无效配置应该抛出错误', () => {
      const invalidJson = '{"invalid": "config"}';
      
      expect(() => manager.importConfig(invalidJson)).toThrow('Failed to import middleware config');
    });
  });

  describe('配置变更监听', () => {
    it('应该能够监听配置变更', () => {
      let changedConfig: MiddlewareConfig | null = null;
      
      manager.onConfigChange((config) => {
        changedConfig = config;
      });

      const testConfig: MiddlewareConfig = {
        name: 'test',
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {},
      };

      manager.addMiddleware(testConfig);
      
      expect(changedConfig).toEqual(testConfig);
    });

    it('应该能够移除配置变更监听器', () => {
      let changeCount = 0;
      
      const listener = () => {
        changeCount++;
      };

      manager.onConfigChange(listener);
      manager.removeConfigChangeListener(listener);

      const testConfig: MiddlewareConfig = {
        name: 'test',
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {},
      };

      manager.addMiddleware(testConfig);
      
      expect(changeCount).toBe(0);
    });
  });

  describe('路径模式匹配', () => {
    it('应该支持字符串路径模式', () => {
      const config: MiddlewareConfig = {
        name: 'apiOnlyMiddleware',
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {},
        pathPattern: '/api',
      };

      manager.addMiddleware(config);
      
      const middleware = manager.getEnabledMiddleware();
      expect(middleware).toHaveLength(4); // 3 default + 1 new
    });

    it('应该支持正则表达式路径模式', () => {
      const config: MiddlewareConfig = {
        name: 'regexMiddleware',
        type: MiddlewareType.CORS,
        enabled: true,
        order: 10,
        options: {},
        pathPattern: /^\/api\/v\d+/,
      };

      manager.addMiddleware(config);
      
      const retrievedConfig = manager.getConfig('regexMiddleware');
      expect(retrievedConfig?.pathPattern).toEqual(/^\/api\/v\d+/);
    });
  });

  describe('重置功能', () => {
    it('应该能够重置为默认配置', () => {
      // 添加一些自定义配置
      manager.addMiddleware({
        name: 'custom',
        type: MiddlewareType.AUTH,
        enabled: true,
        order: 5,
        options: {},
      });

      expect(manager.getAllConfigs()).toHaveLength(4);

      // 重置为默认配置
      manager.resetToDefaults();

      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(3);
      
      const configNames = configs.map(c => c.name);
      expect(configNames).toContain('errorHandler');
      expect(configNames).toContain('cors');
      expect(configNames).toContain('logger');
    });
  });
});

describe('MiddlewareConfigError', () => {
  it('应该创建带有中间件名称的错误', () => {
    const error = new MiddlewareConfigError('Test error', 'testMiddleware');
    
    expect(error.message).toBe('Test error');
    expect(error.middlewareName).toBe('testMiddleware');
    expect(error.name).toBe('MiddlewareConfigError');
  });
});