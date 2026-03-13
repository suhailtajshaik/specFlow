import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { handleRAGRoute } from './router.ts'
import { traceMiddleware } from './middleware/trace.ts'

const app = new Hono()

// Middleware
app.use(requestId())
app.use(logger())
app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}))
app.use(traceMiddleware)

// Health check
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// Wildcard route - all API requests go through RAG pipeline
app.all('*', handleRAGRoute)

// Start server
const port = Number(Bun.env.PORT) || 3000

console.log(`🚀 Gateway starting on port ${port}`)
console.log(`🔍 LLM Provider: ${Bun.env.LLM_PROVIDER || 'llamacpp'}`)
console.log(`📊 Vector DB: ${Bun.env.QDRANT_URL || 'http://localhost:6333'}`)

export default {
  port,
  fetch: app.fetch,
}