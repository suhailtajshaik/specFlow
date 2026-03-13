import { encoding_for_model } from 'tiktoken'
import type { FrontmatterData } from './frontmatter-parser.ts'

export interface Chunk {
  content: string
  metadata: FrontmatterData
  chunkIndex: number
  totalChunks: number
  tokenCount: number
}

export interface ChunkingOptions {
  maxTokens: number
  overlapTokens: number
  preserveHeadings: boolean
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxTokens: 512,
  overlapTokens: 50,
  preserveHeadings: true
}

export class MarkdownChunker {
  private encoder: any

  constructor() {
    // Use tiktoken for accurate token counting
    this.encoder = encoding_for_model('gpt-3.5-turbo') // Compatible token counting
  }

  public chunkDocument(
    content: string, 
    frontmatter: FrontmatterData,
    filePath: string,
    options: Partial<ChunkingOptions> = {}
  ): Chunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    
    // Split by headings first
    const sections = this.splitByHeadings(content)
    const chunks: Chunk[] = []
    
    for (const section of sections) {
      const sectionChunks = this.chunkSection(section, frontmatter, filePath, opts)
      chunks.push(...sectionChunks)
    }
    
    // Update total chunks count
    chunks.forEach((chunk, index) => {
      chunk.chunkIndex = index
      chunk.totalChunks = chunks.length
    })
    
    return chunks
  }

  private splitByHeadings(content: string): string[] {
    // Split by ## and ### headings
    const sections: string[] = []
    const lines = content.split('\n')
    let currentSection: string[] = []
    
    for (const line of lines) {
      const isHeading = line.match(/^#{2,3}\s+/)
      
      if (isHeading && currentSection.length > 0) {
        // Start new section
        sections.push(currentSection.join('\n').trim())
        currentSection = [line]
      } else {
        currentSection.push(line)
      }
    }
    
    // Add the last section
    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n').trim())
    }
    
    // If no headings found, return the entire content as one section
    if (sections.length === 0) {
      sections.push(content.trim())
    }
    
    return sections.filter(section => section.length > 0)
  }

  private chunkSection(
    sectionContent: string,
    frontmatter: FrontmatterData,
    filePath: string,
    options: ChunkingOptions
  ): Chunk[] {
    const tokens = this.encoder.encode(sectionContent)
    
    // If section fits in one chunk, return it as-is
    if (tokens.length <= options.maxTokens) {
      return [{
        content: sectionContent,
        metadata: {
          ...frontmatter,
          file_path: filePath
        },
        chunkIndex: 0,
        totalChunks: 1,
        tokenCount: tokens.length
      }]
    }
    
    // Need to split further
    return this.recursiveChunk(sectionContent, frontmatter, filePath, options)
  }

  private recursiveChunk(
    content: string,
    frontmatter: FrontmatterData,
    filePath: string,
    options: ChunkingOptions
  ): Chunk[] {
    const chunks: Chunk[] = []
    const contentTokens = this.encoder.encode(content)
    
    if (contentTokens.length <= options.maxTokens) {
      // Base case: content fits in one chunk
      return [{
        content,
        metadata: {
          ...frontmatter,
          file_path: filePath
        },
        chunkIndex: 0,
        totalChunks: 1,
        tokenCount: contentTokens.length
      }]
    }
    
    // Split content into overlapping chunks
    const chunkSize = options.maxTokens
    const overlapSize = options.overlapTokens
    
    let start = 0
    let chunkIndex = 0
    
    while (start < contentTokens.length) {
      const end = Math.min(start + chunkSize, contentTokens.length)
      const chunkTokens = contentTokens.slice(start, end)
      const chunkContent = this.encoder.decode(chunkTokens)
      
      // Try to break at sentence or paragraph boundaries if possible
      const cleanChunkContent = this.cleanChunkBoundaries(chunkContent, start > 0, end < contentTokens.length)
      
      chunks.push({
        content: cleanChunkContent,
        metadata: {
          ...frontmatter,
          file_path: filePath,
          chunk_index: chunkIndex
        },
        chunkIndex,
        totalChunks: 0, // Will be updated later
        tokenCount: this.encoder.encode(cleanChunkContent).length
      })
      
      // Move start position for next chunk, accounting for overlap
      start = end - overlapSize
      chunkIndex++
    }
    
    return chunks
  }

  private cleanChunkBoundaries(content: string, hasPrefix: boolean, hasSuffix: boolean): string {
    let cleaned = content.trim()
    
    // If this chunk has a prefix (not the first chunk), try to start at a good boundary
    if (hasPrefix) {
      // Try to find the start of a sentence or new line
      const sentenceStart = cleaned.search(/[.!?]\s+[A-Z]/)
      const lineStart = cleaned.indexOf('\n')
      
      if (sentenceStart > 0 && sentenceStart < 100) {
        cleaned = cleaned.slice(sentenceStart + 2)
      } else if (lineStart > 0 && lineStart < 100) {
        cleaned = cleaned.slice(lineStart + 1)
      }
    }
    
    // If this chunk has a suffix (not the last chunk), try to end at a good boundary
    if (hasSuffix) {
      // Try to find the end of a sentence or line
      const sentences = cleaned.split(/[.!?]/)
      if (sentences.length > 1) {
        // Keep all complete sentences
        cleaned = sentences.slice(0, -1).join('.') + '.'
      } else {
        // Try to break at line boundaries
        const lines = cleaned.split('\n')
        if (lines.length > 1) {
          cleaned = lines.slice(0, -1).join('\n')
        }
      }
    }
    
    return cleaned.trim()
  }

  public estimateTokens(text: string): number {
    return this.encoder.encode(text).length
  }

  public dispose(): void {
    if (this.encoder) {
      this.encoder.free()
    }
  }
}