import type { RoughInput, PrepareAnalysis, PrepareQuestion } from '../parser/types.js';
import type { LLMProvider } from '../llm/provider.js';
import { PREPARE_ANALYZE_PROMPT } from '../llm/prompts/prepare-analyze.js';

export interface ExistingContext {
  businessReqs: RoughInput[];
  contracts: RoughInput[];
  schemas: RoughInput[];
}

export class SpecAnalyzer {
  private existingContext: ExistingContext | null = null;

  constructor(private llm: LLMProvider) {}

  setExistingContext(context: ExistingContext): void {
    this.existingContext = context;
  }

  async analyzeRoughSpecs(inputs: RoughInput[]): Promise<PrepareAnalysis> {
    if (inputs.length === 0) {
      return {
        roughInputs: [],
        identifiedDomains: [],
        suggestedStructure: {
          businessRequirements: [],
          apiContracts: [],
          sharedSchemas: {}
        },
        questions: [],
        warnings: ['No specification files found. Add .md files to requirements/ directory.']
      };
    }

    // Combine all input content for analysis
    const combinedContent = inputs.map(input => 
      `=== File: ${input.filePath} ===\n${input.content}\n`
    ).join('\n');

    // Build existing context summary to avoid duplicates and enable cross-referencing
    let existingContextSection = '';
    if (this.existingContext) {
      const { businessReqs, contracts, schemas } = this.existingContext;
      if (businessReqs.length > 0 || contracts.length > 0 || schemas.length > 0) {
        existingContextSection = `\n\n=== EXISTING SPECIFICATIONS (already prepared — DO NOT recreate these) ===\n`;
        
        if (businessReqs.length > 0) {
          existingContextSection += `\n--- Existing Business Requirements ---\n`;
          existingContextSection += businessReqs.map(r => 
            `File: ${r.filePath}\n${r.content}\n`
          ).join('\n---\n');
        }
        
        if (contracts.length > 0) {
          existingContextSection += `\n--- Existing API Contracts ---\n`;
          existingContextSection += contracts.map(c => 
            `File: ${c.filePath}\n${c.content}\n`
          ).join('\n---\n');
        }
        
        if (schemas.length > 0) {
          existingContextSection += `\n--- Existing Schemas ---\n`;
          existingContextSection += schemas.map(s => 
            `File: ${s.filePath}\n${s.content}\n`
          ).join('\n---\n');
        }

        existingContextSection += `\n=== END EXISTING SPECIFICATIONS ===\n`;
      }
    }

    const userPrompt = `Please analyze these rough specifications and suggest a professional structure:

${combinedContent}
${existingContextSection}

CRITICAL RULES:
1. DO NOT create duplicate specs for endpoints/features that already exist in the "EXISTING SPECIFICATIONS" section above.
2. If a rough input describes something that overlaps with an existing spec, suggest UPDATING the existing spec instead of creating a new one.
3. Cross-reference new specs with existing ones (e.g., if an existing auth spec exists, new order specs should reference it for authentication).
4. Reuse existing IDs, domains, and naming conventions from the existing specs.
5. If existing schemas exist, extend them rather than creating conflicting new ones.

Provide a detailed analysis that will help transform these rough ideas into production-ready API specifications.`;

    try {
      const analysis = await this.llm.generateJSON<PrepareAnalysis>(
        PREPARE_ANALYZE_PROMPT,
        userPrompt
      );

      // Validate and enhance the analysis
      return this.enhanceAnalysis(analysis, inputs);
    } catch (error) {
      throw new Error(`Failed to analyze specifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private enhanceAnalysis(analysis: PrepareAnalysis, inputs: RoughInput[]): PrepareAnalysis {
    // Ensure we have the rough inputs
    analysis.roughInputs = inputs;

    // Add default questions if none were generated
    if (analysis.questions.length === 0) {
      analysis.questions = this.generateDefaultQuestions(analysis);
    }

    // Add standard warnings if not present
    const standardWarnings = [
      'Error handling scenarios will be added to API contracts',
      'Rate limiting will be applied to authentication endpoints',
      'Standard security headers will be included'
    ];

    analysis.warnings = [...(analysis.warnings || []), ...standardWarnings];

    // Validate business requirements structure
    analysis.suggestedStructure.businessRequirements = 
      analysis.suggestedStructure.businessRequirements.map(req => ({
        ...req,
        confidence: req.confidence || 'medium'
      }));

    // Validate API contracts structure  
    analysis.suggestedStructure.apiContracts = 
      analysis.suggestedStructure.apiContracts.map(contract => ({
        ...contract,
        confidence: contract.confidence || 'medium'
      }));

    return analysis;
  }

  private generateDefaultQuestions(analysis: PrepareAnalysis): PrepareQuestion[] {
    const questions: PrepareQuestion[] = [];

    // If auth domain is present, ask about password policy
    if (analysis.identifiedDomains.includes('auth')) {
      questions.push({
        id: 'password_policy',
        type: 'text',
        message: 'What password requirements should be enforced? (e.g., 8+ chars, uppercase, special chars)',
        default: 'Minimum 8 characters, at least one uppercase, lowercase, digit, and special character',
        context: 'Authentication domain identified but no password policy specified',
        category: 'security'
      });

      questions.push({
        id: 'rate_limiting',
        type: 'select',
        message: 'Rate limiting for authentication endpoints:',
        choices: [
          '5 requests per 15 minutes',
          '10 requests per 15 minutes', 
          '3 requests per 15 minutes (strict)',
          'No rate limiting'
        ],
        default: '5 requests per 15 minutes',
        context: 'Authentication endpoints need rate limiting for security',
        category: 'security'
      });
    }

    // General error handling question
    questions.push({
      id: 'error_format',
      type: 'select',
      message: 'Error response format preference:',
      choices: [
        'Simple: { "error": "message" }',
        'Detailed: { "error": { "code": "ERROR_CODE", "message": "details", "field": "fieldName" } }',
        'RFC 7807 Problem Details'
      ],
      default: 'Detailed: { "error": { "code": "ERROR_CODE", "message": "details", "field": "fieldName" } }',
      context: 'Standardizing error response format across all endpoints',
      category: 'technical'
    });

    // Database question if not specified
    questions.push({
      id: 'database_considerations',
      type: 'multiselect',
      message: 'Additional database considerations:',
      choices: [
        'Add audit logging (createdAt, updatedAt fields)',
        'Add soft delete support (deletedAt field)',
        'Add database indexes for performance',
        'Add foreign key constraints',
        'Add database migrations'
      ],
      default: ['Add audit logging (createdAt, updatedAt fields)', 'Add database indexes for performance'],
      context: 'Database schema design considerations',
      category: 'technical'
    });

    return questions;
  }
}