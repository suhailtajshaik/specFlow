import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { loadConfig } from '../../config/loader.js';
import { createSpecScanner } from '../../parser/spec-scanner.js';
import { GeneratorEngine } from '../../generator/index.js';
import { createProvider } from '../../llm/provider.js';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

interface GenerateOptions {
  dryRun?: boolean;
  force?: boolean;
  provider?: 'gemini' | 'claude' | 'llamacpp';
}

export async function generateCommand(options: GenerateOptions = {}) {
  try {
    Logger.header('Generate Backend Code');

    // Load configuration
    const config = loadConfig();
    const scanner = createSpecScanner(config.requirements.directory);

    // Override provider if specified
    if (options.provider) {
      config.llm.provider = options.provider;
    }

    // Step 1: Check prepare state
    Logger.step(1, 4, 'Checking specification readiness...');
    
    const prepareState = scanner.checkPrepareState();
    if (!prepareState && !options.force) {
      Logger.error('Specifications not prepared');
      Logger.info('Run `specflow prepare` first to transform your rough specs into professional specifications');
      Logger.info('Or use --force to skip this check');
      return;
    }

    if (prepareState) {
      Logger.success('Specifications are prepared and ready');
      Logger.dim(`Last prepared: ${new Date(prepareState.timestamp).toLocaleString()}`);
    } else {
      Logger.warning('Skipping prepare check (--force flag used)');
    }

    // Step 2: Validate specifications exist
    Logger.step(2, 4, 'Validating specification files...');
    await Spinner.withSpinner('Validating specification files...', async (spinner) => {
      const businessDir = join(config.requirements.directory, config.requirements.businessDir);
      const technicalDir = join(config.requirements.directory, config.requirements.technicalDir);
      const schemasDir = join(config.requirements.directory, config.requirements.schemasDir);

      if (!existsSync(businessDir) || !existsSync(technicalDir)) {
        throw new Error('Missing required specification directories');
      }

      spinner.updateText('Validation complete');
    });

    if (options.dryRun) {
      Logger.step(3, 4, 'Dry run - showing what would be generated...');
      await showDryRun(config);
      return;
    }

    // Step 3: Initialize LLM provider
    Logger.step(3, 4, 'Initializing LLM provider...');
    let llmProvider;
    
    try {
      llmProvider = await createProvider({
        provider: config.llm.provider,
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || config.llm.apiKey,
        model: config.llm.model
      });
      Logger.success(`Connected to ${config.llm.provider.toUpperCase()} provider`);
    } catch (error) {
      Logger.error(`Failed to initialize LLM provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Logger.info('Make sure you have set the appropriate API key environment variable');
      process.exit(1);
    }

    // Step 4: Generate code
    Logger.step(4, 4, 'Generating backend code...');
    
    // Clear output directory if it exists and force is enabled
    const outputDir = config.output.directory;
    if (existsSync(outputDir) && options.force) {
      Logger.dim(`Removing existing output directory: ${outputDir}`);
      rmSync(outputDir, { recursive: true, force: true });
    } else if (existsSync(outputDir)) {
      Logger.error(`Output directory already exists: ${outputDir}`);
      Logger.info('Use --force to overwrite existing files');
      return;
    }

    // Initialize the generator engine
    const generator = new GeneratorEngine(config, llmProvider);

    // Generate all files
    const files = await Spinner.withSpinner('Generating project files...', async (spinner) => {
      const generatedFiles = await generator.generate();
      
      spinner.updateText(`Generated ${generatedFiles.length} files`);
      return generatedFiles;
    });

    // Write files to disk
    await Spinner.withSpinner('Writing files to disk...', async (spinner) => {
      await generator.writeFiles(files);
      spinner.updateText(`Wrote ${files.length} files`);
    });

    Logger.success('Backend code generated successfully!');
    
    // Show summary
    const summary = summarizeGeneration(files);
    Logger.header('Generated Files');
    for (const [category, count] of Object.entries(summary)) {
      Logger.info(`${category}: ${count} files`);
    }
    
    // Show next steps
    Logger.header('Next Steps');
    Logger.info('1. Navigate to the generated directory:');
    Logger.code(`cd ${config.output.directory}`);
    
    Logger.info('2. Install dependencies:');
    Logger.code('bun install');
    
    Logger.info('3. Set up your database:');
    Logger.code('bun run db:migrate');
    
    Logger.info('4. Start the development server:');
    Logger.code('bun run dev');

    Logger.info('5. Check the health endpoint:');
    Logger.code('curl http://localhost:3000/health');

  } catch (error) {
    Logger.error(`Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      Logger.dim(error.stack || '');
    }
    process.exit(1);
  }
}

function summarizeGeneration(files: any[]): Record<string, number> {
  const summary: Record<string, number> = {};
  
  for (const file of files) {
    const category = file.type || 'other';
    summary[category] = (summary[category] || 0) + 1;
  }
  
  return summary;
}

async function showDryRun(config: any): Promise<void> {
  Logger.info('Would generate the following structure:');
  Logger.code(`
${config.output.directory}/
├── src/
│   ├── server.ts              # Main Hono server
│   ├── routes/
│   │   ├── auth/
│   │   │   ├── post-register.ts    # POST /auth/register
│   │   │   └── post-verify-email.ts # POST /auth/verify-email  
│   │   └── orders/
│   │       └── post-orders.ts      # POST /orders
│   ├── schemas/
│   │   ├── auth.schemas.ts    # Zod validation schemas
│   │   └── orders.schemas.ts
│   ├── db/
│   │   ├── client.ts          # Drizzle client setup
│   │   ├── schema.ts          # Database table definitions
│   │   └── migrate.ts         # Migration runner
│   ├── lib/
│   │   ├── auth.ts            # Authentication utilities
│   │   ├── errors.ts          # Error handling
│   │   └── password.ts        # Password utilities
│   └── middleware/
│       ├── auth.ts            # Auth middleware
│       ├── rate-limit.ts      # Rate limiting
│       └── cors.ts            # CORS setup
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── drizzle.config.ts          # Drizzle ORM configuration
├── Dockerfile                 # Container definition
├── docker-compose.yml         # Development environment
├── README.md                  # Project documentation
└── .env.example               # Environment variables template
  `);

  Logger.info('Technologies used:');
  Logger.list([
    '🔥 Bun runtime for fast development and production',
    '🌐 Hono web framework for lightweight, fast APIs',
    '🛢️ Drizzle ORM with PostgreSQL',
    '🔒 Zod for request/response validation',
    '🐳 Docker for containerization',
    '🚀 TypeScript for type safety',
    '🤖 LLM-generated business logic implementation'
  ]);
}