import type { RoughInput, PrepareAnalysis, PrepareQuestion } from '../parser/types.js';
import type { LLMProvider } from '../llm/provider.js';
import { PREPARE_ANALYZE_PROMPT } from '../llm/prompts/prepare-analyze.js';

export class SpecAnalyzer {
  constructor(private llm: LLMProvider) {}

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

    const userPrompt = `Please analyze these rough specifications and suggest a professional structure:

${combinedContent}

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