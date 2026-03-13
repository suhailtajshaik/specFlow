#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from './ui/logger.js';
import { runtimeDetector } from './runtime-detector.js';

// Import commands
import { initCommand } from './commands/init.js';
import { prepareCommand } from './commands/prepare.js';
import { generateCommand } from './commands/generate.js';
import { devCommand } from './commands/dev.js';
import { listCommand } from './commands/list.js';
import { scanCommand } from './commands/scan.js';

const program = new Command();

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  Logger.error(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

async function main() {
  program
    .name('specflow')
    .description('Generate production TypeScript backends from markdown specifications')
    .version('0.1.0')
    .configureHelp({
      sortSubcommands: true,
    });

  // Commands
  program
    .command('init')
    .description('Initialize a new SpecFlow project')
    .argument('[name]', 'Project name')
    .option('--example', 'Include example specifications')
    .option('--provider <provider>', 'LLM provider (gemini|claude|llamacpp)', 'gemini')
    .action(initCommand);

  program
    .command('prepare')
    .description('Transform rough specs into professional requirements and contracts')
    .option('--auto', 'Skip interactive questions, use defaults')
    .option('--provider <provider>', 'Override LLM provider')
    .option('--force', 'Skip runtime checks')
    .action(prepareCommand);

  program
    .command('generate')
    .description('Generate production TypeScript backend code')
    .option('--dry-run', 'Show what would be generated without creating files')
    .option('--force', 'Skip validation checks')
    .option('--provider <provider>', 'Override LLM provider')
    .action(generateCommand);

  program
    .command('scan')
    .description('Scan existing codebase and generate specifications')
    .argument('<project-dir>', 'Project directory to scan')
    .option('--language <lang>', 'Language to scan for: typescript | python | java | auto', 'auto')
    .option('--output <dir>', 'Output directory for generated specs', './requirements')
    .option('--provider <provider>', 'Override LLM provider')
    .action(scanCommand);

  program
    .command('dev')
    .description('Generate code and start development server')
    .option('--port <port>', 'Development server port', '3000')
    .option('--provider <provider>', 'Override LLM provider')
    .action(devCommand);

  program
    .command('list')
    .description('List all endpoints from contract files')
    .option('--json', 'Output as JSON')
    .action(listCommand);

  // Show help for specific setup issues
  program
    .command('setup')
    .description('Check setup and show installation help')
    .action(async () => {
      await runtimeDetector.showSetupChecklist();
      await runtimeDetector.checkLLMSetup();
    });

  // Global pre-action hook for runtime checks (except init and setup)
  program.hook('preAction', async (thisCommand) => {
    const commandName = thisCommand.name();
    
    // Skip runtime checks for init and setup commands
    if (commandName === 'init' || commandName === 'setup') {
      return;
    }

    // For other commands, check if force flag is set
    const opts = thisCommand.opts();
    if (opts.force) {
      return;
    }

    // Check basic runtime requirements
    const runtime = await runtimeDetector.detectRuntimes();
    
    if (!runtime.node.available) {
      Logger.error('Node.js is required to run SpecFlow CLI');
      process.exit(1);
    }

    // For generate and dev commands, check Bun
    if ((commandName === 'generate' || commandName === 'dev') && !runtime.bun.available) {
      Logger.error('Bun is required for code generation');
      Logger.info('Run `specflow setup` for installation help');
      process.exit(1);
    }

    // For prepare command, check LLM setup
    if (commandName === 'prepare') {
      const hasLLM = await runtimeDetector.checkLLMSetup();
      if (!hasLLM) {
        process.exit(1);
      }
    }
  });

  await program.parseAsync();
}

// Handle the case where this is called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    Logger.error(error.message || 'An unexpected error occurred');
    process.exit(1);
  });
}