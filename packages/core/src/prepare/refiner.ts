import type { PrepareAnalysis, PrepareAnswers, BusinessRequirement, ApiContract, JsonSchema, RoughInput } from '../parser/types.js';
import type { LLMProvider } from '../llm/provider.js';
import type { ExistingContext } from './analyzer.js';
import { PREPARE_REFINE_PROMPT } from '../llm/prompts/prepare-analyze.js';

export interface RefinedSpecs {
  businessRequirements: Record<string, string>; // filepath -> content
  apiContracts: Record<string, string>; // filepath -> content  
  sharedSchemas: Record<string, string>; // filepath -> content
}

export class SpecRefiner {
  private existingContext: ExistingContext | null = null;

  constructor(private llm: LLMProvider) {}

  setExistingContext(context: ExistingContext): void {
    this.existingContext = context;
  }

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

    // Build existing context for the refiner
    let existingContextSection = '';
    if (this.existingContext) {
      const { businessReqs, contracts, schemas } = this.existingContext;
      if (businessReqs.length > 0 || contracts.length > 0 || schemas.length > 0) {
        existingContextSection = `\n\nEXISTING SPECIFICATIONS (already prepared — use as reference, do NOT recreate):\n`;
        
        if (businessReqs.length > 0) {
          existingContextSection += `\nExisting Business Requirements:\n`;
          existingContextSection += businessReqs.map(r => `- ${r.filePath}`).join('\n');
          existingContextSection += '\n\nExisting requirement details:\n';
          existingContextSection += businessReqs.map(r => `=== ${r.filePath} ===\n${r.content}`).join('\n\n');
        }
        
        if (contracts.length > 0) {
          existingContextSection += `\n\nExisting API Contracts:\n`;
          existingContextSection += contracts.map(c => `- ${c.filePath}`).join('\n');
          existingContextSection += '\n\nExisting contract details:\n';
          existingContextSection += contracts.map(c => `=== ${c.filePath} ===\n${c.content}`).join('\n\n');
        }
        
        if (schemas.length > 0) {
          existingContextSection += `\n\nExisting Schemas:\n`;
          existingContextSection += schemas.map(s => `- ${s.filePath}`).join('\n');
        }
      }
    }

    return `Transform these rough specifications into professional requirements and contracts.

ORIGINAL ROUGH INPUT:
${roughContent}

ANALYSIS RESULTS:
${analysisJson}

USER ANSWERS TO QUESTIONS:
${answersText}
${existingContextSection}

CRITICAL RULES:
1. DO NOT generate specs for endpoints/features that already exist in the "EXISTING SPECIFICATIONS" section.
2. If a rough input overlaps with an existing spec, generate ONLY the new/different parts.
3. Cross-reference new specs with existing ones (use related_requirement IDs, reference existing schemas).
4. Follow the same naming conventions, ID patterns, and domain structure as existing specs.
5. Reuse and extend existing schemas — do NOT create conflicting new schemas for the same entities.
6. New business rule IDs should continue from existing numbering (e.g., if BR-7 exists, start from BR-8).

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