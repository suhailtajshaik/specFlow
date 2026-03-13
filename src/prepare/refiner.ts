import type { PrepareAnalysis, PrepareAnswers, BusinessRequirement, ApiContract, JsonSchema } from '../parser/types.js';
import type { LLMProvider } from '../llm/provider.js';
import { PREPARE_REFINE_PROMPT } from '../llm/prompts/prepare-analyze.js';

export interface RefinedSpecs {
  businessRequirements: Record<string, string>; // filepath -> content
  apiContracts: Record<string, string>; // filepath -> content  
  sharedSchemas: Record<string, string>; // filepath -> content
}

export class SpecRefiner {
  constructor(private llm: LLMProvider) {}

  async refineSpecs(
    analysis: PrepareAnalysis, 
    answers: PrepareAnswers
  ): Promise<RefinedSpecs> {
    const userPrompt = this.buildRefinePrompt(analysis, answers);

    try {
      const refined = await this.llm.generateJSON<RefinedSpecs>(
        PREPARE_REFINE_PROMPT,
        userPrompt
      );

      return this.validateAndEnhanceRefined(refined);
    } catch (error) {
      throw new Error(`Failed to refine specifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildRefinePrompt(analysis: PrepareAnalysis, answers: PrepareAnswers): string {
    const roughContent = analysis.roughInputs.map(input => 
      `=== ${input.filePath} ===\n${input.content}`
    ).join('\n\n');

    const analysisJson = JSON.stringify({
      identifiedDomains: analysis.identifiedDomains,
      suggestedStructure: analysis.suggestedStructure
    }, null, 2);

    const answersText = Object.entries(answers)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('\n');

    return `Transform these rough specifications into professional requirements and contracts.

ORIGINAL ROUGH INPUT:
${roughContent}

ANALYSIS RESULTS:
${analysisJson}

USER ANSWERS TO QUESTIONS:
${answersText}

Generate complete, professional specification files with:
- Proper YAML frontmatter
- Detailed business rules (BR-1, BR-2, etc.)
- Complete JSON schemas with validation
- Error handling scenarios
- Security considerations
- Cross-references between requirements and contracts

Follow the exact format specified in the system prompt.`;
  }

  private validateAndEnhanceRefined(refined: RefinedSpecs): RefinedSpecs {
    // Validate that we have content for each file
    for (const [filePath, content] of Object.entries(refined.businessRequirements)) {
      if (!content || content.trim().length === 0) {
        throw new Error(`Empty content generated for business requirement: ${filePath}`);
      }
    }

    for (const [filePath, content] of Object.entries(refined.apiContracts)) {
      if (!content || content.trim().length === 0) {
        throw new Error(`Empty content generated for API contract: ${filePath}`);
      }
    }

    for (const [filePath, content] of Object.entries(refined.sharedSchemas)) {
      if (!content || content.trim().length === 0) {
        throw new Error(`Empty content generated for schema: ${filePath}`);
      }
      
      // Validate JSON schemas are valid JSON
      try {
        JSON.parse(content);
      } catch (error) {
        throw new Error(`Invalid JSON schema generated for ${filePath}: ${error}`);
      }
    }

    return refined;
  }
}