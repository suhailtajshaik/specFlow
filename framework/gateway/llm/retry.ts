import type { InferenceRequest, InferenceResult } from './providers.ts'
import { inference } from './providers.ts'

interface RetryConfig {
  maxRetries: number
  temperatures: number[]
  delayMs: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  temperatures: [0.1, 0.0, 0.0], // 3-tier retry with decreasing temperature
  delayMs: 1000
}

export async function inferenceWithRetry(
  request: InferenceRequest,
  providerName?: string,
  config: Partial<RetryConfig> = {}
): Promise<InferenceResult> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  const errors: string[] = []

  for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
    try {
      // Use specified temperature or fall back to retry config
      const temperature = request.temperature ?? retryConfig.temperatures[attempt]
      
      const attemptRequest: InferenceRequest = {
        ...request,
        temperature,
        // Append retry context to system prompt if this is a retry
        systemPrompt: attempt > 0 
          ? `${request.systemPrompt}\n\nNOTE: This is retry attempt ${attempt + 1}. Previous errors:\n${errors.join('\n')}`
          : request.systemPrompt
      }

      const result = await inference(attemptRequest, providerName)
      
      if (result.success) {
        // Validate response is valid JSON if schema was provided
        if (request.responseSchema && result.response) {
          try {
            JSON.parse(result.response)
          } catch (parseError) {
            errors.push(`Attempt ${attempt + 1}: Invalid JSON response`)
            
            // If this is the last attempt, return the parse error
            if (attempt === retryConfig.maxRetries - 1) {
              return {
                success: false,
                error: `All retries failed. Final error: Invalid JSON response. Errors: ${errors.join('; ')}`
              }
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, retryConfig.delayMs))
            continue
          }
        }
        
        // Success - return result with retry metadata
        return {
          ...result,
          usage: result.usage ? {
            ...result.usage,
            retryAttempt: attempt + 1
          } : undefined
        }
      }

      // Failed - record error and continue
      errors.push(`Attempt ${attempt + 1}: ${result.error || 'Unknown error'}`)

      // If this is the last attempt, return failure
      if (attempt === retryConfig.maxRetries - 1) {
        return {
          success: false,
          error: `All retries failed. Errors: ${errors.join('; ')}`
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryConfig.delayMs))
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Attempt ${attempt + 1}: ${errorMsg}`)

      // If this is the last attempt, return failure
      if (attempt === retryConfig.maxRetries - 1) {
        return {
          success: false,
          error: `All retries failed with exceptions. Errors: ${errors.join('; ')}`
        }
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryConfig.delayMs))
    }
  }

  // Shouldn't reach here, but just in case
  return {
    success: false,
    error: `Retry logic error. Errors: ${errors.join('; ')}`
  }
}

export function shouldRetry(result: InferenceResult): boolean {
  if (result.success) {
    return false
  }

  const error = result.error?.toLowerCase() || ''
  
  // Don't retry authentication/authorization errors
  if (error.includes('unauthorized') || error.includes('forbidden') || error.includes('api key')) {
    return false
  }

  // Don't retry quota exceeded errors
  if (error.includes('quota') || error.includes('rate limit')) {
    return false
  }

  // Don't retry for malformed requests
  if (error.includes('invalid request') || error.includes('bad request')) {
    return false
  }

  // Retry for transient errors
  if (error.includes('timeout') || error.includes('connection') || error.includes('network')) {
    return true
  }

  // Retry for server errors
  if (error.includes('internal server error') || error.includes('service unavailable')) {
    return true
  }

  // Default: retry for unknown errors
  return true
}