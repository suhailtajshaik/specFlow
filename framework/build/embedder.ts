import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

export interface EmbeddingResult {
  embedding: number[]
  error?: string
}

export interface BatchEmbeddingResult {
  embeddings: number[][]
  errors: (string | null)[]
  successCount: number
  totalCount: number
}

export class BuildEmbedder {
  private llamaCppClient?: OpenAI
  private geminiClient?: GoogleGenerativeAI
  private provider: string

  constructor() {
    this.provider = Bun.env.EMBEDDING_PROVIDER || Bun.env.LLM_PROVIDER || 'llamacpp'
    
    if (this.provider === 'llamacpp') {
      this.llamaCppClient = new OpenAI({
        baseURL: Bun.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1',
        apiKey: 'not-required'
      })
    } else if (this.provider === 'gemini') {
      const apiKey = Bun.env.GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required for Gemini embeddings')
      }
      this.geminiClient = new GoogleGenerativeAI(apiKey)
    }
  }

  public async embedText(text: string): Promise<EmbeddingResult> {
    try {
      if (this.provider === 'gemini' && this.geminiClient) {
        return await this.embedWithGemini(text)
      } else if (this.provider === 'llamacpp' && this.llamaCppClient) {
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
    console.log(`Starting batch embedding of ${texts.length} texts with batch size ${batchSize}`)
    
    const embeddings: number[][] = []
    const errors: (string | null)[] = []
    let successCount = 0

    // Process in batches to avoid overwhelming the service
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`)
      
      // Process batch items in parallel but with some concurrency limit
      const concurrentLimit = Math.min(batchSize, 8)
      const batchPromises: Promise<EmbeddingResult>[] = []
      
      for (let j = 0; j < batch.length; j += concurrentLimit) {
        const concurrentBatch = batch.slice(j, j + concurrentLimit)
        const promises = concurrentBatch.map(text => this.embedText(text))
        batchPromises.push(...promises)
        
        // Wait for this concurrent batch to complete before starting the next
        if (j + concurrentLimit < batch.length) {
          const results = await Promise.all(promises)
          results.forEach(result => {
            embeddings.push(result.embedding)
            errors.push(result.error || null)
            if (result.embedding.length > 0) successCount++
          })
        }
      }
      
      // Handle remaining promises
      if (batchPromises.length > embeddings.length) {
        const remainingPromises = batchPromises.slice(embeddings.length)
        const remainingResults = await Promise.all(remainingPromises)
        remainingResults.forEach(result => {
          embeddings.push(result.embedding)
          errors.push(result.error || null)
          if (result.embedding.length > 0) successCount++
        })
      }

      // Small delay between batches to be respectful to the API
      if (i + batchSize < texts.length) {
        console.log(`Batch completed, waiting 500ms before next batch...`)
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log(`Batch embedding completed: ${successCount}/${texts.length} successful`)

    return {
      embeddings,
      errors,
      successCount,
      totalCount: texts.length
    }
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

  public getDimensions(): number {
    // Return expected embedding dimensions based on provider
    switch (this.provider) {
      case 'gemini':
        return 768 // text-embedding-004 dimensions
      case 'llamacpp':
        return 384 // Common embedding model size, may vary
      default:
        return 384
    }
  }

  public getProvider(): string {
    return this.provider
  }
}