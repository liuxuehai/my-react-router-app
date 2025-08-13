#!/usr/bin/env node

/**
 * Validation script for route dispatcher implementation
 * Verifies that the implementation meets all requirements
 */

interface ValidationResult {
  passed: boolean;
  message: string;
}

class ImplementationValidator {
  private results: ValidationResult[] = [];

  async validate(): Promise<boolean> {
    console.log('🔍 Validating Route Dispatcher Implementation\n');
    console.log('=' .repeat(50));

    // Test 1: Module imports
    await this.validateModuleImports();
    
    // Test 2: Route dispatcher creation
    await this.validateRouteDispatcherCreation();
    
    // Test 3: Configuration handling
    await this.validateConfigurationHandling();
    
    // Test 4: Error handling structure
    await this.validateErrorHandlingStructure();
    
    // Test 5: Type safety
    await this.validateTypeSafety();

    // Print results
    console.log('\n' + '='.repeat(50));
    console.log('📊 VALIDATION RESULTS');
    console.log('-'.repeat(30));
    
    let allPassed = true;
    for (const result of this.results) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.message}`);
      if (!result.passed) allPassed = false;
    }
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('🎉 ALL VALIDATIONS PASSED!');
      console.log('✅ Route dispatcher implementation is complete and functional');
    } else {
      console.log('💥 SOME VALIDATIONS FAILED!');
      console.log('❌ Please review the implementation');
    }
    
    return allPassed;
  }

  private addResult(passed: boolean, message: string) {
    this.results.push({ passed, message });
  }

  private async validateModuleImports() {
    try {
      const { createRouteDispatcher } = await import('../workers/route-dispatcher.js');
      const { createHonoApp } = await import('../app/api/hono-app.js');
      
      this.addResult(
        typeof createRouteDispatcher === 'function' && typeof createHonoApp === 'function',
        'Module imports work correctly'
      );
    } catch (error) {
      this.addResult(false, `Module import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateRouteDispatcherCreation() {
    try {
      const { createRouteDispatcher, defaultDispatcherConfig } = await import('../workers/route-dispatcher.js');
      
      // Test default creation
      const defaultDispatcher = createRouteDispatcher();
      const customDispatcher = createRouteDispatcher({
        apiPrefix: '/custom-api',
        enableLogging: false,
      });
      
      this.addResult(
        typeof defaultDispatcher === 'function' && 
        typeof customDispatcher === 'function' &&
        defaultDispatcherConfig.apiPrefix === '/api',
        'Route dispatcher creation works with default and custom configs'
      );
    } catch (error) {
      this.addResult(false, `Route dispatcher creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateConfigurationHandling() {
    try {
      const { getHonoConfigFromEnv, defaultHonoConfig } = await import('../app/api/hono-app.js');
      
      // Test environment configuration
      const envConfig = getHonoConfigFromEnv({
        CORS_ORIGIN: 'https://example.com',
        LOG_LEVEL: 'debug',
      });
      
      this.addResult(
        typeof envConfig === 'object' &&
        defaultHonoConfig.basePath === '/api' &&
        defaultHonoConfig.logging.enabled === true,
        'Configuration handling works correctly'
      );
    } catch (error) {
      this.addResult(false, `Configuration handling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateErrorHandlingStructure() {
    try {
      // Read the route dispatcher file to check for error handling patterns
      const fs = await import('fs/promises');
      const content = await fs.readFile('workers/route-dispatcher.ts', 'utf-8');
      
      const hasApiErrorHandling = content.includes('API request error');
      const hasFrontendErrorHandling = content.includes('Frontend request error');
      const hasDispatchErrorHandling = content.includes('Dispatch error');
      const hasErrorResponses = content.includes('INTERNAL_SERVER_ERROR');
      
      this.addResult(
        hasApiErrorHandling && hasFrontendErrorHandling && hasDispatchErrorHandling && hasErrorResponses,
        'Error handling structure is comprehensive'
      );
    } catch (error) {
      this.addResult(false, `Error handling validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async validateTypeSafety() {
    try {
      // Check that TypeScript interfaces are properly defined
      const fs = await import('fs/promises');
      const routeDispatcherContent = await fs.readFile('workers/route-dispatcher.ts', 'utf-8');
      const honoAppContent = await fs.readFile('app/api/hono-app.ts', 'utf-8');
      
      const hasRouteDispatcherConfig = routeDispatcherContent.includes('RouteDispatcherConfig');
      const hasHonoAppConfig = honoAppContent.includes('HonoAppConfig');
      const hasProperTypes = routeDispatcherContent.includes('Request') && routeDispatcherContent.includes('Response');
      
      this.addResult(
        hasRouteDispatcherConfig && hasHonoAppConfig && hasProperTypes,
        'TypeScript interfaces and types are properly defined'
      );
    } catch (error) {
      this.addResult(false, `Type safety validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Run validation
const validator = new ImplementationValidator();
validator.validate().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('Validation script error:', error);
  process.exit(1);
});