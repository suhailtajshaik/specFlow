import { readFileSync, existsSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, relative } from 'path';
import type { RoughInput, PrepareState } from './types.js';

export class SpecScanner {
  private baseDir: string;

  constructor(baseDir: string = './requirements') {
    this.baseDir = baseDir;
  }

  async scanForRoughSpecs(): Promise<RoughInput[]> {
    const inputs: RoughInput[] = [];

    // Look for any markdown files, text files, or notes in the requirements directory
    const patterns = [
      join(this.baseDir, '**/*.md'),
      join(this.baseDir, '**/*.txt'),
      join(this.baseDir, '**/*.notes'),
      join(this.baseDir, '**/*.spec'),
      join(this.baseDir, '**/README*'),
    ];

    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/.git/**'] });
        
        for (const filePath of files) {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const content = readFileSync(filePath, 'utf-8');
            const input = this.classifyInput(filePath, content);
            inputs.push(input);
          }
        }
      } catch (error) {
        // Ignore glob errors for patterns that don't match
        continue;
      }
    }

    // If no files found, look in current directory for any notes or specs
    if (inputs.length === 0) {
      try {
        const currentDirFiles = await glob('./*.{md,txt,spec,notes}');
        for (const filePath of currentDirFiles) {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const content = readFileSync(filePath, 'utf-8');
            const input = this.classifyInput(filePath, content);
            inputs.push(input);
          }
        }
      } catch (error) {
        // No files in current directory
      }
    }

    return inputs;
  }

  private classifyInput(filePath: string, content: string): RoughInput {
    const relativePath = relative(process.cwd(), filePath);
    
    // Try to determine if this looks like a partial spec vs completely rough input
    const hasYamlFrontmatter = content.trim().startsWith('---');
    const hasBusinessRulePattern = /BR-\d+:|Business Rule|## Business Rules/i.test(content);
    const hasApiContractPattern = /POST|GET|PUT|DELETE|PATCH|\bapi\b|endpoint|contract/i.test(content);
    const hasSchemaPattern = /\{[\s\S]*"type"[\s\S]*\}|schema|properties/i.test(content);
    
    let type: 'rough' | 'partial' | 'unknown' = 'rough';
    
    if (hasYamlFrontmatter && (hasBusinessRulePattern || hasApiContractPattern)) {
      type = 'partial';
    } else if (hasBusinessRulePattern || hasApiContractPattern || hasSchemaPattern) {
      type = 'partial';
    }

    return {
      filePath: relativePath,
      content: content.trim(),
      type
    };
  }

  checkPrepareState(): PrepareState | null {
    const stateFile = join(this.baseDir, '.specflow-prepared');
    
    if (!existsSync(stateFile)) {
      return null;
    }

    try {
      const stateContent = readFileSync(stateFile, 'utf-8');
      return JSON.parse(stateContent) as PrepareState;
    } catch (error) {
      return null;
    }
  }

  writePrepareState(state: PrepareState): void {
    const stateFile = join(this.baseDir, '.specflow-prepared');
    const stateContent = JSON.stringify(state, null, 2);
    
    try {
      // Ensure directory exists
      const fs = require('fs');
      fs.mkdirSync(require('path').dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, stateContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write prepare state: ${error}`);
    }
  }

  /**
   * Scan for existing professional specs (already prepared .req.md and .contract.md files).
   * Used to provide context when preparing new specs — avoids duplicates and enables cross-referencing.
   */
  async scanExistingSpecs(): Promise<{ businessReqs: RoughInput[]; contracts: RoughInput[]; schemas: RoughInput[] }> {
    const businessReqs: RoughInput[] = [];
    const contracts: RoughInput[] = [];
    const schemas: RoughInput[] = [];

    // Scan business requirements
    const reqFiles = await glob(join(this.baseDir, 'business/**/*.req.md'), { ignore: ['**/node_modules/**'] }).catch(() => []);
    for (const filePath of reqFiles) {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const content = readFileSync(filePath, 'utf-8');
        businessReqs.push({ filePath: relative(process.cwd(), filePath), content: content.trim(), type: 'partial' });
      }
    }

    // Scan API contracts
    const contractFiles = await glob(join(this.baseDir, 'technical/**/*.contract.md'), { ignore: ['**/node_modules/**'] }).catch(() => []);
    for (const filePath of contractFiles) {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const content = readFileSync(filePath, 'utf-8');
        contracts.push({ filePath: relative(process.cwd(), filePath), content: content.trim(), type: 'partial' });
      }
    }

    // Scan schemas
    const schemaFiles = await glob(join(this.baseDir, 'schemas/**/*.json'), { ignore: ['**/node_modules/**'] }).catch(() => []);
    for (const filePath of schemaFiles) {
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const content = readFileSync(filePath, 'utf-8');
        schemas.push({ filePath: relative(process.cwd(), filePath), content: content.trim(), type: 'partial' });
      }
    }

    return { businessReqs, contracts, schemas };
  }

  removePrepareState(): void {
    const stateFile = join(this.baseDir, '.specflow-prepared');
    
    try {
      const fs = require('fs');
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }
    } catch (error) {
      // Ignore errors when removing state file
    }
  }
}

export function createSpecScanner(requirementsDir?: string): SpecScanner {
  return new SpecScanner(requirementsDir);
}