/**
 * 端到端测试运行器
 * End-to-end test runner for signature authentication
 */

import { execSync } from "child_process";
import { performance } from "perf_hooks";

interface TestSuite {
  name: string;
  file: string;
  description: string;
  estimatedDuration: number; // in seconds
  tags: string[];
}

const testSuites: TestSuite[] = [
  {
    name: "End-to-End Integration",
    file: "tests/integration/auth/end-to-end-integration.test.ts",
    description: "Complete signature generation to verification flow tests",
    estimatedDuration: 120,
    tags: ["core", "integration", "e2e"],
  },
  {
    name: "Client-Server Integration", 
    file: "tests/integration/auth/client-server-integration.test.ts",
    description: "Basic client-server integration tests",
    estimatedDuration: 60,
    tags: ["core", "integration"],
  },
  {
    name: "Multi-Channel Workflow",
    file: "tests/integration/multi-channel-workflow.test.ts", 
    description: "Multi-app and multi-key scenarios",
    estimatedDuration: 90,
    tags: ["multi-channel", "integration"],
  },
  {
    name: "Key Management Integration",
    file: "tests/integration/auth/key-management-integration.test.ts",
    description: "Key lifecycle and management tests",
    estimatedDuration: 80,
    tags: ["key-management", "integration"],
  },
  {
    name: "Storage Backends",
    file: "tests/integration/auth/storage-backends.test.ts",
    description: "Storage provider integration tests", 
    estimatedDuration: 45,
    tags: ["storage", "integration"],
  },
  {
    name: "Performance Benchmarks",
    file: "tests/performance/signature-auth-benchmark.test.ts",
    description: "Performance and optimization tests",
    estimatedDuration: 150,
    tags: ["performance", "benchmark"],
  },
  {
    name: "Stress Testing",
    file: "tests/integration/auth/stress-test.test.ts",
    description: "High load and stress testing",
    estimatedDuration: 180,
    tags: ["stress", "performance", "load"],
  },
  {
    name: "Edge Cases",
    file: "tests/integration/auth/edge-cases.test.ts",
    description: "Boundary conditions and edge cases",
    estimatedDuration: 100,
    tags: ["edge-cases", "boundary"],
  },
];

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

interface TestRunOptions {
  /** 要运行的测试套件标签过滤器 */
  tags?: string[];
  /** 是否并行运行测试 */
  parallel?: boolean;
  /** 最大并行数 */
  maxConcurrency?: number;
  /** 是否生成详细报告 */
  verbose?: boolean;
  /** 是否在第一个失败时停止 */
  failFast?: boolean;
  /** 超时时间（秒） */
  timeout?: number;
}

class E2ETestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runTests(options: TestRunOptions = {}): Promise<void> {
    const {
      tags = [],
      parallel = false,
      maxConcurrency = 3,
      verbose = true,
      failFast = false,
      timeout = 300, // 5 minutes per test suite
    } = options;

    console.log("🚀 Starting End-to-End Test Suite");
    console.log("=====================================");

    // 过滤测试套件
    const filteredSuites = this.filterTestSuites(testSuites, tags);
    
    if (filteredSuites.length === 0) {
      console.log("❌ No test suites match the specified criteria");
      return;
    }

    console.log(`📋 Running ${filteredSuites.length} test suite(s):`);
    filteredSuites.forEach(suite => {
      console.log(`   • ${suite.name} (${suite.estimatedDuration}s)`);
    });
    console.log();

    this.startTime = performance.now();

    if (parallel) {
      await this.runTestsInParallel(filteredSuites, maxConcurrency, timeout, failFast);
    } else {
      await this.runTestsSequentially(filteredSuites, timeout, failFast, verbose);
    }

