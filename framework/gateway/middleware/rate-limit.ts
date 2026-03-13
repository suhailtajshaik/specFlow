import Redis from 'ioredis'

interface RateLimitConfig {
  requests: number
  window: number // seconds
  scope: 'ip' | 'user'
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  error?: string
}

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = Bun.env.REDIS_URL || 'redis://localhost:6379'
    redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
    })
  }
  return redis
}

export function parseRateLimit(rateLimitStr?: string): RateLimitConfig | null {
  if (!rateLimitStr) return null
  
  // Format: "5/hour/ip" or "100/minute/user"
  const match = rateLimitStr.match(/^(\d+)\/(second|minute|hour|day)\/(ip|user)$/i)
  if (!match) return null

  const [, requestsStr, period, scope] = match
  const requests = parseInt(requestsStr, 10)
  
  let window: number
  switch (period.toLowerCase()) {
    case 'second':
      window = 1
      break
    case 'minute':
      window = 60
      break
    case 'hour':
      window = 3600
      break
    case 'day':
      window = 86400
      break
    default:
      return null
  }

  return {
    requests,
    window,
    scope: scope as 'ip' | 'user'
  }
}

export async function checkRateLimit(
  c: any,
  rateLimitConfig: RateLimitConfig | null,
  userId?: string
): Promise<RateLimitResult> {
  if (!rateLimitConfig) {
    return { allowed: true, remaining: 1000, resetTime: Date.now() + 3600000 }
  }

  try {
    const redis = getRedis()
    
    // Determine key
    let key: string
    if (rateLimitConfig.scope === 'user' && userId) {
      key = `ratelimit:user:${userId}`
    } else {
      // Fall back to IP for user scope when no userId
      const clientIP = getClientIP(c)
      key = `ratelimit:ip:${clientIP}`
    }

    // Use sliding window with Redis
    const now = Date.now()
    const windowStart = now - (rateLimitConfig.window * 1000)

    // Remove old entries and count current
    await redis.zremrangebyscore(key, 0, windowStart)
    const current = await redis.zcard(key)

    if (current >= rateLimitConfig.requests) {
      const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES')
      const resetTime = oldestEntry.length > 0 
        ? parseInt(oldestEntry[1] as string) + (rateLimitConfig.window * 1000)
        : now + (rateLimitConfig.window * 1000)

      return {
        allowed: false,
        remaining: 0,
        resetTime
      }
    }

    // Add current request
    await redis.zadd(key, now, `${now}-${Math.random()}`)
    await redis.expire(key, rateLimitConfig.window * 2) // TTL buffer

    return {
      allowed: true,
      remaining: rateLimitConfig.requests - current - 1,
      resetTime: now + (rateLimitConfig.window * 1000)
    }

  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open - allow request if Redis is down
    return { 
      allowed: true, 
      remaining: 1,
      resetTime: Date.now() + 3600000,
      error: error instanceof Error ? error.message : 'Rate limit error'
    }
  }
}

function getClientIP(c: any): string {
  // Check various headers for the real IP
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
         c.req.header('x-real-ip') ||
         c.req.header('cf-connecting-ip') ||
         c.env?.clientIP ||
         '127.0.0.1'
}