import { join, dirname } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type { LLMProvider } from '../llm/provider.js';
import type { ScanResult, ScannedEndpoint } from './index.js';

interface GeneratedSpec {
  reqMd: string;
  contractMd: string;
}

export class SpecWriter {
  constructor(private provider: LLMProvider) {}

  async writeSpecs(scanResult: ScanResult, outputDir: string): Promise<string[]> {
    const writtenFiles: string[] = [];
    
    for (const endpoint of scanResult.endpoints) {
      try {
        const specs = await this.generateSpecsForEndpoint(
          endpoint, 
          scanResult.framework, 
          scanResult.models
        );
        
        const files = await this.writeSpecFiles(endpoint, specs, outputDir);
        writtenFiles.push(...files);
      } catch (error) {
        console.warn(`Failed to generate specs for ${endpoint.method} ${endpoint.path}:`, error);
        // Continue with other endpoints
      }
    }
    
    return writtenFiles;
  }

  private async generateSpecsForEndpoint(
    endpoint: ScannedEndpoint, 
    framework: string, 
    models: any[]
  ): Promise<GeneratedSpec> {
    const prompt = this.buildAnalysisPrompt(endpoint, framework, models);
    
    const systemPrompt = 'You are an expert backend developer who analyzes API code and generates professional SpecFlow specification files.';
    const response = await this.provider.generate(systemPrompt, prompt);

    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          reqMd: result.reqMd || '',
          contractMd: result.contractMd || ''
        };
      }
    } catch (error) {
      console.warn('Failed to parse LLM response as JSON, attempting fallback parsing');
    }

    // Fallback: try to extract markdown sections
    const reqMatch = response.match(/```(?:markdown)?\n([\s\S]*?)```[\s\S]*?```(?:markdown)?\n([\s\S]*?)```/);
    if (reqMatch) {
      return {
        reqMd: reqMatch[1].trim(),
        contractMd: reqMatch[2].trim()
      };
    }

    throw new Error('Could not parse LLM response into valid specifications');
  }

  private buildAnalysisPrompt(endpoint: ScannedEndpoint, framework: string, models: any[]): string {
    const modelsContext = models.length > 0 
      ? `\n\nDATABASE MODELS:\n${models.map(m => 
          `${m.name}: ${m.fields.map((f: any) => `${f.name} (${f.type}${f.required ? ', required' : ', optional'})`).join(', ')}`
        ).join('\n')}`
      : '';

    return `Analyze this API endpoint code and generate SpecFlow specification files.

ENDPOINT: ${endpoint.method} ${endpoint.path}
FRAMEWORK: ${framework}
SOURCE FILE: ${endpoint.sourceFile}

HANDLER CODE:
\`\`\`
${endpoint.sourceCode}
\`\`\`

MIDDLEWARE: ${endpoint.middleware.join(', ') || 'None'}
${modelsContext}

Generate two SpecFlow files based on this code analysis:

1. **Business Requirement (.req.md)** - Extract business logic and rules from the code
2. **API Contract (.contract.md)** - Define the technical API specification

Guidelines:
- Extract actual business rules from conditional logic, validation, and data manipulation
- Infer request/response schemas from the code patterns
- Identify error conditions and edge cases
- Use proper SpecFlow frontmatter format
- Be specific and technical, not generic

Return ONLY a valid JSON object with this structure:
\`\`\`json
{
  "reqMd": "---\\nid: business-rule-id\\ntitle: Business Rule Title\\ndomain: api\\ntype: business_requirement\\nstatus: active\\n---\\n\\n# Title\\n\\n## Business Rules\\n\\n**BR-1:** Specific rule extracted from code...\\n\\n**BR-2:** Another rule...\\n\\n## Edge Cases\\n\\n- Edge case 1\\n- Edge case 2",
  "contractMd": "---\\nid: contract-id\\nmethod: GET\\npath: /path\\ntype: api_contract\\nrequires_auth: true\\nrate_limit: 100\\n---\\n\\n# API Contract Title\\n\\n## Request Schema\\n\\n\`\`\`json\\n{\\n  \\"type\\": \\"object\\",\\n  \\"properties\\": {...}\\n}\\n\`\`\`\\n\\n## Response Schema\\n\\n\`\`\`json\\n{\\n  \\"type\\": \\"object\\",\\n  \\"properties\\": {...}\\n}\\n\`\`\`\\n\\n## Error Responses\\n\\n| Status | Condition | Response |\\n|--------|-----------|----------|\\n| 400    | Bad Request | ... |"
}
\`\`\``;
  }

  private async writeSpecFiles(endpoint: ScannedEndpoint, specs: GeneratedSpec, outputDir: string): Promise<string[]> {
    const writtenFiles: string[] = [];
    
    // Generate file names based on endpoint
    const pathSegments = endpoint.path.split('/').filter(Boolean);
    const cleanPath = pathSegments
      .map(segment => segment.replace(/[{:}]/g, '').replace(/\W+/g, '-'))
      .filter(Boolean)
      .join('-') || 'root';
    
    const methodLower = endpoint.method.toLowerCase();
    const baseName = `${methodLower}-${cleanPath}`;
    
    // Business requirement file
    if (specs.reqMd) {
      const reqDir = join(outputDir, 'business');
      const reqFile = join(reqDir, `${baseName}.req.md`);
      
      await this.ensureDirectoryExists(reqDir);
      await writeFile(reqFile, specs.reqMd, 'utf8');
      writtenFiles.push(reqFile);
    }
    
    // API contract file
    if (specs.contractMd) {
      const contractDir = join(outputDir, 'technical');
      const contractFile = join(contractDir, `${baseName}.contract.md`);
      
      await this.ensureDirectoryExists(contractDir);
      await writeFile(contractFile, specs.contractMd, 'utf8');
      writtenFiles.push(contractFile);
    }
    
    return writtenFiles;
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
}