import { SpecFlow, type ScanOptions as SDKScanOptions } from '@specflow/core';
import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { loadConfig, resolveApiKey } from '../config/loader.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface ScanOptions {
  language?: string;
  output?: string;
  provider?: 'gemini' | 'claude' | 'llamacpp';
}

export async function scanCommand(projectDir: string, options: ScanOptions = {}) {
  try {
    Logger.header('Scan Existing Codebase');

    // Validate project directory
    const fullProjectDir = resolve(projectDir);
    if (!existsSync(fullProjectDir)) {
      Logger.error(`Project directory does not exist: ${projectDir}`);
      return;
    }

    Logger.info(`Scanning project: ${fullProjectDir}`);

    // Load configuration
    const config = loadConfig();
    const llmProvider = options.provider || config.llm.provider;
    const apiKey = resolveApiKey(llmProvider, config.llm.apiKey);

    if (!apiKey) {
      Logger.error(`No API key found for ${llmProvider}`);
      Logger.info('Set the API key in your config or environment variable:');
      Logger.info(`• GEMINI_API_KEY for Gemini`);
      Logger.info(`• ANTHROPIC_API_KEY for Claude`);
      Logger.info(`• LLAMACPP_API_KEY for LlamaCpp`);
      return;
    }

    // Initialize SpecFlow SDK
    const specFlow = new SpecFlow({
      provider: llmProvider,
      apiKey,
      cwd: process.cwd()
    });

    // Scan the project using SDK
    const result = await Spinner.withSpinner('Scanning codebase and generating specifications...', async (spinner) => {
      spinner.updateText('Detecting project language...');
      
      const sdkOptions: SDKScanOptions = {
        projectDir: fullProjectDir,
        language: options.language,
        outputDir: options.output
      };
      
      spinner.updateText('Analyzing code structure...');
      const scanResult = await specFlow.scan(sdkOptions);
      
      spinner.updateText(`Found ${scanResult.endpoints.length} endpoints`);
      return scanResult;
    });

    Logger.success(`Scan completed successfully!`);
    Logger.info(`Language detected: ${result.language}`);
    Logger.info(`Found ${result.endpoints.length} API endpoints`);
    
    // Show endpoints discovered
    if (result.endpoints.length > 0) {
      Logger.header('Discovered Endpoints');
      for (const endpoint of result.endpoints) {
        Logger.info(`${endpoint.method.toUpperCase().padEnd(6)} ${endpoint.path}`);
        if (endpoint.description) {
          Logger.dim(`        ${endpoint.description}`);
        }
      }
    }

    // Show generated specifications
    if (result.specsGenerated.length > 0) {
      Logger.header('Generated Specifications');
      Logger.success(`Created ${result.specsGenerated.length} specification files:`);
      Logger.list(result.specsGenerated.map(f => f.replace(process.cwd() + '/', '')));
    }

    // Show next steps
    Logger.header('Next Steps');
    Logger.info('1. Review the generated specifications in the requirements/ directory');
    Logger.info('2. Edit and refine the specifications as needed');
    Logger.info('3. Run `specflow prepare` to convert them into professional specifications');
    Logger.info('4. Run `specflow generate` to create a new backend based on your existing API');

  } catch (error) {
    if (error instanceof Error && error.message.includes('not yet implemented')) {
      Logger.warning('🚧 Scan feature coming soon!');
      Logger.info('The scan command will be available in the next release.');
      Logger.info('This feature will reverse-engineer existing codebases into SpecFlow specifications.');
      
      Logger.header('Planned Features');
      Logger.list([
        '🔍 TypeScript/JavaScript project scanning (Express, Fastify, Hono)',
        '🐍 Python project scanning (FastAPI, Django, Flask)', 
        '☕ Java project scanning (Spring Boot)',
        '📝 Automatic .req.md and .contract.md generation',
        '🧠 LLM-powered business logic extraction'
      ]);
      
      Logger.info('\nFor now, you can manually create specification files in requirements/');
      return;
    }

    Logger.error(`Failed to scan project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      Logger.dim(error.stack || '');
    }
    process.exit(1);
  }
}