import type { Context } from 'hono'
import { embedder } from './rag/embedder.ts'
import { retriever } from './rag/retriever.ts'
import { promptBuilder } from './rag/prompt-builder.ts'
import { mcpClient } from './mcp/client.ts'
import { inferenceWithRetry } from './llm/retry.ts'
import { toolExecutor } from './llm/tool-executor.ts'
import { validateAuth, parseBooleanFromFrontmatter } from './middleware/auth.ts'
import { checkRateLimit, parseRateLimit } from './middleware/rate-limit.ts'
import { updateTrace } from './middleware/trace.ts'
import { schemaRegistry } from './validation/schema-registry.ts'
import { z } from 'zod'

export async function handleRAGRoute(c: Context): Promise<Response> {
  const startTime = Date.now()

  try {
    // 1. Extract request details
    const method = c.req.method
    const path = c.req.path
    
    let body: any = null
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await c.req.json()
      } catch {
        // Non-JSON body or empty body is okay
      }
    }
    
    const query = Object.fromEntries(c.req.queries())
    const headers = Object.fromEntries(
      Array.from(c.req.raw.headers.entries())
        .map(([k, v]) => [k.toLowerCase(), v])
    )

    // 2. Embed the query (method + path)
    const embedStart = Date.now()
    const queryString = `${method} ${path}`
    const embeddingResult = await embedder.embed(queryString)
    
    if (!embeddingResult.embedding || embeddingResult.embedding.length === 0) {
      updateTrace(c, 'embed', Date.now() - embedStart)
      return c.json({
        status: 500,
        data: null,
        error: {
          code: 'EMBEDDING_FAILED',
          message: 'Failed to generate query embedding',
          details: { error: embeddingResult.error }
        }
      }, 500)
    }
    updateTrace(c, 'embed', Date.now() - embedStart)

    // 3. Retrieve relevant documents
    const retrieveStart = Date.now()
    const retrieveResult = await retriever.retrieve(
      embeddingResult.embedding,
      method,
      path,
      10 // limit
    )
    
    if (retrieveResult.error) {
      updateTrace(c, 'retrieve', Date.now() - retrieveStart)
      return c.json({
        status: 500,
        data: null,
        error: {
          code: 'RETRIEVAL_FAILED',
          message: 'Failed to retrieve relevant documents',
          details: { error: retrieveResult.error }
        }
      }, 500)
    }

    if (retrieveResult.documents.length === 0) {
      updateTrace(c, 'retrieve', Date.now() - retrieveStart)
      return c.json({
        status: 404,
        data: null,
        error: {
          code: 'ENDPOINT_NOT_FOUND',
          message: `No specifications found for ${method} ${path}`,
          details: { method, path }
        }
      }, 404)
    }
    updateTrace(c, 'retrieve', Date.now() - retrieveStart)

    // 4. Extract metadata from the best-matching contract
    const primaryContract = retrieveResult.documents.find(doc => 
      doc.metadata.type === 'contract' || doc.metadata.file_path?.endsWith('.contract.md')
    )

    let requiresAuth = false
    let rateLimitConfig = null

    if (primaryContract?.metadata) {
      // Parse frontmatter metadata
      const frontmatterMatch = primaryContract.content.match(/^---\s*\n([\s\S]*?)\n---/)
      if (frontmatterMatch) {
        try {
          // Simple YAML parsing for key: value pairs
          const frontmatter: Record<string, any> = {}
          const lines = frontmatterMatch[1].split('\n')
          for (const line of lines) {
            const colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
              const key = line.slice(0, colonIndex).trim()
              const value = line.slice(colonIndex + 1).trim()
              frontmatter[key] = value
            }
          }
          
          requiresAuth = parseBooleanFromFrontmatter(frontmatter.requires_auth)
          rateLimitConfig = parseRateLimit(frontmatter.rate_limit)
        } catch (error) {
          console.warn('Failed to parse frontmatter:', error)
        }
      }
    }

    // 5. Validate authentication
    const authResult = await validateAuth(c, requiresAuth)
    if (!authResult.authenticated) {
      return c.json({
        status: 401,
        data: null,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: authResult.error || 'Authentication required',
          details: { requires_auth: requiresAuth }
        }
      }, 401)
    }

    // 6. Check rate limits
    const rateLimitResult = await checkRateLimit(c, rateLimitConfig, authResult.userId)
    if (!rateLimitResult.allowed) {
      return c.json({
        status: 429,
        data: null,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          details: {
            remaining: rateLimitResult.remaining,
            resetTime: rateLimitResult.resetTime
          }
        }
      }, 429, {
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString()
      })
    }

    // 7. Build prompt
    const promptStart = Date.now()
    
    // Initialize MCP client if not already done
    if (!mcpClient.isHealthy()) {
      await mcpClient.initialize()
    }
    
    const availableTools = await mcpClient.getAvailableTools()
    
    const promptContext = {
      method,
      path,
      body,
      query,
      headers,
      userId: authResult.userId
    }

    const builtPrompt = promptBuilder.build(
      promptContext,
      retrieveResult.documents,
      availableTools
    )
    updateTrace(c, 'prompt', Date.now() - promptStart)

    // 8. LLM inference
    const inferenceStart = Date.now()
    const inferenceResult = await inferenceWithRetry({
      systemPrompt: builtPrompt.systemPrompt,
      userMessage: builtPrompt.userMessage,
      responseSchema: builtPrompt.responseSchema,
      temperature: 0.1
    })

    if (!inferenceResult.success) {
      updateTrace(c, 'inference', Date.now() - inferenceStart)
      return c.json({
        status: 500,
        data: null,
        error: {
          code: 'INFERENCE_FAILED',
          message: 'LLM inference failed',
          details: { error: inferenceResult.error }
        }
      }, 500)
    }
    updateTrace(c, 'inference', Date.now() - inferenceStart)

    // 9. Execute any tool calls if present
    let finalResponse = inferenceResult.response || ''
    const toolCalls = toolExecutor.extractToolCallsFromResponse(finalResponse)
    
    if (toolCalls.length > 0) {
      const toolExecutionResult = await toolExecutor.executeToolCalls(toolCalls)
      
      // Append tool results to the context and potentially re-run inference
      const toolResultsFormatted = toolExecutor.formatToolResultsForLLM(toolExecutionResult)
      
      // For now, we'll append tool results and return
      // In a more sophisticated implementation, we might re-run inference with tool results
      finalResponse += `\n\nTool Execution Results:\n${toolResultsFormatted}`
    }

    // 10. Validate response
    const validationStart = Date.now()
    let parsedResponse: any

    try {
      parsedResponse = JSON.parse(finalResponse)
    } catch (error) {
      updateTrace(c, 'validation', Date.now() - validationStart)
      return c.json({
        status: 500,
        data: null,
        error: {
          code: 'INVALID_RESPONSE_FORMAT',
          message: 'LLM returned invalid JSON',
          details: { 
            response: finalResponse.slice(0, 500),
            parseError: error instanceof Error ? error.message : 'Unknown parse error'
          }
        }
      }, 500)
    }

    // Validate against schema if available
    if (builtPrompt.responseSchema) {
      try {
        const zodSchema = schemaRegistry.compile(builtPrompt.responseSchema)
        zodSchema.parse(parsedResponse)
      } catch (error) {
        updateTrace(c, 'validation', Date.now() - validationStart)
        return c.json({
          status: 500,
          data: null,
          error: {
            code: 'SCHEMA_VALIDATION_FAILED',
            message: 'Response does not match expected schema',
            details: { 
              validationError: error instanceof z.ZodError ? error.issues : error
            }
          }
        }, 500)
      }
    }
    updateTrace(c, 'validation', Date.now() - validationStart)

    // 11. Return response
    const httpStatus = parsedResponse.status || 200
    
    // Add rate limit headers if applicable
    const responseHeaders: Record<string, string> = {}
    if (rateLimitConfig) {
      responseHeaders['X-RateLimit-Remaining'] = rateLimitResult.remaining.toString()
      responseHeaders['X-RateLimit-Reset'] = rateLimitResult.resetTime.toString()
    }

    return c.json(parsedResponse, httpStatus, responseHeaders)

  } catch (error) {
    console.error('RAG route error:', error)
    return c.json({
      status: 500,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime
        }
      }
    }, 500)
  }
}