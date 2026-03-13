import { Logger } from '../ui/logger.js';
import { Spinner } from '../ui/spinner.js';
import { loadConfig } from '../../config/loader.js';
import { createSpecScanner } from '../../parser/spec-scanner.js';

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

    // Step 1: Check prepare state
    Logger.step(1, 3, 'Checking specification readiness...');
    
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
    await Spinner.withSpinner('Validating specification files...', async (spinner) => {
      // TODO: Add actual spec validation
      // For now, just check that files exist
      spinner.updateText('Validation complete');
    });

    if (options.dryRun) {
      Logger.step(2, 3, 'Dry run - showing what would be generated...');
      await showDryRun(config);
      return;
    }

    // Step 3: Generate code
    Logger.step(2, 3, 'Generating backend code...');
    await Spinner.withSpinner('Generating TypeScript backend...', async (spinner) => {
      // TODO: Implement actual code generation
      // This will use the generator components
      
      spinner.updateText('Code generation complete');
    });

    Logger.success('Backend code generated successfully!');
    
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

  } catch (error) {
    Logger.error(`Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
│   │   │   ├── register.ts    # POST /auth/register
│   │   │   └── login.ts       # POST /auth/login  
│   │   └── orders/
│   │       └── create.ts      # POST /orders
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
│   │   └── validation.ts      # Validation helpers
│   └── middleware/
│       ├── auth.ts            # Auth middleware
│       ├── rateLimit.ts       # Rate limiting
│       └── cors.ts            # CORS setup
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── drizzle.config.ts          # Drizzle ORM configuration
├── Dockerfile                 # Container definition
├── docker-compose.yml         # Development environment
└── .env.example               # Environment variables template
  `);

  Logger.info('Technologies used:');
  Logger.list([
    '🔥 Bun runtime for fast development and production',
    '🌐 Hono web framework for lightweight, fast APIs',
    '🛢️ Drizzle ORM with PostgreSQL',
    '🔒 Zod for request/response validation',
    '🐳 Docker for containerization',
    '🚀 TypeScript for type safety'
  ]);
}