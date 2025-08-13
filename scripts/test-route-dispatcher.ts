#!/usr/bin/env node

/**
 * Simple test runner for route dispatcher
 * This script runs the route dispatcher tests without requiring a full testing framework
 */

import { runner } from '../tests/unit/workers/route-dispatcher.test.js';

async function runTests() {
  console.log('🚀 Starting Route Dispatcher Tests...\n');
  
  try {
    const success = await runner.run();
    
    if (success) {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('\n💥 Some tests failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test runner error:', error);
    process.exit(1);
  }
}

runTests();