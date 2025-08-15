/**
 * 性能监控工具
 * Performance monitoring utilities for signature authentication
 */

export interface PerformanceThresholds {
  /** 签名验证最大允许时间（毫秒） */
  maxVerificationTime: number;
  /** 公钥解析最大允许时间（毫秒） */
  maxKeyParseTime: number;
  /** 最小缓存命中率 */
  minCacheHitRate: number;
  /** 最大内存使用量（字节） */
  maxMemoryUsage: number;
}

export interface PerformanceAlert {
  /** 告警类型 */
  type: 'SLOW_VERIFICATION' | 'SLOW_KEY_PARSE' | 'LOW_CACHE_HIT_RATE' | 'HIGH_MEMORY_USAGE' | 'PERFORMANCE_DEGRADATION';
  /** 告警级别 */
  level: 'WARNING' | 'ERROR' | 'CRITICAL';
  /** 告警消息 */
  message: string;
  /** 当前值 */
  currentValue: number;
  /** 阈值 */
  threshold: number;
  /** 时间戳 */
  timestamp: Date;
  /** 额外数据 */
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  /** 报告生成时间 */
  timestamp: Date;
  /** 总体性能评分 (0-100) */
  overallScore: number;
  /** 性能指标 */
  metrics: {
    /** 平均验证时间（毫秒） */
    avgVerificationTime: number;
    /** 95% 分位数验证时间（毫秒） */
    p95VerificationTime: number;
    /** 缓存命中率 */
    cacheHitRate: number;
    /** 内存使用量（字节） */
    memoryUsage: number;
    /** 每秒处理请求数 */
    requestsPerSecond: number;
  };
  /** 性能趋势 */
  trends: {
    /** 验证时间趋势 */
    verificationTimeTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    /** 缓存效率趋势 */
    cacheEfficiencyTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  };
  /** 告警列表 */
  alerts: PerformanceAlert[];
  /** 优化建议 */
  recommendations: string[];
}

