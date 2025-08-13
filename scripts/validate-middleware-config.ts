/**
 * 验证中间件配置系统的脚本
 */

import { 
  MiddlewareConfigManager, 
  MiddlewareType,
  createApiConfig,
  Environment,
  LogLevel,
  type MiddlewareConfig,
  type ApiConfig 
} from '../app/api/config/index.js';

console.log('🔧 验证中间件配置系统...\n');

// 测试 1: 创建配置管理器并检查默认配置
console.log('1. 测试默认配置加载...');
const manager = new MiddlewareConfigManager();
const defaultConfigs = manager.getAllConfigs();
console.log(`✅ 加载了 ${defaultConfigs.length} 个默认中间件配置`);
defaultConfigs.forEach(config => {
  console.log(`   - ${config.name} (${config.type}): ${config.enabled ? '启用' : '禁用'}, 顺序: ${config.order}`);
});

// 测试 2: 添加自定义中间件配置
console.log('\n2. 测试添加自定义中间件...');
try {
  const customConfig: MiddlewareConfig = {
    name: 'customAuth',
    type: MiddlewareType.AUTH,
    enabled: true,
    order: 5,
    options: { secret: 'test-secret' },
    pathPattern: '/api/protected',
  };
  
  manager.addMiddleware(customConfig);
  const retrieved = manager.getConfig('customAuth');
  console.log(`✅ 成功添加自定义中间件: ${retrieved?.name}`);
} catch (error) {
  console.log(`❌ 添加自定义中间件失败: ${error}`);
}

// 测试 3: 更新中间件配置
console.log('\n3. 测试更新中间件配置...');
try {
  manager.updateMiddleware('logger', {
    enabled: false,
    options: { level: 'debug', includeRequestBody: true }
  });
  
  const updatedConfig = manager.getConfig('logger');
  console.log(`✅ 成功更新 logger 配置: enabled=${updatedConfig?.enabled}, level=${updatedConfig?.options.level}`);
} catch (error) {
  console.log(`❌ 更新中间件配置失败: ${error}`);
}

// 测试 4: 从 API 配置更新中间件
console.log('\n4. 测试从 API 配置更新中间件...');
try {
  const apiConfig: ApiConfig = createApiConfig({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://example.com,https://app.example.com',
    CORS_CREDENTIALS: 'true',
    LOG_LEVEL: 'warn',
    LOGGING_ENABLED: 'true',
    SHOW_ERROR_DETAILS: 'false',
  });
  
  manager.updateFromApiConfig(apiConfig);
  
  const corsConfig = manager.getConfig('cors');
  const loggerConfig = manager.getConfig('logger');
  
  console.log(`✅ CORS 配置更新: origin=${JSON.stringify(corsConfig?.options.origin)}, credentials=${corsConfig?.options.credentials}`);
  console.log(`✅ Logger 配置更新: level=${loggerConfig?.options.level}, enabled=${loggerConfig?.enabled}`);
} catch (error) {
  console.log(`❌ 从 API 配置更新失败: ${error}`);
}

// 测试 5: 获取启用的中间件
console.log('\n5. 测试获取启用的中间件...');
const enabledMiddleware = manager.getEnabledMiddleware();
console.log(`✅ 获取到 ${enabledMiddleware.length} 个启用的中间件`);

// 测试 6: 配置导出和导入
console.log('\n6. 测试配置导出和导入...');
try {
  const exportedConfig = manager.exportConfig();
  console.log(`✅ 配置导出成功，大小: ${exportedConfig.length} 字符`);
  
  // 创建新的管理器并导入配置
  const newManager = new MiddlewareConfigManager();
  newManager.importConfig(exportedConfig);
  
  const importedConfigs = newManager.getAllConfigs();
  console.log(`✅ 配置导入成功，导入了 ${importedConfigs.length} 个配置`);
} catch (error) {
  console.log(`❌ 配置导出/导入失败: ${error}`);
}

// 测试 7: 配置验证
console.log('\n7. 测试配置验证...');
try {
  const invalidConfig = {
    name: '', // 无效的名称
    type: MiddlewareType.CORS,
    enabled: true,
    order: 10,
    options: {},
  };
  
  manager.addMiddleware(invalidConfig);
  console.log('❌ 应该拒绝无效配置');
} catch (error) {
  console.log(`✅ 正确拒绝了无效配置: ${error}`);
}

// 测试 8: 配置变更监听
console.log('\n8. 测试配置变更监听...');
let changeNotified = false;
const changeListener = (config: MiddlewareConfig) => {
  changeNotified = true;
  console.log(`✅ 收到配置变更通知: ${config.name}`);
};

manager.onConfigChange(changeListener);

try {
  manager.toggleMiddleware('cors', false);
  if (changeNotified) {
    console.log('✅ 配置变更监听器工作正常');
  } else {
    console.log('❌ 配置变更监听器未触发');
  }
} catch (error) {
  console.log(`❌ 配置变更监听测试失败: ${error}`);
}

// 测试 9: 重置为默认配置
console.log('\n9. 测试重置为默认配置...');
try {
  const beforeReset = manager.getAllConfigs().length;
  manager.resetToDefaults();
  const afterReset = manager.getAllConfigs().length;
  
  console.log(`✅ 重置成功: ${beforeReset} -> ${afterReset} 个配置`);
} catch (error) {
  console.log(`❌ 重置失败: ${error}`);
}

console.log('\n🎉 中间件配置系统验证完成！');