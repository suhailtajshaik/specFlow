import { join } from 'path';
import type { SpecFlowConfig } from './config/types.js';
import { SpecAnalyzer, type ExistingContext } from './prepare/analyzer.js';
import { SpecRefiner, type RefinedSpecs } from './prepare/refiner.js';
import { SpecWriter } from './prepare/writer.js';
import { SpecScanner } from './parser/spec-scanner.js';
import { GeneratorEngine, type GeneratedFile } from './generator/index.js';
import { createProvider, type LLMProvider, type LLMConfig } from './llm/provider.js';
import { loadConfig } from './config/loader.js';

export interface SpecFlowOptions {
  /** LLM provider: 'claude' | 'gemini' | 'llamacpp' */
  provider?: string;
  /** API key for the LLM provider */
  apiKey?: string;
  /** Model name override */
  model?: string;
  /** Working directory (where requirements/ lives) */
  cwd?: string;
  /** Config file path or inline config */
  config?: string | Partial<SpecFlowConfig>;
}

export interface PrepareOptions {
  /** Skip interactive questions, use defaults */
  auto?: boolean;
  /** Force re-prepare even if already prepared */
  force?: boolean;
}

export interface GenerateOptions {
  /** Skip prepare check */
  force?: boolean;
  /** Dry run — return files without writing */
  dryRun?: boolean;
  /** Output directory override */
  outputDir?: string;
}

export interface ScanOptions {
  /** Project directory to scan */
  projectDir: string;
  /** Languages to scan for: 'typescript' | 'python' | 'java' | 'auto' */
  language?: string;
  /** Output directory for generated specs */
  outputDir?: string;
}

export interface PrepareResult {
  analysis: any;
  questions: any[];
  refinedSpecs: RefinedSpecs;
  filesWritten: string[];
}

export interface GenerateResult {
  files: GeneratedFile[];
  filesWritten: string[];
  stats: {
    routes: number;
    schemas: number;
    tests: number;
    configs: number;
    scaffolds: number;
    total: number;
  };
}

export interface ScanResult {
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
  specsGenerated: string[];
  language: string;
}

export class SpecFlow {
  private config: SpecFlowConfig;
  private provider: LLMProvider | null = null;
  private cwd: string;
  private providerConfig: LLMConfig;

  constructor(options: SpecFlowOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    
    // Load config
    const configPath = join(this.cwd, 'specflow.config.yaml');
    this.config = loadConfig(configPath);
    
    // Apply overrides
    if (options.config && typeof options.config === 'object') {
      Object.assign(this.config, options.config);
    }
    
    // Set up LLM provider config
    const providerName = options.provider || this.config.llm?.provider || 'gemini';
    const apiKey = options.apiKey || this.config.llm?.apiKey || '';
    const model = options.model || this.config.llm?.model || '';
    
    this.providerConfig = {
      provider: providerName as 'gemini' | 'claude' | 'llamacpp',
      apiKey,
      model
    };
  }

  private async ensureProvider(): Promise<LLMProvider> {
    if (!this.provider) {
      this.provider = await createProvider(this.providerConfig);
    }
    return this.provider;
  }

  /**
   * Prepare rough specifications into professional specs.
   * Reads rough .md files from requirements/, analyzes them,
   * and generates professional .req.md and .contract.md files.
   */
  async prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
    const provider = await this.ensureProvider();
    const scanner = new SpecScanner(
      join(this.cwd, this.config.requirements.directory)
    );
    
    // Scan existing specs for context
    const existingContext = await scanner.scanExistingSpecs();
    
    // Scan rough inputs
    const roughInputs = await scanner.scanForRoughSpecs();
    
    if (roughInputs.length === 0) {
      throw new Error('No rough specifications found in requirements/ directory');
    }
    
    // Analyze
    const analyzer = new SpecAnalyzer(provider);
    if (existingContext.businessReqs.length > 0 || existingContext.contracts.length > 0) {
      analyzer.setExistingContext(existingContext);
    }
    
    const analysis = await analyzer.analyzeRoughSpecs(roughInputs);
    
    // Refine
    const refiner = new SpecRefiner(provider);
    if (existingContext.businessReqs.length > 0 || existingContext.contracts.length > 0) {
      refiner.setExistingContext(existingContext);
    }
    
