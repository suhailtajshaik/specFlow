import { QdrantClient } from '@qdrant/js-client'

export interface RetrievedDocument {
  id: string
  content: string
  metadata: {
    method?: string
    path?: string
    domain?: string
    type?: string
    status?: string
    file_path?: string
    chunk_index?: number
    [key: string]: any
  }
  score: number
}

export interface RetrieveResult {
  documents: RetrievedDocument[]
  error?: string
}

class Retriever {
  private client: QdrantClient

  constructor() {
    const url = Bun.env.QDRANT_URL || 'http://localhost:6333'
    this.client = new QdrantClient({ url })
  }

  public async retrieve(
    embedding: number[],
    method: string,
    path: string,
    limit: number = 10
  ): Promise<RetrieveResult> {
    try {
      // Get active collection name
      const activeCollection = await this.getActiveCollection()
      if (!activeCollection) {
        return { documents: [], error: 'No active collection found' }
      }

      // Build filters
      const mustConditions: any[] = [
        {
          key: 'status',
          match: { value: 'active' }
        }
      ]

      // Add method filter if specified
      if (method) {
        mustConditions.push({
          key: 'method',
          match: { value: method.toUpperCase() }
        })
      }

      // Add path filter - exact match or prefix match
      if (path) {
        // Try exact path match first, then prefix for hierarchical paths
        const pathConditions = [
          {
            key: 'path',
            match: { value: path }
          }
        ]

        // Add prefix matching for sub-paths (e.g., /api/v1 matches /api/v1/*)
        if (path.length > 1) {
          const pathParts = path.split('/').filter(Boolean)
          for (let i = pathParts.length; i > 0; i--) {
            const prefixPath = '/' + pathParts.slice(0, i).join('/')
            if (prefixPath !== path) {
              pathConditions.push({
                key: 'path',
                match: { value: prefixPath }
              })
            }
          }
        }

        mustConditions.push({
          should: pathConditions
        })
      }

      // Search with vector similarity and metadata filters
      const searchResult = await this.client.search(activeCollection, {
        vector: embedding,
        filter: {
          must: mustConditions
        },
        limit,
        with_payload: true
      })

      const documents: RetrievedDocument[] = searchResult.map((point) => ({
        id: point.id.toString(),
        content: point.payload?.content as string || '',
        metadata: {
          method: point.payload?.method as string,
          path: point.payload?.path as string,
          domain: point.payload?.domain as string,
          type: point.payload?.type as string,
          status: point.payload?.status as string,
          file_path: point.payload?.file_path as string,
          chunk_index: point.payload?.chunk_index as number,
          ...((point.payload?.metadata as object) || {})
        },
        score: point.score || 0
      }))

      return { documents }
    } catch (error) {
      console.error('Retrieval error:', error)
      return {
        documents: [],
        error: error instanceof Error ? error.message : 'Retrieval failed'
      }
    }
  }

  private async getActiveCollection(): Promise<string | null> {
    try {
      // Try to read from build manifest
      const manifestPath = Bun.env.BUILD_MANIFEST_PATH || '/tmp/build-manifest.json'
      const activeCollectionPath = Bun.env.ACTIVE_COLLECTION_PATH || '/tmp/.active-collection'

      try {
        const activeCollectionFile = await Bun.file(activeCollectionPath)
        const activeCollection = await activeCollectionFile.text()
        return activeCollection.trim()
      } catch {
        // Fallback to checking available collections
        const collections = await this.client.getCollections()
        
        // Find the most recent collection (by timestamp in name)
        const timestampedCollections = collections.collections
          .map(c => ({ name: c.name, timestamp: this.extractTimestamp(c.name) }))
          .filter(c => c.timestamp > 0)
          .sort((a, b) => b.timestamp - a.timestamp)

        return timestampedCollections[0]?.name || null
      }
    } catch (error) {
      console.error('Error getting active collection:', error)
      return null
    }
  }

  private extractTimestamp(collectionName: string): number {
    // Extract timestamp from collection name like "specs_1703275200000"
    const match = collectionName.match(/_(\d+)$/)
    return match ? parseInt(match[1], 10) : 0
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const collections = await this.client.getCollections()
      return Array.isArray(collections.collections)
    } catch {
      return false
    }
  }
}

export const retriever = new Retriever()