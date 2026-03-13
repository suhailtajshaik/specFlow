import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { z } from 'zod'

// Validation schemas
const HashPasswordSchema = z.object({
  password: z.string().min(1),
  saltRounds: z.number().min(8).max(15).optional().default(12)
})

const VerifyPasswordSchema = z.object({
  password: z.string(),
  hash: z.string()
})

const GenerateJWTSchema = z.object({
  payload: z.record(z.any()),
  secret: z.string().optional(),
  expiresIn: z.string().optional().default('24h'),
  algorithm: z.string().optional().default('HS256')
})

const GenerateTokenSchema = z.object({
  length: z.number().min(16).max(128).optional().default(32),
  encoding: z.enum(['hex', 'base64', 'base64url']).optional().default('hex')
})

// MCP Server
const server = new Server(
  {
    name: 'auth-mcp-server',
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
        name: 'hash_password',
        description: 'Hash a password using bcrypt',
        inputSchema: {
          type: 'object',
          properties: {
            password: { type: 'string', minLength: 1, description: 'Password to hash' },
            saltRounds: { 
              type: 'number', 
              minimum: 8, 
              maximum: 15,
              description: 'Number of salt rounds (default: 12)'
            }
          },
          required: ['password']
        }
      },
      {
        name: 'verify_password',
        description: 'Verify a password against a bcrypt hash',
        inputSchema: {
          type: 'object',
          properties: {
            password: { type: 'string', description: 'Plain text password' },
            hash: { type: 'string', description: 'Bcrypt hash to verify against' }
          },
          required: ['password', 'hash']
        }
      },
      {
        name: 'generate_jwt',
        description: 'Generate a JWT token',
        inputSchema: {
          type: 'object',
          properties: {
            payload: { 
              type: 'object',
              additionalProperties: true,
              description: 'JWT payload data'
            },
            secret: { type: 'string', description: 'JWT secret (optional, uses env JWT_SECRET)' },
            expiresIn: { 
              type: 'string', 
              description: 'Expiration time (e.g., "24h", "7d", "30m")'
            },
            algorithm: { 
              type: 'string',
              description: 'Signing algorithm (default: HS256)'
            }
          },
          required: ['payload']
        }
      },
      {
        name: 'generate_token',
        description: 'Generate a secure random token',
        inputSchema: {
          type: 'object',
          properties: {
            length: { 
              type: 'number', 
              minimum: 16, 
              maximum: 128,
              description: 'Token length in bytes (default: 32)'
            },
            encoding: { 
              type: 'string',
              enum: ['hex', 'base64', 'base64url'],
              description: 'Token encoding (default: hex)'
            }
          }
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
      case 'hash_password': {
        const validated = HashPasswordSchema.parse(args)
        return await hashPassword(validated)
      }
      
      case 'verify_password': {
        const validated = VerifyPasswordSchema.parse(args)
        return await verifyPassword(validated)
      }
      
      case 'generate_jwt': {
        const validated = GenerateJWTSchema.parse(args)
        return await generateJWT(validated)
      }
      
      case 'generate_token': {
        const validated = GenerateTokenSchema.parse(args)
        return await generateToken(validated)
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
async function hashPassword(params: z.infer<typeof HashPasswordSchema>) {
  try {
    const salt = await bcrypt.genSalt(params.saltRounds)
    const hash = await bcrypt.hash(params.password, salt)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            hash,
            saltRounds: params.saltRounds
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
            error: error instanceof Error ? error.message : 'Password hashing failed'
          })
        }
      ]
    }
  }
}

async function verifyPassword(params: z.infer<typeof VerifyPasswordSchema>) {
  try {
    const isValid = await bcrypt.compare(params.password, params.hash)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            isValid
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
            error: error instanceof Error ? error.message : 'Password verification failed'
          })
        }
      ]
    }
  }
}

async function generateJWT(params: z.infer<typeof GenerateJWTSchema>) {
  try {
    const secret = params.secret || Bun.env.JWT_SECRET
    
    if (!secret) {
      throw new Error('JWT secret is required (provide secret parameter or set JWT_SECRET environment variable)')
    }

    const token = jwt.sign(
      params.payload,
      secret,
      {
        expiresIn: params.expiresIn,
        algorithm: params.algorithm as jwt.Algorithm
      }
    )
    
    // Decode to get expiration info
    const decoded = jwt.decode(token) as any
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            token,
            expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
            issuedAt: decoded?.iat ? new Date(decoded.iat * 1000).toISOString() : null
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
            error: error instanceof Error ? error.message : 'JWT generation failed'
          })
        }
      ]
    }
  }
}

async function generateToken(params: z.infer<typeof GenerateTokenSchema>) {
  try {
    const buffer = randomBytes(params.length)
    
    let token: string
    switch (params.encoding) {
      case 'base64':
        token = buffer.toString('base64')
        break
      case 'base64url':
        token = buffer.toString('base64url')
        break
      case 'hex':
      default:
        token = buffer.toString('hex')
        break
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            token,
            length: params.length,
            encoding: params.encoding
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
            error: error instanceof Error ? error.message : 'Token generation failed'
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
  
  console.log('Auth MCP Server running on stdio')
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Auth MCP Server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down Auth MCP Server...')
  process.exit(0)
})

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}