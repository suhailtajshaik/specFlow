#!/usr/bin/env bun

import { glob } from 'glob'
import { QdrantClient } from '@qdrant/js-client'
import { parseFrontmatter, validateFrontmatter } from './frontmatter-parser.ts'
import { MarkdownChunker } from './chunker.ts'
import { BuildEmbedder } from './embedder.ts'
import { ManifestGenerator, type BuildManifest } from './manifest.ts'
import type { Chunk } from './chunker.ts'

interface BuildConfig {
  sourceDir: string
  maxTokens: number
  overlapTokens: number
  batchSize: number
  qdrantUrl: string
  outputDir: string
}

interface QdrantPoint {
  id: string
  vector: number[]
  payload: {
    content: string
    method?: string
    path?: string
    domain?: string
    type?: string
    status?: string
    file_path?: string
    chunk_index?: number
    metadata?: any
  }
}

class VectorDBBuilder {
  private config: BuildConfig
  private chunker: MarkdownChunker
  private embedder: BuildEmbedder
  private manifest: ManifestGenerator
  private qdrant: QdrantClient

  constructor(config: BuildConfig) {
    this.config = config
    this.chunker = new MarkdownChunker()
    this.embedder = new BuildEmbedder()
    this.manifest = new ManifestGenerator()
    this.qdrant = new QdrantClient({ url: config.qdrantUrl })
  }

