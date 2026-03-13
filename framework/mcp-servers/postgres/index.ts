import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'

// Connection pool
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: Bun.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/app',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
    
    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Database pool error:', err)
    })
  }
  return pool
}

// Validation schemas
const FindUserSchema = z.object({
  id: z.number().optional(),
  email: z.string().email().optional(),
  username: z.string().optional()
}).refine(data => data.id || data.email || data.username, {
  message: "At least one of id, email, or username must be provided"
})

const CreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password_hash: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional()
})

const UpdateUserSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).optional(),
  password_hash: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional()
})

const DeleteUserSchema = z.object({
  id: z.number()
})

const QuerySchema = z.object({
  sql: z.string(),
  params: z.array(z.any()).optional().default([])
})

// MCP Server
const server = new Server(
  {
    name: 'postgres-mcp-server',
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
        name: 'db_find_user',
        description: 'Find a user by ID, email, or username',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'User ID' },
            email: { type: 'string', description: 'User email' },
            username: { type: 'string', description: 'Username' }
          },
          oneOf: [
            { required: ['id'] },
            { required: ['email'] },
            { required: ['username'] }
          ]
        }
      },
      {
        name: 'db_create_user',
        description: 'Create a new user',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            username: { type: 'string', minLength: 3, maxLength: 50 },
            password_hash: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' }
          },
          required: ['email', 'username', 'password_hash']
        }
      },
      {
        name: 'db_update_user',
        description: 'Update an existing user',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            email: { type: 'string', format: 'email' },
            username: { type: 'string', minLength: 3, maxLength: 50 },
            password_hash: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' }
          },
          required: ['id']
        }
      },
      {
        name: 'db_delete_user',
        description: 'Delete a user by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number' }
          },
          required: ['id']
        }
      },
      {
        name: 'db_query',
        description: 'Execute a read-only SQL query (SELECT only)',
        inputSchema: {
          type: 'object',
          properties: {
            sql: { type: 'string', description: 'SQL SELECT query' },
            params: { type: 'array', items: { type: 'any' }, description: 'Query parameters' }
          },
          required: ['sql']
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
      case 'db_find_user': {
        const validated = FindUserSchema.parse(args)
        return await findUser(validated)
      }
      
      case 'db_create_user': {
        const validated = CreateUserSchema.parse(args)
        return await createUser(validated)
      }
      
      case 'db_update_user': {
        const validated = UpdateUserSchema.parse(args)
        return await updateUser(validated)
      }
      
      case 'db_delete_user': {
        const validated = DeleteUserSchema.parse(args)
        return await deleteUser(validated)
      }
      
      case 'db_query': {
        const validated = QuerySchema.parse(args)
        return await executeQuery(validated)
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
async function findUser(params: z.infer<typeof FindUserSchema>) {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    let query = 'SELECT id, email, username, first_name, last_name, created_at, updated_at FROM users WHERE '
    let values: any[] = []
    
    if (params.id) {
      query += 'id = $1'
      values = [params.id]
    } else if (params.email) {
      query += 'email = $1'
      values = [params.email]
    } else if (params.username) {
      query += 'username = $1'
      values = [params.username]
    }
    
    const result = await client.query(query, values)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            user: result.rows[0] || null,
            found: result.rows.length > 0
          })
        }
      ]
    }
  } finally {
    client.release()
  }
}

async function createUser(params: z.infer<typeof CreateUserSchema>) {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    const query = `
      INSERT INTO users (email, username, password_hash, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, username, first_name, last_name, created_at
    `
    
    const values = [
      params.email,
      params.username,
      params.password_hash,
      params.first_name || null,
      params.last_name || null
    ]
    
    const result = await client.query(query, values)
    
    await client.query('COMMIT')
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            user: result.rows[0]
          })
        }
      ]
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function updateUser(params: z.infer<typeof UpdateUserSchema>) {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    // Build dynamic UPDATE query
    const setParts: string[] = []
    const values: any[] = []
    let paramIndex = 1
    
    if (params.email !== undefined) {
      setParts.push(`email = $${paramIndex++}`)
      values.push(params.email)
    }
    if (params.username !== undefined) {
      setParts.push(`username = $${paramIndex++}`)
      values.push(params.username)
    }
    if (params.password_hash !== undefined) {
      setParts.push(`password_hash = $${paramIndex++}`)
      values.push(params.password_hash)
    }
    if (params.first_name !== undefined) {
      setParts.push(`first_name = $${paramIndex++}`)
      values.push(params.first_name)
    }
    if (params.last_name !== undefined) {
      setParts.push(`last_name = $${paramIndex++}`)
      values.push(params.last_name)
    }
    
    if (setParts.length === 0) {
      throw new Error('No fields to update')
    }
    
    setParts.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(params.id)
    
    const query = `
      UPDATE users 
      SET ${setParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, username, first_name, last_name, updated_at
    `
    
    const result = await client.query(query, values)
    
    if (result.rows.length === 0) {
      throw new Error(`User with ID ${params.id} not found`)
    }
    
    await client.query('COMMIT')
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            user: result.rows[0]
          })
        }
      ]
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function deleteUser(params: z.infer<typeof DeleteUserSchema>) {
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    const result = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [params.id]
    )
    
    if (result.rows.length === 0) {
      throw new Error(`User with ID ${params.id} not found`)
    }
    
    await client.query('COMMIT')
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            deleted_id: params.id
          })
        }
      ]
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function executeQuery(params: z.infer<typeof QuerySchema>) {
  // Security: Only allow SELECT queries
  const trimmedSql = params.sql.trim().toLowerCase()
  if (!trimmedSql.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed')
  }
  
  // Additional security checks
  const forbiddenKeywords = ['insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate']
  for (const keyword of forbiddenKeywords) {
    if (trimmedSql.includes(keyword)) {
      throw new Error(`Forbidden keyword '${keyword}' in query`)
    }
  }
  
  const pool = getPool()
  const client = await pool.connect()
  
  try {
    const result = await client.query(params.sql, params.params)
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            rows: result.rows,
            rowCount: result.rowCount
          })
        }
      ]
    }
  } finally {
    client.release()
  }
}

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  console.log('PostgreSQL MCP Server running on stdio')
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down PostgreSQL MCP Server...')
  if (pool) {
    await pool.end()
  }
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down PostgreSQL MCP Server...')
  if (pool) {
    await pool.end()
  }
  process.exit(0)
})

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}