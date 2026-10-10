import { RateLimitError } from "./errors";

/**
 * Rate limiting is behind a small interface so the in-memory fixed-window
 * limiter used in development can be swapped for Redis/Upstash in production
 * (multiple instances need a shared store).
 */
export interface RateLimiter {
  hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (this.buckets.size > 10_000) this.sweep(now);
    return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
  }

  private sweep(now: number) {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

const globalForLimiter = globalThis as unknown as { __rateLimiter?: RateLimiter };
export const rateLimiter: RateLimiter = globalForLimiter.__rateLimiter ?? new MemoryRateLimiter();
globalForLimiter.__rateLimiter = rateLimiter;

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  publicApi: { limit: 120, windowMs: 60_000 },
  webhook: { limit: 300, windowMs: 60_000 },
  demoRequest: { limit: 5, windowMs: 60 * 60_000 },
  demoAvailability: { limit: 60, windowMs: 60_000 },
} as const;

export async function enforceRateLimit(key: string, rule: { limit: number; windowMs: number }) {
  if (process.env.NODE_ENV === "test") return;
  const result = await rateLimiter.hit(key, rule.limit, rule.windowMs);
  if (!result.allowed) throw new RateLimitError();
}
