/**
 * Integration tests for worker functionality
 * Tests the integration between React Router and Hono applications
 */

/**
 * Simple integration test runner
 */
class IntegrationTestRunner {
  private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void> | void) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🔧 Running Worker Integration Tests\n');

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        this.failed++;
      }
    }

    console.log(`\n📊 Integration Test Results: ${this.passed} passed, ${this.failed} failed`);
    return this.failed === 0;
  }
}

/**
 * Helper function to assert conditions
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test suite
const runner = new IntegrationTestRunner();

runner.test('should have proper module structure', async () => {
  // Test that all required modules can be imported
  try {
    const { createRouteDispatcher } = await import('../../workers/route-dispatcher.js');
    const { createHonoApp } = await import('../../app/api/hono-app.js');
    
    assert(typeof createRouteDispatcher === 'function', 'createRouteDispatcher should be a function');
    assert(typeof createHonoApp === 'function', 'createHonoApp should be a function');
  } catch (error) {
    throw new Error(`Module import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should create Hono app with proper configuration', async () => {
  try {
    const { createHonoApp, defaultHonoConfig } = await import('../../app/api/hono-app.js');
    
    const app = createHonoApp();
    assert(app !== null && app !== undefined, 'Hono app should be created');
    
    // Test default configuration
    assert(defaultHonoConfig.basePath === '/api', 'Default base path should be /api');
    assert(defaultHonoConfig.cors.origin === '*', 'Default CORS origin should be *');
    assert(defaultHonoConfig.logging.enabled === true, 'Default logging should be enabled');
  } catch (error) {
    throw new Error(`Hono app creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should create route dispatcher with proper configuration', async () => {
  try {
    const { createRouteDispatcher, defaultDispatcherConfig } = await import('../../workers/route-dispatcher.js');
    
    const dispatcher = createRouteDispatcher();
    assert(typeof dispatcher === 'function', 'Route dispatcher should be a function');
    
    // Test default configuration
    assert(defaultDispatcherConfig.apiPrefix === '/api', 'Default API prefix should be /api');
    assert(defaultDispatcherConfig.enableLogging === true, 'Default logging should be enabled');
  } catch (error) {
    throw new Error(`Route dispatcher creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should have proper TypeScript types', async () => {
  // This test verifies that the TypeScript compilation would succeed
  // by checking that the modules export the expected interfaces
  try {
    const routeDispatcherModule = await import('../../workers/route-dispatcher.js');
    const honoAppModule = await import('../../app/api/hono-app.js');
    
    // Check that the main functions exist
    assert('createRouteDispatcher' in routeDispatcherModule, 'createRouteDispatcher should be exported');
    assert('defaultDispatcherConfig' in routeDispatcherModule, 'defaultDispatcherConfig should be exported');
    assert('createHonoApp' in honoAppModule, 'createHonoApp should be exported');
    assert('defaultHonoConfig' in honoAppModule, 'defaultHonoConfig should be exported');
    assert('getHonoConfigFromEnv' in honoAppModule, 'getHonoConfigFromEnv should be exported');
  } catch (error) {
    throw new Error(`TypeScript interface check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should handle environment configuration', async () => {
  try {
    const { getHonoConfigFromEnv } = await import('../../app/api/hono-app.js');
    
    // Test with empty environment
    const emptyConfig = getHonoConfigFromEnv({});
    assert(typeof emptyConfig === 'object', 'Should return configuration object');
    
    // Test with custom environment
    const customEnv = {
      CORS_ORIGIN: 'https://example.com,https://test.com',
      CORS_METHODS: 'GET,POST',
      LOGGING_ENABLED: 'true',
      LOG_LEVEL: 'debug',
    };
    
    const customConfig = getHonoConfigFromEnv(customEnv);
    assert(Array.isArray(customConfig.cors?.origin), 'CORS origin should be parsed as array');
    assert(customConfig.logging?.level === 'debug', 'Log level should be set from environment');
  } catch (error) {
    throw new Error(`Environment configuration test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Export the test runner
export { runner };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().then((success) => {
    process.exit(success ? 0 : 1);
  });
}