import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import Redis from 'ioredis'
import { z } from 'zod'

// Redis client
let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = Bun.env.REDIS_URL || 'redis://localhost:6379'
    redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    })
    
    redis.on('error', (err) => {
      console.error('Redis error:', err)
    })
    
    redis.on('connect', () => {
      console.log('Connected to Redis')
    })
  }
  return redis
}

// Validation schemas
const CacheGetSchema = z.object({
  key: z.string().min(1)
})

const CacheSetSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  ttl: z.number().min(1).optional() // TTL in seconds
})

const CacheDeleteSchema = z.object({
  key: z.string().min(1)
})

// MCP Server
const server = new Server(
  {
    name: 'cache-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'cache_get',
        description: 'Get a value from Redis cache',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', minLength: 1, description: 'Cache key' }
          },
          required: ['key']
        }
      },
      {
        name: 'cache_set',
        description: 'Set a value in Redis cache with optional TTL',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', minLength: 1, description: 'Cache key' },
            value: { description: 'Value to cache (will be JSON stringified)' },
            ttl: { 
              type: 'number', 
              minimum: 1,
              description: 'Time to live in seconds (optional)'
            }
          },
          required: ['key', 'value']
        }
      },
      {
        name: 'cache_delete',
        description: 'Delete a key from Redis cache',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', minLength: 1, description: 'Cache key to delete' }
          },
          required: ['key']
        }
      }
    ]
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'cache_get': {
        const validated = CacheGetSchema.parse(args)
        return await cacheGet(validated)
      }
      
      case 'cache_set': {
        const validated = CacheSetSchema.parse(args)
        return await cacheSet(validated)
      }
      
      case 'cache_delete': {
        const validated = CacheDeleteSchema.parse(args)
        return await cacheDelete(validated)
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    }
  }
})

// Tool implementations
async function cacheGet(params: z.infer<typeof CacheGetSchema>) {
  try {
    const redis = getRedis()
    
    const value = await redis.get(params.key)
    
    if (value === null) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              found: false,
              value: null,
              key: params.key
            })
          }
        ]
      }
    }
    
    // Try to parse as JSON, fallback to string
    let parsedValue: any = value
    try {
      parsedValue = JSON.parse(value)
    } catch {
      // Keep as string if not valid JSON
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            found: true,
            value: parsedValue,
            key: params.key
          })
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Cache get failed'
          })
        }
      ]
    }
  }
}

async function cacheSet(params: z.infer<typeof CacheSetSchema>) {
  try {
    const redis = getRedis()
    
    // Serialize value
    let serializedValue: string
    if (typeof params.value === 'string') {
      serializedValue = params.value
    } else {
      serializedValue = JSON.stringify(params.value)
    }
    
    // Set with optional TTL
    if (params.ttl) {
      await redis.setex(params.key, params.ttl, serializedValue)
    } else {
      await redis.set(params.key, serializedValue)
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            key: params.key,
            ttl: params.ttl || null
          })
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Cache set failed'
          })
        }
      ]
    }
  }
}

async function cacheDelete(params: z.infer<typeof CacheDeleteSchema>) {
  try {
    const redis = getRedis()
    
    const deletedCount = await redis.del(params.key)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            deleted: deletedCount > 0,
            key: params.key
          })
        }
      ]
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Cache delete failed'
          })
        }
      ]
    }
  }
}

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  console.log('Cache MCP Server running on stdio')
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down Cache MCP Server...')
  if (redis) {
    await redis.quit()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down Cache MCP Server...')
  if (redis) {
    await redis.quit()
  }
  process.exit(0)
})

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}