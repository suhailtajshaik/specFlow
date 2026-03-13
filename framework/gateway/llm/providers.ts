import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface InferenceRequest {
  systemPrompt: string
  userMessage: string
  responseSchema?: any
  temperature?: number
  maxTokens?: number
}

export interface InferenceResult {
  success: boolean
  response?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LLMProvider {
  name: string
  inference(request: InferenceRequest): Promise<InferenceResult>
}

class LlamaCppProvider implements LLMProvider {
  public name = 'llamacpp'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      baseURL: Bun.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
      apiKey: 'not-required'
    })
  }

  async inference(request: InferenceRequest): Promise<InferenceResult> {
    try {
      const model = Bun.env.LLAMACPP_MODEL || 'qwen2.5-7b'
      
      const completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage }
        ],
        temperature: request.temperature || 0.1,
        max_tokens: request.maxTokens || 4096,
        response_format: request.responseSchema ? {
          type: 'json_object',
          schema: request.responseSchema
        } : undefined
      })

      const message = completion.choices[0]?.message
      if (!message?.content) {
        return { success: false, error: 'No response from LlamaCpp' }
      }

      return {
        success: true,
        response: message.content,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'LlamaCpp inference failed'
      }
    }
  }
}

class GeminiProvider implements LLMProvider {
  public name = 'gemini'
  private client: GoogleGenerativeAI

  constructor() {
    const apiKey = Bun.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required')
    }
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async inference(request: InferenceRequest): Promise<InferenceResult> {
    try {
      const modelName = Bun.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
      
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: request.temperature || 0.1,
          maxOutputTokens: request.maxTokens || 4096,
          responseMimeType: request.responseSchema ? 'application/json' : 'text/plain',
          responseSchema: request.responseSchema
        }
      })

      const prompt = `${request.systemPrompt}\n\nUser: ${request.userMessage}`
      const result = await model.generateContent(prompt)
      
      const response = result.response.text()
      if (!response) {
        return { success: false, error: 'No response from Gemini' }
      }

      return {
        success: true,
        response,
        usage: {
          promptTokens: result.response.usageMetadata?.promptTokenCount || 0,
          completionTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.response.usageMetadata?.totalTokenCount || 0
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gemini inference failed'
      }
    }
  }
}

class ClaudeProvider implements LLMProvider {
  public name = 'claude'
  private client: Anthropic

  constructor() {
    const apiKey = Bun.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required')
    }
    this.client = new Anthropic({ apiKey })
  }

  async inference(request: InferenceRequest): Promise<InferenceResult> {
    try {
      const model = Bun.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'
      
      let systemPrompt = request.systemPrompt
      if (request.responseSchema) {
        systemPrompt += '\n\nIMPORTANT: Respond with valid JSON only. No other text or formatting.'
      }

      const response = await this.client.messages.create({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.userMessage }],
        temperature: request.temperature || 0.1,
        max_tokens: request.maxTokens || 4096
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        return { success: false, error: 'Unexpected response type from Claude' }
      }

      return {
        success: true,
        response: content.text,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claude inference failed'
      }
    }
  }
}

class VLLMProvider implements LLMProvider {
  public name = 'vllm'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      baseURL: Bun.env.VLLM_BASE_URL || 'http://localhost:8000/v1',
      apiKey: 'not-required'
    })
  }

  async inference(request: InferenceRequest): Promise<InferenceResult> {
    try {
      const model = Bun.env.VLLM_MODEL || 'qwen2.5-7b-instruct'
      
      const completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage }
        ],
        temperature: request.temperature || 0.1,
        max_tokens: request.maxTokens || 4096,
        extra_body: request.responseSchema ? {
          guided_json: request.responseSchema
        } : undefined
      })

      const message = completion.choices[0]?.message
      if (!message?.content) {
        return { success: false, error: 'No response from vLLM' }
      }

      return {
        success: true,
        response: message.content,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'vLLM inference failed'
      }
    }
  }
}

class ProviderFactory {
  private providers = new Map<string, LLMProvider>()

  constructor() {
    try {
      this.providers.set('llamacpp', new LlamaCppProvider())
    } catch (error) {
      console.warn('LlamaCpp provider not available:', error)
    }

    try {
      this.providers.set('gemini', new GeminiProvider())
    } catch (error) {
      console.warn('Gemini provider not available:', error)
    }

    try {
      this.providers.set('claude', new ClaudeProvider())
    } catch (error) {
      console.warn('Claude provider not available:', error)
    }

    try {
      this.providers.set('vllm', new VLLMProvider())
    } catch (error) {
      console.warn('vLLM provider not available:', error)
    }
  }

  getProvider(name?: string): LLMProvider {
    const providerName = name || Bun.env.LLM_PROVIDER || 'llamacpp'
    const provider = this.providers.get(providerName)
    
    if (!provider) {
      throw new Error(`Provider '${providerName}' not available. Check configuration.`)
    }
    
    return provider
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }
}

export const providerFactory = new ProviderFactory()

export async function inference(request: InferenceRequest, providerName?: string): Promise<InferenceResult> {
  const provider = providerFactory.getProvider(providerName)
  return await provider.inference(request)
}