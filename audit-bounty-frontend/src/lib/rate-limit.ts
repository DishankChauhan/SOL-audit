/**
 * Simple rate limiting implementation for Next.js API Routes
 * Adapted from next-api-rate-limit package
 */

export interface RateLimitOptions {
  interval: number;
  uniqueTokenPerInterval: number;
}

class RateLimit {
  private tokenCache: Map<string, number>;
  private interval: number;
  
  constructor(options: RateLimitOptions) {
    this.tokenCache = new Map();
    this.interval = options.interval;
    
    // Cleanup old tokens after interval
    setInterval(() => {
      this.tokenCache = new Map();
    }, options.interval);
  }
  
  async check(key: string, limit: number): Promise<void> {
    // Get current count for this key or initialize to 0
    const tokenCount = this.tokenCache.get(key) || 0;
    
    // If already at limit, throw error
    if (tokenCount >= limit) {
      throw new Error('Rate limit exceeded');
    }
    
    // Increment count
    this.tokenCache.set(key, tokenCount + 1);
    
    return Promise.resolve();
  }
}

export function rateLimit(options: RateLimitOptions) {
  return new RateLimit(options);
} 