  public async build(): Promise<BuildManifest> {
    const startTime = Date.now()
    console.log('🚀 Starting vector database build...')
    console.log(`Source directory: ${this.config.sourceDir}`)
    console.log(`Embedding provider: ${this.embedder.getProvider()}`)

    const buildId = this.manifest.generateBuildId()
    const collectionName = this.manifest.generateCollectionName(buildId)
    
    const errors: string[] = []
    const processedFiles: string[] = []
    let totalDocuments = 0
    let totalChunks = 0

    try {
      // Step 1: Scan for markdown files
      console.log('\n📁 Scanning for markdown files...')
      const patterns = [
        `${this.config.sourceDir}/**/*.req.md`,
        `${this.config.sourceDir}/**/*.contract.md`
      ]
      
      const files: string[] = []
      for (const pattern of patterns) {
        const matches = glob.sync(pattern, { absolute: true })
        files.push(...matches)
      }

      if (files.length === 0) {
        throw new Error(`No .req.md or .contract.md files found in ${this.config.sourceDir}`)
      }

      console.log(`Found ${files.length} markdown files`)

      // Step 2: Parse and chunk documents
      console.log('\n📝 Parsing documents and creating chunks...')
      const chunks: Chunk[] = []

      for (const filePath of files) {
        try {
          console.log(`Processing: ${filePath}`)
          
          // Read file content
          const file = await Bun.file(filePath)
          const content = await file.text()
          
          if (!content.trim()) {
            console.warn(`Skipping empty file: ${filePath}`)
            continue
          }

          // Parse frontmatter
          const parsed = parseFrontmatter(content, filePath)
          
          // Validate frontmatter
          if (!validateFrontmatter(parsed.frontmatter, filePath)) {
            errors.push(`Invalid frontmatter in ${filePath}`)
            continue
          }

          // Create chunks
          const documentChunks = this.chunker.chunkDocument(
            parsed.content,
            parsed.frontmatter,
            filePath,
            {
              maxTokens: this.config.maxTokens,
              overlapTokens: this.config.overlapTokens,
              preserveHeadings: true
            }
          )

          chunks.push(...documentChunks)
          processedFiles.push(filePath)
          totalDocuments++
          
          console.log(`  Created ${documentChunks.length} chunks`)

        } catch (error) {
          const errorMsg = `Failed to process ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }

      totalChunks = chunks.length
      console.log(`\nTotal chunks created: ${totalChunks}`)

      if (chunks.length === 0) {
        throw new Error('No valid chunks were created from the source documents')
      }

      // Step 3: Generate embeddings
      console.log('\n🧠 Generating embeddings...')
      const chunkTexts = chunks.map(chunk => chunk.content)
      const embeddingResult = await this.embedder.batchEmbed(chunkTexts, this.config.batchSize)

      if (embeddingResult.successCount === 0) {
        throw new Error('Failed to generate any embeddings')
      }

      console.log(`Generated ${embeddingResult.successCount}/${embeddingResult.totalCount} embeddings successfully`)

      // Step 4: Create Qdrant collection
      console.log('\n🗂️ Creating Qdrant collection...')
      await this.createQdrantCollection(collectionName, this.embedder.getDimensions())

      // Step 5: Prepare and upsert points
      console.log('\n📤 Upserting points to Qdrant...')
      const points: QdrantPoint[] = []

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embedding = embeddingResult.embeddings[i]
        const error = embeddingResult.errors[i]

        if (error || !embedding || embedding.length === 0) {
          errors.push(`Failed to embed chunk ${i} from ${chunk.metadata.file_path}: ${error}`)
          continue
        }

        const pointId = `${buildId}_${i}`
        points.push({
          id: pointId,
          vector: embedding,
          payload: {
            content: chunk.content,
            method: chunk.metadata.method,
            path: chunk.metadata.path,
            domain: chunk.metadata.domain,
            type: chunk.metadata.type,
            status: chunk.metadata.status,
            file_path: chunk.metadata.file_path,
            chunk_index: chunk.chunkIndex,
            metadata: chunk.metadata
          }
        })
      }

      // Upsert in batches
      const upsertBatchSize = 100
      for (let i = 0; i < points.length; i += upsertBatchSize) {
        const batch = points.slice(i, i + upsertBatchSize)
        console.log(`Upserting batch ${Math.floor(i / upsertBatchSize) + 1}/${Math.ceil(points.length / upsertBatchSize)}`)
        
        await this.qdrant.upsert(collectionName, {
          wait: true,
          points: batch
        })
      }

      console.log(`Upserted ${points.length} points to collection ${collectionName}`)

      // Step 6: Create payload indexes for filtering
      console.log('\n🏷️ Creating payload indexes...')
      await this.createPayloadIndexes(collectionName)

      // Step 7: Create snapshot (optional)
      console.log('\n📸 Creating collection snapshot...')
      try {
        await this.qdrant.createSnapshot(collectionName)
        console.log('Snapshot created successfully')
      } catch (error) {
        console.warn('Failed to create snapshot:', error)
        errors.push(`Snapshot creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      const endTime = Date.now()

      // Step 8: Generate and save manifest
      console.log('\n📋 Generating build manifest...')
      const manifest = this.manifest.createManifest(
        buildId,
        collectionName,
        startTime,
        endTime,
        totalDocuments,
        totalChunks,
        embeddingResult.successCount,
        embeddingResult.totalCount - embeddingResult.successCount,
        this.embedder.getProvider(),
        this.embedder.getDimensions(),
        this.config.sourceDir,
        processedFiles,
        errors,
        {
          maxTokens: this.config.maxTokens,
          overlapTokens: this.config.overlapTokens,
          batchSize: this.config.batchSize
        }
      )

      await this.manifest.saveManifest(manifest, `${this.config.outputDir}/build-manifest.json`)
      await this.manifest.saveActiveCollectionPointer(collectionName, `${this.config.outputDir}/.active-collection`)

      this.manifest.printBuildSummary(manifest)
      console.log('\n✅ Build completed successfully!')

      return manifest

    } catch (error) {
      const endTime = Date.now()
      console.error('\n❌ Build failed:', error)
      
      const manifest = this.manifest.createManifest(
        buildId,
        collectionName,
        startTime,
        endTime,
        totalDocuments,
        totalChunks,
        0,
        totalChunks,
        this.embedder.getProvider(),
        this.embedder.getDimensions(),
        this.config.sourceDir,
        processedFiles,
        [...errors, error instanceof Error ? error.message : 'Unknown error'],
        {
          maxTokens: this.config.maxTokens,
          overlapTokens: this.config.overlapTokens,
          batchSize: this.config.batchSize
        }
      )

      await this.manifest.saveManifest(manifest, `${this.config.outputDir}/build-manifest.json`)
      throw error

    } finally {
      this.chunker.dispose()
    }
  }

  private async createQdrantCollection(collectionName: string, vectorSize: number): Promise<void> {
    try {
      await this.qdrant.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      })
      console.log(`Created collection: ${collectionName} (${vectorSize}D vectors)`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        console.log(`Collection ${collectionName} already exists, recreating...`)
        await this.qdrant.deleteCollection(collectionName)
        await this.qdrant.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine'
          }
        })
      } else {
        throw error
      }
    }
  }

  private async createPayloadIndexes(collectionName: string): Promise<void> {
    const indexes = [
      { field: 'method', type: 'keyword' as const },
      { field: 'path', type: 'keyword' as const },
      { field: 'domain', type: 'keyword' as const },
      { field: 'type', type: 'keyword' as const },
      { field: 'status', type: 'keyword' as const }
    ]

    for (const index of indexes) {
      try {
        await this.qdrant.createPayloadIndex(collectionName, {
          field_name: index.field,
          field_schema: { type: index.type }
        })
        console.log(`Created payload index for field: ${index.field}`)
      } catch (error) {
        console.warn(`Failed to create index for ${index.field}:`, error)
      }
    }
  }
}

// Main function
async function main() {
  const config: BuildConfig = {
    sourceDir: process.argv[2] || Bun.env.SOURCE_DIR || './example/requirements',
    maxTokens: parseInt(Bun.env.CHUNK_MAX_TOKENS || '512'),
    overlapTokens: parseInt(Bun.env.CHUNK_OVERLAP_TOKENS || '50'),
    batchSize: parseInt(Bun.env.EMBEDDING_BATCH_SIZE || '64'),
    qdrantUrl: Bun.env.QDRANT_URL || 'http://localhost:6333',
    outputDir: Bun.env.BUILD_OUTPUT_DIR || '/tmp'
  }

  console.log('LLM Backend Framework - Vector DB Builder')
  console.log('========================================')

  try {
    const builder = new VectorDBBuilder(config)
    await builder.build()
    process.exit(0)
  } catch (error) {
    console.error('\nBuild failed:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}