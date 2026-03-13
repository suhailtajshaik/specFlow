import jwt from 'jsonwebtoken'
import { updateTrace } from './trace.ts'

export interface AuthResult {
  authenticated: boolean
  userId?: string
  error?: string
}

export async function validateAuth(c: any, requiresAuth: boolean): Promise<AuthResult> {
  const start = Date.now()
  
  try {
    if (!requiresAuth) {
      updateTrace(c, 'auth', Date.now() - start)
      return { authenticated: true }
    }

    const authHeader = c.req.header('Authorization')
    const apiKeyHeader = c.req.header('X-API-Key')

    // Try JWT first
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const jwtSecret = Bun.env.JWT_SECRET
        if (!jwtSecret) {
          return { authenticated: false, error: 'JWT_SECRET not configured' }
        }

        const decoded = jwt.verify(token, jwtSecret) as any
        updateTrace(c, 'auth', Date.now() - start)
        return { authenticated: true, userId: decoded.sub || decoded.userId }
      } catch (error) {
        return { authenticated: false, error: 'Invalid JWT token' }
      }
    }

    // Try API key
    if (apiKeyHeader) {
      const validApiKeys = Bun.env.API_KEYS?.split(',') || []
      if (validApiKeys.includes(apiKeyHeader)) {
        updateTrace(c, 'auth', Date.now() - start)
        return { authenticated: true }
      }
      return { authenticated: false, error: 'Invalid API key' }
    }

    return { authenticated: false, error: 'No authentication provided' }
  } catch (error) {
    return { 
      authenticated: false, 
      error: error instanceof Error ? error.message : 'Authentication error' 
    }
  } finally {
    updateTrace(c, 'auth', Date.now() - start)
  }
}

export function parseBooleanFromFrontmatter(value: any): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1'
  }
  return false
}