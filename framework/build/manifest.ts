export interface BuildManifest {
  buildId: string
  timestamp: string
  collectionName: string
  totalDocuments: number
  totalChunks: number
  successfulEmbeddings: number
  failedEmbeddings: number
  embeddingProvider: string
  embeddingDimensions: number
  sourceDirectory: string
  processedFiles: string[]
  errors: string[]
  buildTimeMs: number
  config: {
    maxTokens: number
    overlapTokens: number
    batchSize: number
  }
}

export class ManifestGenerator {
  public generateBuildId(): string {
    return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  public generateCollectionName(buildId: string): string {
    const timestamp = Date.now()
    return `specs_${timestamp}`
  }

  public createManifest(
    buildId: string,
    collectionName: string,
    startTime: number,
    endTime: number,
    totalDocuments: number,
    totalChunks: number,
    successfulEmbeddings: number,
    failedEmbeddings: number,
    embeddingProvider: string,
    embeddingDimensions: number,
    sourceDirectory: string,
    processedFiles: string[],
    errors: string[],
    config: BuildManifest['config']
  ): BuildManifest {
    return {
      buildId,
      timestamp: new Date().toISOString(),
      collectionName,
      totalDocuments,
      totalChunks,
      successfulEmbeddings,
      failedEmbeddings,
      embeddingProvider,
      embeddingDimensions,
      sourceDirectory,
      processedFiles,
      errors,
      buildTimeMs: endTime - startTime,
      config
    }
  }

  public async saveManifest(manifest: BuildManifest, outputPath: string = '/tmp/build-manifest.json'): Promise<void> {
    try {
      const manifestJson = JSON.stringify(manifest, null, 2)
      await Bun.write(outputPath, manifestJson)
      console.log(`Build manifest saved to ${outputPath}`)
    } catch (error) {
      console.error('Failed to save build manifest:', error)
      throw error
    }
  }

  public async saveActiveCollectionPointer(collectionName: string, outputPath: string = '/tmp/.active-collection'): Promise<void> {
    try {
      await Bun.write(outputPath, collectionName)
      console.log(`Active collection pointer saved: ${collectionName}`)
    } catch (error) {
      console.error('Failed to save active collection pointer:', error)
      throw error
    }
  }

  public async loadManifest(manifestPath: string = '/tmp/build-manifest.json'): Promise<BuildManifest | null> {
    try {
      const file = await Bun.file(manifestPath)
      const manifestJson = await file.text()
      return JSON.parse(manifestJson) as BuildManifest
    } catch (error) {
      console.warn('Failed to load build manifest:', error)
      return null
    }
  }

  public async getActiveCollection(activeCollectionPath: string = '/tmp/.active-collection'): Promise<string | null> {
    try {
      const file = await Bun.file(activeCollectionPath)
      const collectionName = await file.text()
      return collectionName.trim()
    } catch (error) {
      console.warn('Failed to load active collection:', error)
      return null
    }
  }

  public printBuildSummary(manifest: BuildManifest): void {
    console.log('\n' + '='.repeat(60))
    console.log('BUILD SUMMARY')
    console.log('='.repeat(60))
    console.log(`Build ID: ${manifest.buildId}`)
    console.log(`Collection: ${manifest.collectionName}`)
    console.log(`Source Directory: ${manifest.sourceDirectory}`)
    console.log(`Embedding Provider: ${manifest.embeddingProvider}`)
    console.log(`Build Time: ${(manifest.buildTimeMs / 1000).toFixed(2)}s`)
    console.log('')
    console.log('STATISTICS:')
    console.log(`  Documents Processed: ${manifest.totalDocuments}`)
    console.log(`  Chunks Generated: ${manifest.totalChunks}`)
    console.log(`  Successful Embeddings: ${manifest.successfulEmbeddings}`)
    console.log(`  Failed Embeddings: ${manifest.failedEmbeddings}`)
    console.log(`  Success Rate: ${((manifest.successfulEmbeddings / manifest.totalChunks) * 100).toFixed(1)}%`)
    console.log('')
    
    if (manifest.processedFiles.length > 0) {
      console.log('PROCESSED FILES:')
      manifest.processedFiles.slice(0, 10).forEach(file => {
        console.log(`  - ${file}`)
      })
      if (manifest.processedFiles.length > 10) {
        console.log(`  ... and ${manifest.processedFiles.length - 10} more`)
      }
      console.log('')
    }
    
    if (manifest.errors.length > 0) {
      console.log('ERRORS:')
      manifest.errors.slice(0, 5).forEach(error => {
        console.log(`  - ${error}`)
      })
      if (manifest.errors.length > 5) {
        console.log(`  ... and ${manifest.errors.length - 5} more`)
      }
      console.log('')
    }
    
    console.log('CONFIG:')
    console.log(`  Max Tokens per Chunk: ${manifest.config.maxTokens}`)
    console.log(`  Overlap Tokens: ${manifest.config.overlapTokens}`)
    console.log(`  Batch Size: ${manifest.config.batchSize}`)
    console.log('='.repeat(60))
  }
}