export interface TimingData {
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 持续时间（毫秒） */
  duration?: number;
  /** 操作类型 */
  operation: string;
  /** 是否成功 */
  success?: boolean;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private timings: TimingData[] = [];
  private alerts: PerformanceAlert[] = [];
  private thresholds: PerformanceThresholds;
  private maxTimingHistory = 10000; // 保留最近 10000 条记录
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = {
      maxVerificationTime: 100, // 100ms
      maxKeyParseTime: 50, // 50ms
      minCacheHitRate: 0.8, // 80%
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      ...thresholds,
    };
  }

  /**
   * 开始计时
   */
  startTiming(operation: string, metadata?: Record<string, any>): string {
    const timingId = `${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.timings.push({
      startTime: performance.now(),
      operation,
      metadata,
    });

    return timingId;
  }

  /**
   * 结束计时
   */
  endTiming(operation: string, success: boolean = true, metadata?: Record<string, any>): number {
    const now = performance.now();
    
    // 找到最近的匹配操作
    const timingIndex = this.timings.findIndex(t => 
      t.operation === operation && !t.endTime
    );

    if (timingIndex === -1) {
      console.warn(`No active timing found for operation: ${operation}`);
      return 0;
    }

    const timing = this.timings[timingIndex];
    timing.endTime = now;
    timing.duration = now - timing.startTime;
    timing.success = success;
    
    if (metadata) {
      timing.metadata = { ...timing.metadata, ...metadata };
    }

    // 检查性能阈值
    this.checkThresholds(timing);

    // 清理旧记录
    this.cleanupTimings();

    return timing.duration;
  }

  /**
   * 记录单次操作时间
   */
  recordTiming(operation: string, duration: number, success: boolean = true, metadata?: Record<string, any>): void {
    const now = performance.now();
    
    const timing: TimingData = {
      startTime: now - duration,
      endTime: now,
      duration,
      operation,
      success,
      metadata,
    };

    this.timings.push(timing);
    this.checkThresholds(timing);
    this.cleanupTimings();
  }

  /**
   * 获取操作统计信息
   */
  getOperationStats(operation: string, timeWindowMs: number = 60000): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    successRate: number;
  } {
    const cutoffTime = performance.now() - timeWindowMs;
    const relevantTimings = this.timings.filter(t => 
      t.operation === operation && 
      t.endTime && 
      t.endTime >= cutoffTime &&
      t.duration !== undefined
    );

    if (relevantTimings.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        successRate: 0,
      };
    }

    const durations = relevantTimings.map(t => t.duration!).sort((a, b) => a - b);
    const successCount = relevantTimings.filter(t => t.success).length;

    return {
      count: relevantTimings.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      successRate: successCount / relevantTimings.length,
    };
  }

  /**
   * 生成性能报告
   */
  generateReport(timeWindowMs: number = 300000): PerformanceReport {
    const verificationStats = this.getOperationStats('signature_verification', timeWindowMs);
    const keyParseStats = this.getOperationStats('key_parse', timeWindowMs);
    
    // 计算整体性能评分
    const overallScore = this.calculateOverallScore(verificationStats, keyParseStats);
    
    // 分析趋势
    const trends = this.analyzeTrends(timeWindowMs);
    
    // 生成优化建议
    const recommendations = this.generateRecommendations(verificationStats, keyParseStats);

    return {
      timestamp: new Date(),
      overallScore,
      metrics: {
        avgVerificationTime: verificationStats.avgDuration,
        p95VerificationTime: verificationStats.p95Duration,
        cacheHitRate: this.calculateCacheHitRate(timeWindowMs),
        memoryUsage: this.estimateMemoryUsage(),
        requestsPerSecond: this.calculateRequestsPerSecond(timeWindowMs),
      },
      trends,
      alerts: [...this.alerts],
      recommendations,
    };
  }

  /**
   * 添加告警回调
   */
  onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 清除告警
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * 获取最近的告警
   */
  getRecentAlerts(count: number = 10): PerformanceAlert[] {
    return this.alerts.slice(-count);
  }

  /**
   * 重置监控数据
   */
  reset(): void {
    this.timings = [];
    this.alerts = [];
  }

  /**
   * 检查性能阈值
   */
  private checkThresholds(timing: TimingData): void {
    if (!timing.duration) return;

    const alerts: PerformanceAlert[] = [];

    // 检查验证时间
    if (timing.operation === 'signature_verification' && 
        timing.duration > this.thresholds.maxVerificationTime) {
      alerts.push({
        type: 'SLOW_VERIFICATION',
        level: timing.duration > this.thresholds.maxVerificationTime * 2 ? 'CRITICAL' : 'WARNING',
        message: `Signature verification took ${timing.duration.toFixed(2)}ms, exceeding threshold of ${this.thresholds.maxVerificationTime}ms`,
        currentValue: timing.duration,
        threshold: this.thresholds.maxVerificationTime,
        timestamp: new Date(),
        metadata: timing.metadata,
      });
    }

    // 检查密钥解析时间
    if (timing.operation === 'key_parse' && 
        timing.duration > this.thresholds.maxKeyParseTime) {
      alerts.push({
        type: 'SLOW_KEY_PARSE',
        level: timing.duration > this.thresholds.maxKeyParseTime * 2 ? 'CRITICAL' : 'WARNING',
        message: `Key parsing took ${timing.duration.toFixed(2)}ms, exceeding threshold of ${this.thresholds.maxKeyParseTime}ms`,
        currentValue: timing.duration,
        threshold: this.thresholds.maxKeyParseTime,
        timestamp: new Date(),
        metadata: timing.metadata,
      });
    }

    // 触发告警回调
    alerts.forEach(alert => {
      this.alerts.push(alert);
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          console.error('Error in alert callback:', error);
        }
      });
    });
  }

  /**
   * 清理旧的计时记录
   */
  private cleanupTimings(): void {
    if (this.timings.length > this.maxTimingHistory) {
      this.timings = this.timings.slice(-this.maxTimingHistory);
    }
  }

  /**
   * 计算整体性能评分
   */
  private calculateOverallScore(verificationStats: any, keyParseStats: any): number {
    let score = 100;

    // 验证时间评分 (40% 权重)
    if (verificationStats.avgDuration > this.thresholds.maxVerificationTime) {
      const penalty = Math.min(40, (verificationStats.avgDuration / this.thresholds.maxVerificationTime - 1) * 40);
      score -= penalty;
    }

    // 密钥解析时间评分 (20% 权重)
    if (keyParseStats.avgDuration > this.thresholds.maxKeyParseTime) {
      const penalty = Math.min(20, (keyParseStats.avgDuration / this.thresholds.maxKeyParseTime - 1) * 20);
      score -= penalty;
    }

    // 缓存命中率评分 (30% 权重)
    const cacheHitRate = this.calculateCacheHitRate();
    if (cacheHitRate < this.thresholds.minCacheHitRate) {
      const penalty = (this.thresholds.minCacheHitRate - cacheHitRate) * 30;
      score -= penalty;
    }

    // 成功率评分 (10% 权重)
    const avgSuccessRate = (verificationStats.successRate + keyParseStats.successRate) / 2;
    if (avgSuccessRate < 1.0) {
      score -= (1.0 - avgSuccessRate) * 10;
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * 分析性能趋势
   */
  private analyzeTrends(timeWindowMs: number): {
    verificationTimeTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    cacheEfficiencyTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  } {
    // 简化的趋势分析 - 比较前半段和后半段的性能
    const halfWindow = timeWindowMs / 2;
    const cutoffTime = performance.now() - timeWindowMs;
    const midTime = cutoffTime + halfWindow;

    const firstHalf = this.getOperationStats('signature_verification', halfWindow);
    const secondHalf = this.timings.filter(t => 
      t.operation === 'signature_verification' && 
      t.endTime && 
      t.endTime >= midTime
    );

    let verificationTimeTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING' = 'STABLE';
    if (secondHalf.length > 0) {
      const secondHalfAvg = secondHalf.reduce((sum, t) => sum + (t.duration || 0), 0) / secondHalf.length;
      const diff = (secondHalfAvg - firstHalf.avgDuration) / firstHalf.avgDuration;
      
      if (diff > 0.1) verificationTimeTrend = 'DEGRADING';
      else if (diff < -0.1) verificationTimeTrend = 'IMPROVING';
    }

    return {
      verificationTimeTrend,
      cacheEfficiencyTrend: 'STABLE', // 简化实现
    };
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(verificationStats: any, keyParseStats: any): string[] {
    const recommendations: string[] = [];

    if (verificationStats.avgDuration > this.thresholds.maxVerificationTime) {
      recommendations.push('Consider enabling public key caching to reduce verification time');
      recommendations.push('Review signature algorithms - ECDSA is typically faster than RSA');
    }

    if (keyParseStats.avgDuration > this.thresholds.maxKeyParseTime) {
      recommendations.push('Enable PEM string caching to reduce key parsing overhead');
    }

    const cacheHitRate = this.calculateCacheHitRate();
    if (cacheHitRate < this.thresholds.minCacheHitRate) {
      recommendations.push('Increase cache size or TTL to improve cache hit rate');
      recommendations.push('Consider cache warming for frequently used keys');
    }

    if (verificationStats.successRate < 0.95) {
      recommendations.push('High failure rate detected - review signature validation logic');
    }

    return recommendations;
  }

  /**
   * 计算缓存命中率
   */
  private calculateCacheHitRate(timeWindowMs: number = 60000): number {
    // 这里需要与实际的缓存系统集成
    // 暂时返回模拟值
    return 0.85;
  }

  /**
   * 估算内存使用量
   */
  private estimateMemoryUsage(): number {
    // 估算计时数据的内存使用
    const timingMemory = this.timings.length * 200; // 每条记录约 200 字节
    const alertMemory = this.alerts.length * 300; // 每个告警约 300 字节
    
    return timingMemory + alertMemory;
  }

  /**
   * 计算每秒请求数
   */
  private calculateRequestsPerSecond(timeWindowMs: number): number {
    const cutoffTime = performance.now() - timeWindowMs;
    const recentVerifications = this.timings.filter(t => 
      t.operation === 'signature_verification' && 
      t.endTime && 
      t.endTime >= cutoffTime
    );

    return (recentVerifications.length / timeWindowMs) * 1000;
  }
}

/**
 * 全局性能监控实例
 */
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * 性能监控装饰器
 */
export function performanceMonitor(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = performance.now();
      let success = true;
      let error: any = null;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err;
        throw err;
      } finally {
        const duration = performance.now() - startTime;
        globalPerformanceMonitor.recordTiming(operation, duration, success, {
          args: args.length,
          error: error?.message,
        });
      }
    };

    return descriptor;
  };
}