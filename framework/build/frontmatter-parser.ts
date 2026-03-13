import matter from 'gray-matter'

export interface FrontmatterData {
  method?: string
  path?: string
  domain?: string
  type?: string
  status?: string
  requires_auth?: boolean
  rate_limit?: string
  [key: string]: any
}

export interface ParsedDocument {
  content: string
  frontmatter: FrontmatterData
  filePath: string
}

export function parseFrontmatter(content: string, filePath: string): ParsedDocument {
  try {
    const parsed = matter(content)
    
    // Extract frontmatter data
    const frontmatter: FrontmatterData = {
      ...parsed.data,
      // Infer some metadata from file path if not explicitly set
      type: parsed.data.type || inferTypeFromPath(filePath),
      status: parsed.data.status || 'active',
      domain: parsed.data.domain || inferDomainFromPath(filePath)
    }
    
    // Clean content (remove frontmatter block)
    const cleanContent = parsed.content.trim()
    
    return {
      content: cleanContent,
      frontmatter,
      filePath
    }
  } catch (error) {
    console.warn(`Failed to parse frontmatter from ${filePath}:`, error)
    
    // Fallback: return content as-is with minimal metadata
    return {
      content,
      frontmatter: {
        type: inferTypeFromPath(filePath),
        status: 'active',
        domain: inferDomainFromPath(filePath)
      },
      filePath
    }
  }
}

function inferTypeFromPath(filePath: string): string {
  if (filePath.endsWith('.contract.md')) return 'contract'
  if (filePath.endsWith('.req.md')) return 'requirement'
  if (filePath.includes('/technical/')) return 'contract'
  if (filePath.includes('/business/')) return 'requirement'
  return 'document'
}

function inferDomainFromPath(filePath: string): string {
  // Extract domain from path like /auth/, /orders/, etc.
  const pathParts = filePath.split('/')
  
  // Look for common domain indicators
  for (const part of pathParts) {
    if (part && !['requirements', 'business', 'technical', 'schemas'].includes(part) && part.length > 2) {
      return part
    }
  }
  
  return 'general'
}

export function validateFrontmatter(frontmatter: FrontmatterData, filePath: string): boolean {
  // Basic validation rules
  if (frontmatter.type === 'contract') {
    if (!frontmatter.method) {
      console.warn(`Contract ${filePath} missing required 'method' field`)
      return false
    }
    if (!frontmatter.path) {
      console.warn(`Contract ${filePath} missing required 'path' field`)
      return false
    }
    
    // Validate method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
    if (!validMethods.includes(frontmatter.method.toUpperCase())) {
      console.warn(`Contract ${filePath} has invalid method: ${frontmatter.method}`)
      return false
    }
    
    // Normalize path
    if (!frontmatter.path.startsWith('/')) {
      frontmatter.path = '/' + frontmatter.path
    }
  }
  
  // Validate status
  const validStatuses = ['active', 'inactive', 'draft', 'deprecated']
  if (frontmatter.status && !validStatuses.includes(frontmatter.status)) {
    console.warn(`Document ${filePath} has invalid status: ${frontmatter.status}`)
    frontmatter.status = 'active' // default fallback
  }
  
  return true
}