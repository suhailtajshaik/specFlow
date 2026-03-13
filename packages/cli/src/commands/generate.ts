import { SpecFlow, type GenerateOptions as SDKGenerateOptions } from '@specflow/core';
import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { loadConfig, resolveApiKey } from '../config/loader.js';
import { existsSync, rmSync } from 'fs';

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

    if (options.dryRun) {
      Logger.step(1, 1, 'Dry run - showing what would be generated...');
      await showDryRun(config);
      return;
    }

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

    // Generate code using SDK
    const result = await Spinner.withSpinner('Generating backend code...', async (spinner) => {
      spinner.updateText('Analyzing specifications...');
      
      const sdkOptions: SDKGenerateOptions = {
        force: options.force,
        dryRun: options.dryRun
      };
      
      const genResult = await specFlow.generate(sdkOptions);
      
      spinner.updateText(`Generated ${genResult.files.length} files`);
      return genResult;
    });

    Logger.success('Backend code generated successfully!');
    
    // Show summary
    Logger.header('Generated Files');
    Logger.info(`Routes: ${result.stats.routes} files`);
    Logger.info(`Schemas: ${result.stats.schemas} files`);
    Logger.info(`Tests: ${result.stats.tests} files`);
    Logger.info(`Configs: ${result.stats.configs} files`);
    Logger.info(`Scaffolds: ${result.stats.scaffolds} files`);
    Logger.info(`Total: ${result.stats.total} files`);
    
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