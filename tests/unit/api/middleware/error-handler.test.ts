/**
 * Unit tests for error handler middleware
 * Tests error handling, classification, and response formatting
 */

/**
 * Simple test runner for error handler middleware
 */
class ErrorHandlerTestRunner {
  private tests: Array<{ name: string; fn: () => Promise<void> | void }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void> | void) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🔧 Running Error Handler Middleware Tests\n');

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

    console.log(`\n📊 Error Handler Test Results: ${this.passed} passed, ${this.failed} failed`);
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
const runner = new ErrorHandlerTestRunner();

runner.test('should import error handler modules correctly', async () => {
  try {
    const errorHandlerModule = await import('../../../../app/api/middleware/error-handler.js');
    const typesModule = await import('../../../../app/api/types/index.js');
    
    assert('createErrorHandler' in errorHandlerModule, 'createErrorHandler should be exported');
    assert('errorHandler' in errorHandlerModule, 'errorHandler should be exported');
    assert('devErrorHandler' in errorHandlerModule, 'devErrorHandler should be exported');
    assert('prodErrorHandler' in errorHandlerModule, 'prodErrorHandler should be exported');
    assert('throwApiError' in errorHandlerModule, 'throwApiError should be exported');
    
    assert('ApiException' in typesModule, 'ApiException should be exported');
    assert('ApiErrorCode' in typesModule, 'ApiErrorCode should be exported');
    assert('HTTP_STATUS_CODES' in typesModule, 'HTTP_STATUS_CODES should be exported');
  } catch (error) {
    throw new Error(`Module import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should create error handler with default configuration', async () => {
  try {
    const { createErrorHandler } = await import('../../../../app/api/middleware/error-handler.js');
    
    const handler = createErrorHandler();
    assert(typeof handler === 'function', 'Error handler should be a function');
  } catch (error) {
    throw new Error(`Error handler creation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should export predefined error handlers', async () => {
  try {
    const { errorHandler, devErrorHandler, prodErrorHandler } = await import('../../../../app/api/middleware/error-handler.js');
    
    assert(typeof errorHandler === 'function', 'Default error handler should be a function');
    assert(typeof devErrorHandler === 'function', 'Dev error handler should be a function');
    assert(typeof prodErrorHandler === 'function', 'Prod error handler should be a function');
  } catch (error) {
    throw new Error(`Predefined error handlers test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should have throwApiError helper function', async () => {
  try {
    const { throwApiError } = await import('../../../../app/api/middleware/error-handler.js');
    const { ApiErrorCode, ApiException } = await import('../../../../app/api/types/index.js');
    
    assert(typeof throwApiError === 'function', 'throwApiError should be a function');
    
    // Test that it throws ApiException
    let thrownError: any = null;
    try {
      throwApiError(ApiErrorCode.BAD_REQUEST, 'Test error', { field: 'test' });
    } catch (error) {
      thrownError = error;
    }
    
    assert(thrownError !== null, 'throwApiError should throw an error');
    assert(thrownError instanceof ApiException, 'Should throw ApiException');
    assert(thrownError.code === ApiErrorCode.BAD_REQUEST, 'Should have correct error code');
    assert(thrownError.message === 'Test error', 'Should have correct error message');
    assert(thrownError.details?.field === 'test', 'Should have correct error details');
  } catch (error) {
    throw new Error(`throwApiError helper test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should have proper error classification and status mapping', async () => {
  try {
    const { ApiErrorCode, HTTP_STATUS_CODES } = await import('../../../../app/api/types/index.js');
    
    // Test that error codes exist
    assert(typeof ApiErrorCode.BAD_REQUEST === 'string', 'BAD_REQUEST error code should exist');
    assert(typeof ApiErrorCode.UNAUTHORIZED === 'string', 'UNAUTHORIZED error code should exist');
    assert(typeof ApiErrorCode.FORBIDDEN === 'string', 'FORBIDDEN error code should exist');
    assert(typeof ApiErrorCode.NOT_FOUND === 'string', 'NOT_FOUND error code should exist');
    assert(typeof ApiErrorCode.VALIDATION_ERROR === 'string', 'VALIDATION_ERROR error code should exist');
    assert(typeof ApiErrorCode.INTERNAL_SERVER_ERROR === 'string', 'INTERNAL_SERVER_ERROR error code should exist');
    
    // Test that HTTP status codes exist
    assert(HTTP_STATUS_CODES.BAD_REQUEST === 400, 'BAD_REQUEST should map to 400');
    assert(HTTP_STATUS_CODES.UNAUTHORIZED === 401, 'UNAUTHORIZED should map to 401');
    assert(HTTP_STATUS_CODES.FORBIDDEN === 403, 'FORBIDDEN should map to 403');
    assert(HTTP_STATUS_CODES.NOT_FOUND === 404, 'NOT_FOUND should map to 404');
    assert(HTTP_STATUS_CODES.VALIDATION_ERROR === 422, 'VALIDATION_ERROR should map to 422');
    assert(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR === 500, 'INTERNAL_SERVER_ERROR should map to 500');
  } catch (error) {
    throw new Error(`Error classification test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should have proper response format functions', async () => {
  try {
    const { createErrorResponse, createSuccessResponse } = await import('../../../../app/api/types/index.js');
    
    assert(typeof createErrorResponse === 'function', 'createErrorResponse should be a function');
    assert(typeof createSuccessResponse === 'function', 'createSuccessResponse should be a function');
    
    // Test error response creation
    const errorResponse = createErrorResponse({
      code: 'TEST_ERROR',
      message: 'Test error message'
    });
    
    assert(errorResponse.success === false, 'Error response should have success: false');
    assert(errorResponse.error?.code === 'TEST_ERROR', 'Error response should have correct error code');
    assert(errorResponse.error?.message === 'Test error message', 'Error response should have correct error message');
    assert(typeof errorResponse.meta?.timestamp === 'string', 'Error response should have timestamp');
    
    // Test success response creation
    const successResponse = createSuccessResponse({ data: 'test' }, 'Success message');
    
    assert(successResponse.success === true, 'Success response should have success: true');
    assert(successResponse.data?.data === 'test', 'Success response should have correct data');
    assert(successResponse.message === 'Success message', 'Success response should have correct message');
    assert(typeof successResponse.meta?.timestamp === 'string', 'Success response should have timestamp');
  } catch (error) {
    throw new Error(`Response format functions test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

runner.test('should handle ApiException class correctly', async () => {
  try {
    const { ApiException, ApiErrorCode, HTTP_STATUS_CODES } = await import('../../../../app/api/types/index.js');
    
    const exception = new ApiException(
      ApiErrorCode.VALIDATION_ERROR,
      'Validation failed',
      HTTP_STATUS_CODES.VALIDATION_ERROR,
      { field: 'email' }
    );
    
    assert(exception instanceof Error, 'ApiException should extend Error');
    assert(exception instanceof ApiException, 'Should be instance of ApiException');
    assert(exception.code === ApiErrorCode.VALIDATION_ERROR, 'Should have correct error code');
    assert(exception.message === 'Validation failed', 'Should have correct message');
    assert(exception.statusCode === HTTP_STATUS_CODES.VALIDATION_ERROR, 'Should have correct status code');
    assert(exception.details?.field === 'email', 'Should have correct details');
    
    // Test toApiError method
    const apiError = exception.toApiError();
    assert(apiError.code === ApiErrorCode.VALIDATION_ERROR, 'toApiError should return correct code');
    assert(apiError.message === 'Validation failed', 'toApiError should return correct message');
    assert(apiError.details?.field === 'email', 'toApiError should return correct details');
  } catch (error) {
    throw new Error(`ApiException class test failed: ${error instanceof Error ? error.message : String(error)}`);
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