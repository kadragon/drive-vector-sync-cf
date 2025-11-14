/**
 * Rate limiting for API calls
 *
 * Trace:
 *   task_id: TASK-023
 */

export interface RateLimitConfig {
  maxRequestsPerWindow: number;
  windowMs: number;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(private config: RateLimitConfig) {}

  /**
   * Wait if necessary to comply with rate limit
   */
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean up old timestamps
    this.timestamps = this.timestamps.filter(t => t > windowStart);

    // Check if we've hit the limit
    if (this.timestamps.length >= this.config.maxRequestsPerWindow) {
      const oldestTimestamp = this.timestamps[0];
      const waitTime = this.config.windowMs - (now - oldestTimestamp);

      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Clean up again after waiting
        const newNow = Date.now();
        const newWindowStart = newNow - this.config.windowMs;
        this.timestamps = this.timestamps.filter(t => t > newWindowStart);
      }
    }

    // Record this request
    this.timestamps.push(Date.now());
  }

  /**
   * Get current usage percentage
   */
  getUsagePercentage(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean up old timestamps
    this.timestamps = this.timestamps.filter(t => t > windowStart);

    return (this.timestamps.length / this.config.maxRequestsPerWindow) * 100;
  }

  /**
   * Get remaining requests in current window
   */
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean up old timestamps
    this.timestamps = this.timestamps.filter(t => t > windowStart);

    return Math.max(0, this.config.maxRequestsPerWindow - this.timestamps.length);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Rate limiter factory for common API services
 */
export class RateLimiterFactory {
  /**
   * Create rate limiter for OpenAI API
   * Limit: 5000 requests per minute for tier 2
   */
  static createOpenAILimiter(): RateLimiter {
    return new RateLimiter({
      maxRequestsPerWindow: 5000,
      windowMs: 60 * 1000, // 1 minute
    });
  }

  /**
   * Create rate limiter for Google Drive API
   * Limit: 1000 queries per 100 seconds per user
   */
  static createDriveLimiter(): RateLimiter {
    return new RateLimiter({
      maxRequestsPerWindow: 900, // Conservative limit (90% of max)
      windowMs: 100 * 1000, // 100 seconds
    });
  }

  /**
   * Create rate limiter for Qdrant API
   * Custom limit based on your plan
   */
  static createQdrantLimiter(maxRequestsPerMinute: number = 1000): RateLimiter {
    return new RateLimiter({
      maxRequestsPerWindow: maxRequestsPerMinute,
      windowMs: 60 * 1000, // 1 minute
    });
  }
}
