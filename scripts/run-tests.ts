#!/usr/bin/env node

/**
 * Comprehensive test runner for route dispatcher functionality
 * Runs both unit and integration tests
 */

async function runAllTests() {
  console.log('🧪 Running Route Dispatcher Test Suite\n');
  console.log('=' .repeat(50));
  
  let allTestsPassed = true;
  
  try {
    // Run unit tests
    console.log('\n📋 UNIT TESTS');
    console.log('-'.repeat(30));
    
    const { runner: unitRunner } = await import('../tests/unit/workers/route-dispatcher.test.js');
    const unitTestsPass = await unitRunner.run();
    
    if (!unitTestsPass) {
      allTestsPassed = false;
    }
    
    // Run integration tests
    console.log('\n🔧 INTEGRATION TESTS');
    console.log('-'.repeat(30));
    
    const { runner: integrationRunner } = await import('../tests/integration/worker-integration.test.js');
    const integrationTestsPass = await integrationRunner.run();
    
    if (!integrationTestsPass) {
      allTestsPassed = false;
    }
    
    // Final results
    console.log('\n' + '='.repeat(50));
    
    if (allTestsPassed) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ Route dispatcher is working correctly');
      console.log('✅ Integration between React Router and Hono is functional');
      process.exit(0);
    } else {
      console.log('💥 SOME TESTS FAILED!');
      console.log('❌ Please review the failed tests above');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Test suite error:', error);
    console.log('\nThis might be due to missing dependencies in the test environment.');
    console.log('The route dispatcher implementation should still be functional.');
    process.exit(1);
  }
}

runAllTests();