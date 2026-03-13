import { SpecFlow, type PrepareOptions as SDKPrepareOptions } from '@specflow/core';
import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { askQuestions, confirmGeneration, confirmOverwrite } from '../ui/prompt.js';
import { loadConfig, resolveApiKey } from '../config/loader.js';

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

    // Initialize SpecFlow SDK
    const specFlow = new SpecFlow({
      provider: llmProvider,
      apiKey,
      cwd: process.cwd()
    });

    // Call the SDK prepare method with UI feedback
    const result = await Spinner.withSpinner('Preparing specifications...', async (spinner) => {
      spinner.updateText('Scanning for specifications...');
      
      // Prepare specifications
      const sdkOptions: SDKPrepareOptions = {
        auto: options.auto,
        force: options.force
      };
      
      return await specFlow.prepare(sdkOptions);
    });

    // Show results
    Logger.success(`Generated ${result.filesWritten.length} specification files:`);
    Logger.list(result.filesWritten.map(f => f.replace(process.cwd() + '/', '')));

    // Show questions asked (if any)
    if (result.questions.length > 0 && !options.auto) {
      Logger.info(`\nAnswered ${result.questions.length} clarifying questions to refine specifications`);
    }

    // Step 6: Show next steps
    Logger.divider();
    Logger.header('Review & Next Steps');
    
    Logger.info('📋 Specification files have been generated');
    Logger.info('📖 Please review the generated files in requirements/');
    Logger.info('✏️  Edit any files if needed');
    Logger.info('🚀 Run `specflow generate` when ready to create the backend code');

    Logger.divider();
    Logger.bold('Generated files:');
    
    // Extract file types from written files
    const businessFiles = result.filesWritten.filter(f => f.includes('.req.md'));
    const contractFiles = result.filesWritten.filter(f => f.includes('.contract.md'));
    const schemaFiles = result.filesWritten.filter(f => f.includes('.schema.md'));
    
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