    this.generateReport(verbose);
  }

  private filterTestSuites(suites: TestSuite[], tags: string[]): TestSuite[] {
    if (tags.length === 0) {
      return suites;
    }

    return suites.filter(suite => 
      tags.some(tag => suite.tags.includes(tag))
    );
  }

  private async runTestsSequentially(
    suites: TestSuite[], 
    timeout: number, 
    failFast: boolean,
    verbose: boolean
  ): Promise<void> {
    for (let i = 0; i < suites.length; i++) {
      const suite = suites[i];
      console.log(`\n[${i + 1}/${suites.length}] Running: ${suite.name}`);
      console.log(`Description: ${suite.description}`);
      console.log(`File: ${suite.file}`);
      
      const result = await this.runSingleTest(suite, timeout, verbose);
      this.results.push(result);

      if (!result.passed && failFast) {
        console.log(`\n❌ Test failed and fail-fast is enabled. Stopping execution.`);
        break;
      }
    }
  }

  private async runTestsInParallel(
    suites: TestSuite[], 
    maxConcurrency: number, 
    timeout: number,
    failFast: boolean
  ): Promise<void> {
    console.log(`\n🔄 Running tests in parallel (max concurrency: ${maxConcurrency})`);

    const chunks = this.chunkArray(suites, maxConcurrency);
    
    for (const chunk of chunks) {
      const promises = chunk.map(suite => this.runSingleTest(suite, timeout, false));
      const chunkResults = await Promise.all(promises);
      
      this.results.push(...chunkResults);

      // 检查是否有失败且启用了 fail-fast
      if (failFast && chunkResults.some(result => !result.passed)) {
        console.log(`\n❌ Test failed and fail-fast is enabled. Stopping execution.`);
        break;
      }
    }
  }

  private async runSingleTest(suite: TestSuite, timeout: number, verbose: boolean): Promise<TestResult> {
    const startTime = performance.now();
    
    try {
      if (verbose) {
        console.log(`⏳ Starting ${suite.name}...`);
      }

      const command = `npx vitest run "${suite.file}" --reporter=verbose`;
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: timeout * 1000,
        stdio: verbose ? 'inherit' : 'pipe',
      });

      const duration = (performance.now() - startTime) / 1000;
      
      if (verbose) {
        console.log(`✅ ${suite.name} completed in ${duration.toFixed(2)}s`);
      }

      return {
        suite: suite.name,
        passed: true,
        duration,
        output: typeof output === 'string' ? output : '',
      };

    } catch (error) {
      const duration = (performance.now() - startTime) / 1000;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (verbose) {
        console.log(`❌ ${suite.name} failed after ${duration.toFixed(2)}s`);
        console.log(`Error: ${errorMessage}`);
      }

      return {
        suite: suite.name,
        passed: false,
        duration,
        output: '',
        error: errorMessage,
      };
    }
  }

  private generateReport(verbose: boolean): void {
    const totalDuration = (performance.now() - this.startTime) / 1000;
    const passedCount = this.results.filter(r => r.passed).length;
    const failedCount = this.results.filter(r => !r.passed).length;
    const totalCount = this.results.length;

    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST EXECUTION SUMMARY");
    console.log("=".repeat(60));
    
    console.log(`Total test suites: ${totalCount}`);
    console.log(`✅ Passed: ${passedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`⏱️  Total duration: ${totalDuration.toFixed(2)}s`);
    console.log(`📈 Success rate: ${((passedCount / totalCount) * 100).toFixed(1)}%`);

    if (verbose && this.results.length > 0) {
      console.log("\n📋 DETAILED RESULTS:");
      console.log("-".repeat(60));
      
      this.results.forEach((result, index) => {
        const status = result.passed ? "✅ PASS" : "❌ FAIL";
        const duration = result.duration.toFixed(2);
        
        console.log(`${index + 1}. ${status} ${result.suite} (${duration}s)`);
        
        if (!result.passed && result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });
    }

    if (failedCount > 0) {
      console.log("\n🔍 FAILED TEST SUITES:");
      console.log("-".repeat(60));
      
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`❌ ${result.suite}`);
          if (result.error) {
            console.log(`   ${result.error}`);
          }
        });
    }

    // 性能分析
    if (verbose && this.results.length > 1) {
      console.log("\n⚡ PERFORMANCE ANALYSIS:");
      console.log("-".repeat(60));
      
      const sortedByDuration = [...this.results].sort((a, b) => b.duration - a.duration);
      
      console.log("Slowest test suites:");
      sortedByDuration.slice(0, 3).forEach((result, index) => {
        console.log(`${index + 1}. ${result.suite}: ${result.duration.toFixed(2)}s`);
      });
      
      const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
      console.log(`Average duration: ${avgDuration.toFixed(2)}s`);
    }

    // 建议
    console.log("\n💡 RECOMMENDATIONS:");
    console.log("-".repeat(60));
    
    if (failedCount > 0) {
      console.log("• Review failed test suites and fix issues before deployment");
    }
    
    if (totalDuration > 600) { // 10 minutes
      console.log("• Consider running tests in parallel to reduce execution time");
    }
    
    const slowTests = this.results.filter(r => r.duration > 120); // 2 minutes
    if (slowTests.length > 0) {
      console.log("• Optimize slow test suites for better CI/CD performance");
    }
    
    if (passedCount === totalCount) {
      console.log("• All tests passed! 🎉 Ready for deployment");
    }

    console.log("\n" + "=".repeat(60));
    
    // 设置退出码
    if (failedCount > 0) {
      process.exit(1);
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// CLI 接口
async function main() {
  const args = process.argv.slice(2);
  const options: TestRunOptions = {};

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--tags':
        options.tags = args[++i]?.split(',') || [];
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--concurrency':
        options.maxConcurrency = parseInt(args[++i]) || 3;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--fail-fast':
        options.failFast = true;
        break;
      case '--timeout':
        options.timeout = parseInt(args[++i]) || 300;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  const runner = new E2ETestRunner();
  await runner.runTests(options);
}

function printHelp() {
  console.log(`
End-to-End Test Runner for API Signature Authentication

Usage: npx tsx tests/integration/auth/run-e2e-tests.ts [options]

Options:
  --tags <tags>         Comma-separated list of tags to filter tests
                        Available tags: core, integration, e2e, multi-channel,
                        key-management, storage, performance, benchmark, stress,
                        load, edge-cases, boundary
  
  --parallel            Run tests in parallel (default: sequential)
  --concurrency <n>     Maximum number of parallel tests (default: 3)
  --verbose             Show detailed output (default: true)
  --fail-fast           Stop on first failure (default: false)
  --timeout <seconds>   Timeout per test suite in seconds (default: 300)
  --help                Show this help message

Examples:
  # Run all tests
  npx tsx tests/integration/auth/run-e2e-tests.ts

  # Run only core integration tests
  npx tsx tests/integration/auth/run-e2e-tests.ts --tags core,integration

  # Run performance tests in parallel
  npx tsx tests/integration/auth/run-e2e-tests.ts --tags performance --parallel

  # Run with fail-fast enabled
  npx tsx tests/integration/auth/run-e2e-tests.ts --fail-fast

  # Run stress tests with higher timeout
  npx tsx tests/integration/auth/run-e2e-tests.ts --tags stress --timeout 600
`);
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

export { E2ETestRunner, type TestRunOptions, type TestResult };