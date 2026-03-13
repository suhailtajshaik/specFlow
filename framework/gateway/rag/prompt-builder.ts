import type { RetrievedDocument } from './retriever.ts'

export interface PromptContext {
  method: string
  path: string
  body?: any
  query?: Record<string, string>
  headers?: Record<string, string>
  userId?: string
}

export interface BuiltPrompt {
  systemPrompt: string
  userMessage: string
  responseSchema?: any
}

export class PromptBuilder {
  public build(
    context: PromptContext,
    documents: RetrievedDocument[],
    mcpTools: any[]
  ): BuiltPrompt {
    const { contracts, businessRules } = this.categorizeDocuments(documents)

    // Extract response schema from contract
    const responseSchema = this.extractResponseSchema(contracts)

    const systemPrompt = this.buildSystemPrompt(contracts, businessRules, mcpTools)
    const userMessage = this.buildUserMessage(context)

    return {
      systemPrompt,
      userMessage,
      responseSchema
    }
  }

  private categorizeDocuments(documents: RetrievedDocument[]) {
    const contracts: RetrievedDocument[] = []
    const businessRules: RetrievedDocument[] = []

    for (const doc of documents) {
      if (doc.metadata.type === 'contract' || doc.metadata.file_path?.endsWith('.contract.md')) {
        contracts.push(doc)
      } else if (doc.metadata.type === 'requirement' || doc.metadata.file_path?.endsWith('.req.md')) {
        businessRules.push(doc)
      }
    }

    // Sort by relevance score
    contracts.sort((a, b) => b.score - a.score)
    businessRules.sort((a, b) => b.score - a.score)

    return { contracts, businessRules }
  }

  private buildSystemPrompt(
    contracts: RetrievedDocument[],
    businessRules: RetrievedDocument[],
    mcpTools: any[]
  ): string {
    const parts = [
      'You are an API endpoint handler that processes HTTP requests according to provided specifications.',
      '',
      '## INSTRUCTIONS',
      '1. Follow the API contract exactly - endpoint path, HTTP method, request/response schemas',
      '2. Implement all business rules precisely as specified',
      '3. Use available MCP tools for data operations, external APIs, email, auth, and caching',
      '4. Return valid JSON that matches the response schema',
      '5. Handle errors gracefully with appropriate HTTP status codes',
      '6. Log important actions and decisions',
      '',
      '## RESPONSE FORMAT',
      'Return a JSON object with this structure:',
      '```json',
      '{',
      '  "status": 200,',
      '  "data": { /* response data matching schema */ },',
      '  "error": null',
      '}',
      '```',
      '',
      'For errors:',
      '```json',
      '{',
      '  "status": 400,',
      '  "data": null,',
      '  "error": {',
      '    "code": "ERROR_CODE",',
      '    "message": "Human readable message",',
      '    "details": { /* optional additional info */ }',
      '  }',
      '}',
      '```'
    ]

    // Add API contracts
    if (contracts.length > 0) {
      parts.push('', '## API CONTRACTS')
      contracts.forEach((contract, index) => {
        parts.push(`### Contract ${index + 1} (Score: ${contract.score.toFixed(3)})`)
        parts.push('```markdown')
        parts.push(contract.content)
        parts.push('```')
        parts.push('')
      })
    }

    // Add business rules
    if (businessRules.length > 0) {
      parts.push('', '## BUSINESS RULES')
      businessRules.forEach((rule, index) => {
        parts.push(`### Rule Set ${index + 1} (Score: ${rule.score.toFixed(3)})`)
        parts.push('```markdown')
        parts.push(rule.content)
        parts.push('```')
        parts.push('')
      })
    }

    // Add MCP tools
    if (mcpTools.length > 0) {
      parts.push('', '## AVAILABLE TOOLS')
      parts.push('You have access to these MCP tools for data operations:')
      parts.push('')
      
      mcpTools.forEach(tool => {
        parts.push(`### ${tool.name}`)
        parts.push(`**Description:** ${tool.description}`)
        if (tool.inputSchema) {
          parts.push('**Parameters:**')
          parts.push('```json')
          parts.push(JSON.stringify(tool.inputSchema, null, 2))
          parts.push('```')
        }
        parts.push('')
      })
    }

    return parts.join('\n')
  }

  private buildUserMessage(context: PromptContext): string {
    const parts = [
      `Handle this ${context.method} request to ${context.path}:`
    ]

    if (context.body) {
      parts.push('', '**Request Body:**')
      parts.push('```json')
      parts.push(JSON.stringify(context.body, null, 2))
      parts.push('```')
    }

    if (context.query && Object.keys(context.query).length > 0) {
      parts.push('', '**Query Parameters:**')
      for (const [key, value] of Object.entries(context.query)) {
        parts.push(`- ${key}: ${value}`)
      }
    }

    if (context.headers) {
      const relevantHeaders = Object.entries(context.headers)
        .filter(([key]) => 
          !key.toLowerCase().startsWith('x-') &&
          !['authorization', 'cookie', 'host', 'user-agent'].includes(key.toLowerCase())
        )
      
      if (relevantHeaders.length > 0) {
        parts.push('', '**Relevant Headers:**')
        relevantHeaders.forEach(([key, value]) => {
          parts.push(`- ${key}: ${value}`)
        })
      }
    }

    if (context.userId) {
      parts.push('', `**Authenticated User ID:** ${context.userId}`)
    }

    parts.push('', 'Process this request according to the contracts and business rules.')

    return parts.join('\n')
  }

  private extractResponseSchema(contracts: RetrievedDocument[]): any {
    for (const contract of contracts) {
      // Look for response schema reference in the contract
      const schemaMatch = contract.content.match(/Response schema:\s*([^\s\n]+\.schema\.json)/i)
      if (schemaMatch) {
        // Return schema reference - actual schema loading handled by schema registry
        return { $ref: schemaMatch[1] }
      }

      // Look for inline JSON schema
      const jsonSchemaMatch = contract.content.match(/```json\s*({[\s\S]*?})\s*```/i)
      if (jsonSchemaMatch) {
        try {
          return JSON.parse(jsonSchemaMatch[1])
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    // Default response schema
    return {
      type: 'object',
      properties: {
        status: { type: 'integer' },
        data: { type: 'object' },
        error: { 
          type: ['object', 'null'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' }
          }
        }
      },
      required: ['status']
    }
  }
}

export const promptBuilder = new PromptBuilder()