    const answers = options.auto ? this.getDefaultAnswers(analysis.questions) : {};
    const refinedSpecs = await refiner.refineSpecs(analysis, answers);
    
    // Write specs
    const writer = new SpecWriter(join(this.cwd, this.config.requirements.directory));
    const filesWritten = await writer.writeRefinedSpecs(refinedSpecs);
    
    // Mark as prepared
    const state = {
      isPrepared: true,
      timestamp: new Date().toISOString(),
      version: '1.0',
      inputFiles: roughInputs.map(r => r.filePath),
      outputFiles: filesWritten,
      checksum: ''
    };
    scanner.writePrepareState(state);
    
    return { analysis, questions: analysis.questions, refinedSpecs, filesWritten };
  }

  /**
   * Generate production backend code from prepared specifications.
   */
  async generate(options: GenerateOptions = {}): Promise<GenerateResult> {
    const provider = await this.ensureProvider();
    const engine = new GeneratorEngine(this.config, provider);
    
    // Generate all files
    const files = await engine.generate();
    
    let filesWritten: string[] = [];
    
    if (!options.dryRun) {
      // Write files to disk
      const outputDir = options.outputDir || this.config.output.directory;
      // Update config temporarily if outputDir overridden
      if (options.outputDir) {
        this.config.output.directory = options.outputDir;
      }
      await engine.writeFiles(files);
      filesWritten = files.map(f => f.path);
    }
    
    // Compute stats
    const stats = {
      routes: files.filter(f => f.type === 'route').length,
      schemas: files.filter(f => f.type === 'schema').length,
      tests: files.filter(f => f.type === 'test').length,
      configs: files.filter(f => f.type === 'config').length,
      scaffolds: files.filter(f => f.type === 'scaffold').length,
      total: files.length,
    };
    
    return { files, filesWritten, stats };
  }

  /**
   * Scan an existing project and generate specs from its codebase.
   */
  async scan(options: ScanOptions): Promise<ScanResult> {
    const provider = await this.ensureProvider();
    const { ProjectScanner } = await import('./scanner/index.js');
    const { SpecWriter } = await import('./scanner/spec-writer.js');
    
    const scanner = new ProjectScanner(provider);
    const scanResult = await scanner.scan(options.projectDir, options.language);
    
    // Generate spec files from scan results
    const specWriter = new SpecWriter(provider);
    const outputDir = options.outputDir || join(this.cwd, this.config.requirements.directory);
    const specsGenerated = await specWriter.writeSpecs(scanResult, outputDir);
    
    return {
      endpoints: scanResult.endpoints.map(e => ({
        method: e.method,
        path: e.path,
        description: e.description || ''
      })),
      specsGenerated,
      language: scanResult.language
    };
  }

  /**
   * List all endpoints from prepared specs.
   */
  async listEndpoints(): Promise<Array<{ method: string; path: string; domain: string; title: string }>> {
    const scanner = new SpecScanner(
      join(this.cwd, this.config.requirements.directory)
    );
    const existing = await scanner.scanExistingSpecs();
    
    const endpoints = [];
    for (const contract of existing.contracts) {
      // Parse frontmatter to get method, path
      const lines = contract.content.split('\n');
      let method = '', path = '', domain = '', title = '';
      
      let inFrontmatter = false;
      for (const line of lines) {
        if (line.trim() === '---') {
          inFrontmatter = !inFrontmatter;
          continue;
        }
        if (inFrontmatter) {
          const match = line.match(/^(\w+):\s*(.+)/);
          if (match) {
            const [, key, value] = match;
            if (key === 'method') method = value.trim().replace(/"/g, '');
            if (key === 'path') path = value.trim().replace(/"/g, '');
            if (key === 'domain') domain = value.trim().replace(/"/g, '');
            if (key === 'title') title = value.trim().replace(/"/g, '');
          }
        }
      }
      
      if (method && path) {
        endpoints.push({ method, path, domain, title });
      }
    }
    
    return endpoints;
  }

  private getDefaultAnswers(questions: any[]): Record<string, string> {
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id || q.question] = q.default || 'yes';
    }
    return answers;
  }
}