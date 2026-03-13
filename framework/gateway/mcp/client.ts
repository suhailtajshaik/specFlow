import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

export interface MCPTool {
  name: string
  description: string
  inputSchema?: any
  server: string
}

export interface MCPToolResult {
  success: boolean
  result?: any
  error?: string
}

class MCPClient {
  private servers = new Map<string, { client: Client; transport: any }>()
  private tools = new Map<string, MCPTool>()
  private initialized = false

  public async initialize(): Promise<void> {
    if (this.initialized) return

    const serverConfigs = [
      { name: 'postgres', url: 'http://localhost:3001' },
      { name: 'http-api', url: 'http://localhost:3002' },
      { name: 'email', url: 'http://localhost:3003' },
      { name: 'auth', url: 'http://localhost:3004' },
      { name: 'cache', url: 'http://localhost:3005' }
    ]

    for (const config of serverConfigs) {
      try {
        await this.connectToServer(config.name, config.url)
      } catch (error) {
        console.warn(`Failed to connect to MCP server ${config.name}:`, error)
      }
    }

    this.initialized = true
  }

  private async connectToServer(name: string, url: string): Promise<void> {
    try {
      // Use HTTP transport for MCP servers
      const transport = new StdioClientTransport({
        command: 'curl',
        args: ['-X', 'POST', '-H', 'Content-Type: application/json', url]
      })

      const client = new Client(
        { name: `gateway-${name}`, version: '1.0.0' },
        { capabilities: {} }
      )

      await client.connect(transport)

      // Get available tools
      const toolsResult = await client.listTools()
      
      for (const tool of toolsResult.tools) {
        this.tools.set(tool.name, {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          server: name
        })
      }

      this.servers.set(name, { client, transport })
      console.log(`Connected to MCP server: ${name}`)

    } catch (error) {
      console.error(`Failed to connect to MCP server ${name}:`, error)
      throw error
    }
  }

  public async getAvailableTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    return Array.from(this.tools.values())
  }

  public async callTool(name: string, args: any): Promise<MCPToolResult> {
    try {
      const tool = this.tools.get(name)
      if (!tool) {
        return {
          success: false,
          error: `Tool '${name}' not found`
        }
      }

      const serverConnection = this.servers.get(tool.server)
      if (!serverConnection) {
        return {
          success: false,
          error: `Server '${tool.server}' not connected`
        }
      }

      const result = await serverConnection.client.callTool({
        name,
        arguments: args
      })

      return {
        success: true,
        result: result.content
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      }
    }
  }

  public async executeToolCalls(toolCalls: Array<{ name: string; args: any }>): Promise<Array<MCPToolResult>> {
    const results = []
    
    for (const call of toolCalls) {
      const result = await this.callTool(call.name, call.args)
      results.push(result)
      
      // Small delay between tool calls to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    return results
  }

  public async disconnect(): Promise<void> {
    for (const [name, { client, transport }] of this.servers) {
      try {
        await client.close()
        console.log(`Disconnected from MCP server: ${name}`)
      } catch (error) {
        console.error(`Error disconnecting from ${name}:`, error)
      }
    }
    
    this.servers.clear()
    this.tools.clear()
    this.initialized = false
  }

  public isHealthy(): boolean {
    return this.initialized && this.servers.size > 0
  }
}

export const mcpClient = new MCPClient()