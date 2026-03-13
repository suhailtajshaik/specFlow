import { existsSync } from 'fs';
import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { askQuestions, confirmGeneration, confirmOverwrite } from '../ui/prompt.js';
import { loadConfig, resolveApiKey } from '../../config/loader.js';
import { createProvider } from '../../llm/provider.js';
import { createSpecScanner } from '../../parser/spec-scanner.js';
import { SpecAnalyzer } from '../../prepare/analyzer.js';
import { SpecRefiner } from '../../prepare/refiner.js';
import { SpecWriter } from '../../prepare/writer.js';

interface PrepareOptions {
  auto?: boolean;
  provider?: 'gemini' | 'claude' | 'llamacpp';
  force?: boolean;
}

export async function prepareCommand(options: PrepareOptions = {}) {
  try {
    Logger.header('Prepare Specifications');

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

    // Initialize components
    const llm = await createProvider({ provider: llmProvider, apiKey });
    const scanner = createSpecScanner(config.requirements.directory);
    const analyzer = new SpecAnalyzer(llm);
    const refiner = new SpecRefiner(llm);
    const writer = new SpecWriter(config.requirements.directory);

    // Step 0: Scan existing professional specs for context
    Logger.step(1, 5, 'Scanning for existing specifications...');
    const existingContext = await scanner.scanExistingSpecs();
    const existingCount = existingContext.businessReqs.length + existingContext.contracts.length + existingContext.schemas.length;
    
    if (existingCount > 0) {
      Logger.success(`Found ${existingCount} existing spec(s) — will use as context to avoid duplicates:`);
      if (existingContext.businessReqs.length > 0) {
        Logger.list(existingContext.businessReqs.map(r => `📄 ${r.filePath}`));
      }
      if (existingContext.contracts.length > 0) {
        Logger.list(existingContext.contracts.map(c => `🔌 ${c.filePath}`));
      }
      if (existingContext.schemas.length > 0) {
        Logger.list(existingContext.schemas.map(s => `📦 ${s.filePath}`));
      }
    } else {
      Logger.info('No existing specs found — starting fresh');
    }

    // Step 1: Scan for rough specifications
    Logger.step(2, 5, 'Scanning for rough specifications...');
    const roughInputs = await scanner.scanForRoughSpecs();

    if (roughInputs.length === 0) {
      Logger.error('No specification files found');
      Logger.info('Add .md files with your API ideas to the requirements/ directory');
      Logger.info('Example:');
      Logger.code('echo "# User API\n- Users can register\n- Users can login" > requirements/user-api.md');
      return;
    }

    Logger.success(`Found ${roughInputs.length} specification file(s):`);
    Logger.list(roughInputs.map(input => `${input.filePath} (${input.type})`));

    // Provide existing context to analyzer and refiner
    if (existingCount > 0) {
      analyzer.setExistingContext(existingContext);
      refiner.setExistingContext(existingContext);
    }

    // Step 3: Analyze specifications  
    const analysis = await Spinner.withSpinner('Analyzing specifications with AI (considering existing context)...', async (spinner) => {
      const result = await analyzer.analyzeRoughSpecs(roughInputs);
      
      spinner.updateText('Analysis complete');
      return result;
    });

    Logger.success(`Identified ${analysis.identifiedDomains.length} domain(s): ${analysis.identifiedDomains.join(', ')}`);
    
    if (analysis.warnings.length > 0) {
      Logger.warning('Analysis warnings:');
      Logger.list(analysis.warnings);
    }

    // Step 4: Ask clarifying questions (unless auto mode)
    Logger.step(3, 5, 'Gathering additional information...');
    
    let answers = {};
    if (!options.auto && analysis.questions.length > 0) {
      Logger.info(`Found ${analysis.questions.length} questions to clarify the specifications`);
      answers = await askQuestions(analysis.questions);
    } else if (options.auto) {
      Logger.info('Auto mode enabled - using default answers');
      // Use default answers from questions
      answers = analysis.questions.reduce((acc: any, q: any) => {
        acc[q.id] = q.default;
        return acc;
      }, {} as any);
    } else {
      Logger.info('No clarifying questions needed');
    }

    // Step 4.5: Refine specifications
    const refinedSpecs = await Spinner.withSpinner('Generating professional specifications...', async (spinner) => {
      const result = await refiner.refineSpecs(analysis, answers);
      
      spinner.updateText('Specifications generated');
      return result;
    });

    // Check for existing files
    const existingFiles = writer.getExistingFiles(refinedSpecs);
    if (existingFiles.length > 0 && !options.force) {
      const shouldOverwrite = await confirmOverwrite(existingFiles);
      if (!shouldOverwrite) {
        Logger.info('Operation cancelled');
        return;
      }
    }

    // Show what will be generated
    const businessFiles = Object.keys(refinedSpecs.businessRequirements);
    const contractFiles = Object.keys(refinedSpecs.apiContracts);
    const schemaFiles = Object.keys(refinedSpecs.sharedSchemas);

    if (!options.auto && !options.force) {
      const shouldGenerate = await confirmGeneration(businessFiles, contractFiles, schemaFiles);
      if (!shouldGenerate) {
        Logger.info('Operation cancelled');
        return;
      }
    }

    // Step 5: Write refined specifications
    Logger.step(4, 5, 'Writing specification files...');
    const writtenFiles = await writer.writeRefinedSpecs(refinedSpecs);

    // Update prepare state
    const inputFilePaths = roughInputs.map(input => input.filePath);
    writer.writePrepareState(inputFilePaths, writtenFiles);

    Logger.success(`Generated ${writtenFiles.length} specification files:`);
    Logger.list(writtenFiles.map(f => f.replace(process.cwd() + '/', '')));

    // Step 6: Show next steps
    Logger.step(5, 5, 'Ready for code generation');
    Logger.divider();
    Logger.header('Review & Next Steps');
    
    Logger.info('📋 Specification files have been generated');
    Logger.info('📖 Please review the generated files in requirements/');
    Logger.info('✏️  Edit any files if needed');
    Logger.info('🚀 Run `specflow generate` when ready to create the backend code');

    Logger.divider();
    Logger.bold('Generated files:');
    if (businessFiles.length > 0) {
      Logger.info('\n📄 Business Requirements:');
      Logger.list(businessFiles.map(f => f.replace('requirements/', '')));
    }
    if (contractFiles.length > 0) {
      Logger.info('\n🔌 API Contracts:');
      Logger.list(contractFiles.map(f => f.replace('requirements/', '')));
    }
    if (schemaFiles.length > 0) {
      Logger.info('\n📦 Schemas:');
      Logger.list(schemaFiles.map(f => f.replace('requirements/', '')));
    }

  } catch (error) {
    Logger.error(`Failed to prepare specifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Show helpful debugging info
    if (error instanceof Error && error.message.includes('API key')) {
      Logger.info('\nTroubleshooting API keys:');
      Logger.info('• Check your environment variables');
      Logger.info('• Verify your API key is valid');
      Logger.info('• Try a different LLM provider with --provider flag');
    }
    
    process.exit(1);
  }
}