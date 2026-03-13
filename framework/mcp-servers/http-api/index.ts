import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

// Validation schemas
const HttpGetSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  timeout: z.number().min(1000).max(30000).optional().default(10000)
})

const HttpPostSchema = z.object({
  url: z.string().url(),
  body: z.any().optional(),
  headers: z.record(z.string()).optional().default({}),
  timeout: z.number().min(1000).max(30000).optional().default(10000)
})

const HttpPutSchema = z.object({
  url: z.string().url(),
  body: z.any().optional(),
  headers: z.record(z.string()).optional().default({}),
  timeout: z.number().min(1000).max(30000).optional().default(10000)
})

const HttpDeleteSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  timeout: z.number().min(1000).max(30000).optional().default(10000)
})

// MCP Server
const server = new Server(
  {
    name: 'http-api-mcp-server',
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
        name: 'http_get',
        description: 'Make an HTTP GET request',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'url', description: 'The URL to request' },
            headers: { 
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Optional HTTP headers'
            },
            timeout: { 
              type: 'number', 
              minimum: 1000, 
              maximum: 30000,
              description: 'Request timeout in milliseconds (default: 10000)'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'http_post',
        description: 'Make an HTTP POST request',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'url', description: 'The URL to request' },
            body: { description: 'Request body (will be JSON stringified if object)' },
            headers: { 
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Optional HTTP headers'
            },
            timeout: { 
              type: 'number', 
              minimum: 1000, 
              maximum: 30000,
              description: 'Request timeout in milliseconds (default: 10000)'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'http_put',
        description: 'Make an HTTP PUT request',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'url', description: 'The URL to request' },
            body: { description: 'Request body (will be JSON stringified if object)' },
            headers: { 
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Optional HTTP headers'
            },
            timeout: { 
              type: 'number', 
              minimum: 1000, 
              maximum: 30000,
              description: 'Request timeout in milliseconds (default: 10000)'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'http_delete',
        description: 'Make an HTTP DELETE request',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'url', description: 'The URL to request' },
            headers: { 
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Optional HTTP headers'
            },
            timeout: { 
              type: 'number', 
              minimum: 1000, 
              maximum: 30000,
              description: 'Request timeout in milliseconds (default: 10000)'
            }
          },
          required: ['url']
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
      case 'http_get': {
        const validated = HttpGetSchema.parse(args)
        return await httpGet(validated)
      }
      
      case 'http_post': {
        const validated = HttpPostSchema.parse(args)
        return await httpPost(validated)
      }
      
      case 'http_put': {
        const validated = HttpPutSchema.parse(args)
        return await httpPut(validated)
      }
      
      case 'http_delete': {
        const validated = HttpDeleteSchema.parse(args)
        return await httpDelete(validated)
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
async function httpGet(params: z.infer<typeof HttpGetSchema>) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), params.timeout)

    const response = await fetch(params.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'LLM-Backend-Framework/1.0.0',
        ...params.headers
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    let responseData: any = responseText

    // Try to parse as JSON
    try {
      responseData = JSON.parse(responseText)
    } catch {
      // Keep as text if not valid JSON
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            url: response.url
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
            error: error instanceof Error ? error.message : 'HTTP GET failed'
          })
        }
      ]
    }
  }
}

async function httpPost(params: z.infer<typeof HttpPostSchema>) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), params.timeout)

    // Prepare body
    let body: string | undefined
    let contentType = params.headers['content-type'] || params.headers['Content-Type']

    if (params.body !== undefined) {
      if (typeof params.body === 'string') {
        body = params.body
        if (!contentType) contentType = 'text/plain'
      } else {
        body = JSON.stringify(params.body)
        if (!contentType) contentType = 'application/json'
      }
    }

    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'User-Agent': 'LLM-Backend-Framework/1.0.0',
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...params.headers
      },
      body,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    let responseData: any = responseText

    // Try to parse as JSON
    try {
      responseData = JSON.parse(responseText)
    } catch {
      // Keep as text if not valid JSON
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            url: response.url
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
            error: error instanceof Error ? error.message : 'HTTP POST failed'
          })
        }
      ]
    }
  }
}

async function httpPut(params: z.infer<typeof HttpPutSchema>) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), params.timeout)

    // Prepare body
    let body: string | undefined
    let contentType = params.headers['content-type'] || params.headers['Content-Type']

    if (params.body !== undefined) {
      if (typeof params.body === 'string') {
        body = params.body
        if (!contentType) contentType = 'text/plain'
      } else {
        body = JSON.stringify(params.body)
        if (!contentType) contentType = 'application/json'
      }
    }

    const response = await fetch(params.url, {
      method: 'PUT',
      headers: {
        'User-Agent': 'LLM-Backend-Framework/1.0.0',
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...params.headers
      },
      body,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    let responseData: any = responseText

    // Try to parse as JSON
    try {
      responseData = JSON.parse(responseText)
    } catch {
      // Keep as text if not valid JSON
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            url: response.url
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
            error: error instanceof Error ? error.message : 'HTTP PUT failed'
          })
        }
      ]
    }
  }
}

async function httpDelete(params: z.infer<typeof HttpDeleteSchema>) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), params.timeout)

    const response = await fetch(params.url, {
      method: 'DELETE',
      headers: {
        'User-Agent': 'LLM-Backend-Framework/1.0.0',
        ...params.headers
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    let responseData: any = responseText

    // Try to parse as JSON
    try {
      responseData = JSON.parse(responseText)
    } catch {
      // Keep as text if not valid JSON
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
            url: response.url
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
            error: error instanceof Error ? error.message : 'HTTP DELETE failed'
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
  
  console.log('HTTP API MCP Server running on stdio')
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down HTTP API MCP Server...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down HTTP API MCP Server...')
  process.exit(0)
})

if (import.meta.main) {
  main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
  })
}