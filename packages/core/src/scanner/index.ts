import { join, relative } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { LLMProvider } from '../llm/provider.js';
import { TypeScriptParser } from './languages/typescript.js';
import { PythonParser } from './languages/python.js';
import { JavaParser } from './languages/java.js';
import { SpecWriter } from './spec-writer.js';

export interface ScannedEndpoint {
  method: string;           // GET, POST, PUT, DELETE, PATCH
  path: string;             // /api/v1/users/:id
  handler: string;          // The function/method name
  sourceFile: string;       // Where it was found
  sourceCode: string;       // The actual handler code
  middleware: string[];      // Auth, validation, rate limiting
  requestSchema?: any;       // Inferred from validation or types
  responseSchema?: any;      // Inferred from return types
  description?: string;      // From comments or JSDoc
}

export interface ScannedModel {
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
  sourceFile: string;
}

export interface ScanResult {
  language: string;
  framework: string;
  endpoints: ScannedEndpoint[];
  models: ScannedModel[];
  dependencies: Record<string, string>;
}

export interface LanguageParser {
  parseProject(projectDir: string): Promise<{
    framework: string;
    endpoints: ScannedEndpoint[];
    models: ScannedModel[];
  }>;
}

export class ProjectScanner {
  constructor(private provider: LLMProvider) {}

  async scan(projectDir: string, language?: string): Promise<ScanResult> {
    const detectedLanguage = language || await this.detectLanguage(projectDir);
    const dependencies = await this.getDependencies(projectDir, detectedLanguage);
    
    const parser = this.getLanguageParser(detectedLanguage);
    if (!parser) {
      throw new Error(`Unsupported language: ${detectedLanguage}`);
    }

    const result = await parser.parseProject(projectDir);
    
    return {
      language: detectedLanguage,
      framework: result.framework,
      endpoints: result.endpoints,
      models: result.models,
      dependencies
    };
  }

  private async detectLanguage(projectDir: string): Promise<string> {
    // Check for package.json (Node.js/TypeScript)
    if (existsSync(join(projectDir, 'package.json'))) {
      const packageJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Look for Node.js frameworks
      const nodeFrameworks = ['express', 'hono', 'fastify', '@nestjs/core', 'koa'];
      if (nodeFrameworks.some(fw => deps[fw])) {
        return 'typescript';
      }
    }

    // Check for Python files
    if (existsSync(join(projectDir, 'requirements.txt')) || 
        existsSync(join(projectDir, 'pyproject.toml')) ||
        existsSync(join(projectDir, 'Pipfile'))) {
      return 'python';
    }

    // Check for Java files  
    if (existsSync(join(projectDir, 'pom.xml')) || 
        existsSync(join(projectDir, 'build.gradle')) ||
        existsSync(join(projectDir, 'build.gradle.kts'))) {
      return 'java';
    }

    // Fallback: check for actual source files
    const files = await this.getSourceFiles(projectDir);
    const hasTsFiles = files.some(f => f.endsWith('.ts') || f.endsWith('.js'));
    const hasPyFiles = files.some(f => f.endsWith('.py'));
    const hasJavaFiles = files.some(f => f.endsWith('.java'));

    if (hasTsFiles) return 'typescript';
    if (hasPyFiles) return 'python'; 
    if (hasJavaFiles) return 'java';

    throw new Error('Could not detect project language. Try specifying --language explicitly.');
  }

  private getLanguageParser(language: string): LanguageParser | null {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return new TypeScriptParser();
      case 'python':
        return new PythonParser();
      case 'java':
        return new JavaParser();
      default:
        return null;
    }
  }

  private async getDependencies(projectDir: string, language: string): Promise<Record<string, string>> {
    try {
      switch (language) {
        case 'typescript':
        case 'javascript':
          if (existsSync(join(projectDir, 'package.json'))) {
            const packageJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'));
            return { ...packageJson.dependencies, ...packageJson.devDependencies };
          }
          break;
        case 'python':
          // Parse requirements.txt or pyproject.toml
          if (existsSync(join(projectDir, 'requirements.txt'))) {
            const requirements = await readFile(join(projectDir, 'requirements.txt'), 'utf8');
            const deps: Record<string, string> = {};
            for (const line of requirements.split('\n')) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith('#')) {
                const [name, version] = trimmed.split('==');
                deps[name] = version || '*';
              }
            }
            return deps;
          }
          break;
        case 'java':
          // Would need XML/Gradle parsing, skip for now
          break;
      }
    } catch (error) {
      console.warn('Failed to parse dependencies:', error);
    }
    return {};
  }

  private async getSourceFiles(projectDir: string, extensions: string[] = ['.ts', '.js', '.py', '.java']): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', '__pycache__', '.git', 'dist', 'build', 'target', '.next', 'coverage'];

    async function walk(dir: string): Promise<void> {
      const items = await readdir(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          if (!excludeDirs.includes(item) && !item.startsWith('.')) {
            await walk(fullPath);
          }
        } else if (stats.isFile()) {
          if (extensions.some(ext => fullPath.endsWith(ext))) {
            files.push(relative(projectDir, fullPath));
          }
        }
      }
    }

    await walk(projectDir);
    return files;
  }
}