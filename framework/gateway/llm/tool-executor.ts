import { mcpClient, type MCPToolResult } from '../mcp/client.ts'

export interface ToolCall {
  name: string
  args: Record<string, any>
  id?: string
}

export interface ToolExecutionResult {
  success: boolean
  results: Array<{
    toolCall: ToolCall
    result: MCPToolResult
  }>
  error?: string
}

export class ToolExecutor {
  public async executeParsedToolCalls(toolCallsJson: string): Promise<ToolExecutionResult> {
    try {
      const toolCalls = JSON.parse(toolCallsJson) as ToolCall[]
      return await this.executeToolCalls(toolCalls)
    } catch (error) {
      return {
        success: false,
        results: [],
        error: `Failed to parse tool calls JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  public async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolExecutionResult> {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return {
        success: true,
        results: []
      }
    }

    // Validate tool calls structure
    for (const [index, call] of toolCalls.entries()) {
      if (!call.name || typeof call.name !== 'string') {
        return {
          success: false,
          results: [],
          error: `Invalid tool call at index ${index}: missing or invalid 'name' field`
        }
      }
      if (!call.args || typeof call.args !== 'object') {
        return {
          success: false,
          results: [],
          error: `Invalid tool call at index ${index}: missing or invalid 'args' field`
        }
      }
    }

    const results: Array<{ toolCall: ToolCall; result: MCPToolResult }> = []
    
    for (const toolCall of toolCalls) {
      try {
        // Execute tool via MCP client
        const result = await mcpClient.callTool(toolCall.name, toolCall.args)
        
        results.push({
          toolCall,
          result
        })

        // If a tool call failed, we might want to continue or stop depending on the error
        if (!result.success) {
          console.warn(`Tool call ${toolCall.name} failed:`, result.error)
          // Continue with other tool calls for now
        }

        // Small delay between tool calls to be respectful
        if (toolCalls.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        
        results.push({
          toolCall,
          result: {
            success: false,
            error: `Tool execution exception: ${errorMsg}`
          }
        })
      }
    }

    // Consider overall success - if all tools succeeded or if we have at least one success
    const hasSuccesses = results.some(r => r.result.success)
    const allFailed = results.length > 0 && results.every(r => !r.result.success)

    return {
      success: !allFailed,
      results,
      error: allFailed ? 'All tool calls failed' : undefined
    }
  }

  public formatToolResultsForLLM(executionResult: ToolExecutionResult): string {
    if (!executionResult.success || executionResult.results.length === 0) {
      return executionResult.error || 'No tool results available'
    }

    const formattedResults = executionResult.results.map(({ toolCall, result }) => {
      const status = result.success ? '✅ SUCCESS' : '❌ FAILED'
      
      let output = `${status} - ${toolCall.name}(${JSON.stringify(toolCall.args)})\n`
      
      if (result.success && result.result) {
        output += `Result: ${JSON.stringify(result.result, null, 2)}\n`
      } else if (result.error) {
        output += `Error: ${result.error}\n`
      }
      
      return output
    })

    return `Tool Execution Results:\n${formattedResults.join('\n')}`
  }

  public extractToolCallsFromResponse(llmResponse: string): ToolCall[] {
    try {
      // Try to find tool calls in the LLM response
      // Look for patterns like function_call, tool_calls, or explicit JSON blocks
      
      // Pattern 1: Look for explicit tool calls JSON
      const toolCallMatch = llmResponse.match(/```(?:json\s+)?\[\s*{[^}]*"name"[^}]*}[^\]]*\]\s*```/s)
      if (toolCallMatch) {
        const jsonStr = toolCallMatch[0].replace(/```(?:json\s*)?/g, '').replace(/```/g, '').trim()
        return JSON.parse(jsonStr) as ToolCall[]
      }

      // Pattern 2: Look for function call objects
      const functionCallPattern = /"function_call":\s*{[^}]*}/g
      const functionCalls = llmResponse.match(functionCallPattern)
      if (functionCalls) {
        const toolCalls: ToolCall[] = []
        for (const call of functionCalls) {
          try {
            const parsed = JSON.parse(`{${call}}`)
            if (parsed.function_call?.name) {
              toolCalls.push({
                name: parsed.function_call.name,
                args: parsed.function_call.arguments || {}
              })
            }
          } catch {
            // Skip invalid function calls
          }
        }
        return toolCalls
      }

      // Pattern 3: No explicit tool calls found
      return []

    } catch (error) {
      console.warn('Failed to extract tool calls from LLM response:', error)
      return []
    }
  }

  public async getAvailableToolsDescription(): Promise<string> {
    try {
      const tools = await mcpClient.getAvailableTools()
      
      if (tools.length === 0) {
        return 'No MCP tools are currently available.'
      }

      const descriptions = tools.map(tool => {
        let desc = `- **${tool.name}**: ${tool.description}`
        if (tool.inputSchema) {
          desc += `\n  Parameters: ${JSON.stringify(tool.inputSchema, null, 2)}`
        }
        return desc
      })

      return `Available MCP Tools:\n${descriptions.join('\n')}\n\nTo use a tool, include a JSON array of tool calls in your response like:\n\`\`\`json\n[{"name": "tool_name", "args": {"param": "value"}}]\n\`\`\``
    } catch (error) {
      return `Error getting available tools: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export const toolExecutor = new ToolExecutor()