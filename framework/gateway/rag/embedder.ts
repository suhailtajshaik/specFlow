import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

export interface EmbeddingResult {
  embedding: number[]
  error?: string
}

export interface BatchEmbeddingResult {
  embeddings: number[][]
  errors: (string | null)[]
}

class Embedder {
  private llamaCppClient?: OpenAI
  private geminiClient?: GoogleGenerativeAI

  constructor() {
    const provider = Bun.env.EMBEDDING_PROVIDER || Bun.env.LLM_PROVIDER || 'llamacpp'
    
    if (provider === 'llamacpp') {
      this.llamaCppClient = new OpenAI({
        baseURL: Bun.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
        apiKey: 'not-required'
      })
    } else if (provider === 'gemini') {
      const apiKey = Bun.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required for Gemini embeddings')
      }
      this.geminiClient = new GoogleGenerativeAI(apiKey)
    }
  }

  public async embed(text: string): Promise<EmbeddingResult> {
    try {
      const provider = Bun.env.EMBEDDING_PROVIDER || Bun.env.LLM_PROVIDER || 'llamacpp'
      
      if (provider === 'gemini' && this.geminiClient) {
        return await this.embedWithGemini(text)
      } else if (this.llamaCppClient) {
        return await this.embedWithLlamaCpp(text)
      } else {
        return { embedding: [], error: 'No embedding client configured' }
      }
    } catch (error) {
      return {
        embedding: [],
        error: error instanceof Error ? error.message : 'Embedding failed'
      }
    }
  }

  public async batchEmbed(texts: string[], batchSize: number = 64): Promise<BatchEmbeddingResult> {
    const embeddings: number[][] = []
    const errors: (string | null)[] = []

    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      
      const batchPromises = batch.map(text => this.embed(text))
      const batchResults = await Promise.all(batchPromises)
      
      for (const result of batchResults) {
        embeddings.push(result.embedding)
        errors.push(result.error || null)
      }

      // Small delay between batches to avoid overwhelming the service
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return { embeddings, errors }
  }

  private async embedWithGemini(text: string): Promise<EmbeddingResult> {
    if (!this.geminiClient) {
      return { embedding: [], error: 'Gemini client not initialized' }
    }

    try {
      const model = this.geminiClient.getGenerativeModel({
        model: Bun.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
      })

      const result = await model.embedContent(text)
      const embedding = result.embedding.values

      if (!embedding || embedding.length === 0) {
        return { embedding: [], error: 'Empty embedding received from Gemini' }
      }

      return { embedding }
    } catch (error) {
      return {
        embedding: [],
        error: `Gemini embedding error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private async embedWithLlamaCpp(text: string): Promise<EmbeddingResult> {
    if (!this.llamaCppClient) {
      return { embedding: [], error: 'LlamaCpp client not initialized' }
    }

    try {
      const response = await this.llamaCppClient.embeddings.create({
        input: text,
        model: Bun.env.LLAMACPP_EMBEDDING_MODEL || 'text-embedding'
      })

      const embedding = response.data[0]?.embedding
      if (!embedding || embedding.length === 0) {
        return { embedding: [], error: 'Empty embedding received from LlamaCpp' }
      }

      return { embedding }
    } catch (error) {
      return {
        embedding: [],
        error: `LlamaCpp embedding error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
}

export const embedder = new Embedder()