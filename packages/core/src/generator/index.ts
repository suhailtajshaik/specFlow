import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import type { SpecFlowConfig } from '../config/types.js';
import type { JsonSchema } from '../parser/types.js';
import { ZodCompiler } from './zod-compiler.js';
import { DrizzleCompiler } from './drizzle-compiler.js';
import { RouteGenerator } from './route-generator.js';
import { TestGenerator } from './test-generator.js';
import { ScaffoldGenerator } from './scaffold.js';
import type { LLMProvider } from '../llm/provider.js';
// Simple logging utility
const Logger = {
  info: (msg: string) => console.log(msg),
  warning: (msg: string) => console.warn(msg),
  dim: (msg: string) => console.log(msg)
};

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'route' | 'schema' | 'test' | 'config' | 'scaffold';
}

export interface BusinessRequirement {
  id: string;
  domain: string;
  title: string;
  content: string;
  filePath: string;
}

export interface TechnicalContract {
  id: string;
  domain: string;
  method: string;
  path: string;
  title: string;
  content: string;
  filePath: string;
  relatedRequirement?: string;
}

export interface SchemaFile {
  name: string;
  content: JsonSchema;
  filePath: string;
}

export class GeneratorEngine {
  private zodCompiler = new ZodCompiler();
  private drizzleCompiler = new DrizzleCompiler();
  private routeGenerator: RouteGenerator;
  private testGenerator: TestGenerator;
  private scaffoldGenerator = new ScaffoldGenerator();

  constructor(
    private config: SpecFlowConfig,
    private llmProvider: LLMProvider
  ) {
    this.routeGenerator = new RouteGenerator(llmProvider);
    this.testGenerator = new TestGenerator(llmProvider);
  }

  async generate(): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    
    Logger.info('🔍 Reading specifications...');
    
    // Step 1: Read all specifications
    const [businessReqs, technicalContracts, schemas] = await Promise.all([
      this.readBusinessRequirements(),
      this.readTechnicalContracts(),
      this.readSchemas()
    ]);

    Logger.info(`Found ${businessReqs.length} business requirements, ${technicalContracts.length} contracts, ${schemas.length} schemas`);

    // Step 2: Generate scaffold files
    Logger.info('🏗️ Generating project scaffold...');
    const scaffoldFiles = await this.scaffoldGenerator.generate(this.config);
    files.push(...scaffoldFiles);

    // Step 3: Generate database schema
    Logger.info('🗃️ Generating database schema...');
    const schemaFiles = await this.generateDatabaseSchema(schemas);
    files.push(...schemaFiles);

    // Step 4: Generate Zod schemas
    Logger.info('✅ Generating validation schemas...');
    const zodFiles = await this.generateZodSchemas(schemas, technicalContracts);
    files.push(...zodFiles);

    // Step 5: Generate routes one by one
    Logger.info('🛤️ Generating route handlers...');
    const routeFiles = await this.generateRoutes(businessReqs, technicalContracts, schemas);
    files.push(...routeFiles);

    // Step 6: Generate tests
    if (this.config.output.includeTests) {
      Logger.info('🧪 Generating tests...');
      const testFiles = await this.generateTests(technicalContracts, schemas);
      files.push(...testFiles);
    }

    // Step 7: Update server.ts with all routes
    Logger.info('🚀 Updating server configuration...');
    const serverFile = await this.generateServerFile(technicalContracts);
    files.push(serverFile);

    return files;
  }

  private async readBusinessRequirements(): Promise<BusinessRequirement[]> {
    const businessDir = join(this.config.requirements.directory, this.config.requirements.businessDir);
    
    if (!existsSync(businessDir)) {
      return [];
    }

    const files = await this.findMarkdownFiles(businessDir);
    const requirements: BusinessRequirement[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = matter(content);
        
        if (parsed.data.type === 'business_requirement') {
          requirements.push({
            id: parsed.data.id,
            domain: parsed.data.domain,
            title: parsed.data.title,
            content: content,
            filePath
          });
        }
      } catch (error) {
        Logger.warning(`Failed to read business requirement: ${filePath}`);
      }
    }

    return requirements;
  }

  private async readTechnicalContracts(): Promise<TechnicalContract[]> {
    const technicalDir = join(this.config.requirements.directory, this.config.requirements.technicalDir);
    
    if (!existsSync(technicalDir)) {
      return [];
    }

    const files = await this.findMarkdownFiles(technicalDir);
    const contracts: TechnicalContract[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = matter(content);
        
        if (parsed.data.type === 'api_contract') {
          contracts.push({
            id: parsed.data.id,
            domain: parsed.data.domain,
            method: parsed.data.method,
            path: parsed.data.path,
            title: parsed.data.title,
            content: content,
            filePath,
            relatedRequirement: parsed.data.relatedRequirement
          });
        }
      } catch (error) {
        Logger.warning(`Failed to read technical contract: ${filePath}`);
      }
    }

    return contracts;
  }

  private async readSchemas(): Promise<SchemaFile[]> {
    const schemasDir = join(this.config.requirements.directory, this.config.requirements.schemasDir);
    
    if (!existsSync(schemasDir)) {
      return [];
    }

    const files = await this.findJsonFiles(schemasDir);
    const schemas: SchemaFile[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content) as JsonSchema;
        const name = filePath.split('/').pop()?.replace('.json', '') || 'unknown';
        
        schemas.push({
          name,
          content: parsed,
          filePath
        });
      } catch (error) {
        Logger.warning(`Failed to read schema: ${filePath}`);
      }
    }

    return schemas;
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(currentDir: string): Promise<void> {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    }

    await scan(dir);
    return files;
  }

  private async findJsonFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(currentDir: string): Promise<void> {
      const entries = await readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(fullPath);
        }
      }
    }

    await scan(dir);
    return files;
  }

  private async generateDatabaseSchema(schemas: SchemaFile[]): Promise<GeneratedFile[]> {
    const schemaMap: Record<string, JsonSchema> = {};
    
    for (const schema of schemas) {
      schemaMap[schema.name] = schema.content;
    }

    const dbSchemaCode = this.drizzleCompiler.compileSchemas(schemaMap);

    return [{
      path: 'src/db/schema.ts',
      content: dbSchemaCode,
      type: 'schema'
    }];
  }

  private async generateZodSchemas(schemas: SchemaFile[], contracts: TechnicalContract[]): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    
    // Generate schemas for each domain
    const domainSchemas: Record<string, Record<string, JsonSchema>> = {};
    
    // Group schemas by domain
    for (const schema of schemas) {
      const domain = this.extractDomainFromName(schema.name);
      if (!domainSchemas[domain]) {
        domainSchemas[domain] = {};
      }
      domainSchemas[domain][schema.name] = schema.content;
    }
    
    // Extract request/response schemas from contracts
    for (const contract of contracts) {
      const domain = contract.domain;
      if (!domainSchemas[domain]) {
        domainSchemas[domain] = {};
      }
      
      const requestSchema = this.extractRequestSchema(contract.content);
      const responseSchema = this.extractResponseSchema(contract.content);
      
      if (requestSchema) {
        const key = `${contract.method.toLowerCase()}-${contract.path.replace(/\//g, '-').replace(/[{}]/g, '')}-request`;
        domainSchemas[domain][key] = requestSchema;
      }
      
      if (responseSchema) {
        const key = `${contract.method.toLowerCase()}-${contract.path.replace(/\//g, '-').replace(/[{}]/g, '')}-response`;
        domainSchemas[domain][key] = responseSchema;
      }
    }

    // Generate Zod files for each domain
    for (const [domain, schemas] of Object.entries(domainSchemas)) {
      const zodCode = this.zodCompiler.compileSchemas(schemas);
      files.push({
        path: `src/schemas/${domain}.schemas.ts`,
        content: zodCode,
        type: 'schema'
      });
    }

    return files;
  }

  private async generateRoutes(
    businessReqs: BusinessRequirement[],
    contracts: TechnicalContract[],
    schemas: SchemaFile[]
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    for (const contract of contracts) {
      Logger.info(`Generating route: ${contract.method} ${contract.path}`);
      
      // Find related business requirement
      const businessReq = businessReqs.find(req => 
        req.id === contract.relatedRequirement || 
        req.domain === contract.domain
      );

      // Get relevant schemas
      const relevantSchemas = schemas.filter(schema => 
        schema.name.includes(contract.domain) || 
        this.extractDomainFromName(schema.name) === contract.domain
      );

      const routeContent = await this.routeGenerator.generateRoute(
        contract,
        businessReq,
        relevantSchemas
      );

      // Generate file path based on domain and method
      const routePath = this.generateRoutePath(contract);
      
      files.push({
        path: routePath,
        content: routeContent,
        type: 'route'
      });
    }

    return files;
  }

  private async generateTests(
    contracts: TechnicalContract[],
    schemas: SchemaFile[]
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    for (const contract of contracts) {
      Logger.info(`Generating tests: ${contract.method} ${contract.path}`);
      
      const relevantSchemas = schemas.filter(schema => 
        schema.name.includes(contract.domain) || 
        this.extractDomainFromName(schema.name) === contract.domain
      );

      const testContent = await this.testGenerator.generateTests(contract, relevantSchemas);

      // Generate test file path
      const testPath = this.generateTestPath(contract);
      
      files.push({
        path: testPath,
        content: testContent,
        type: 'test'
      });
    }

    return files;
  }

  private async generateServerFile(contracts: TechnicalContract[]): Promise<GeneratedFile> {
    const imports: string[] = [];
    const routes: string[] = [];

    // Group contracts by domain for cleaner imports
    const domainGroups: Record<string, TechnicalContract[]> = {};
    for (const contract of contracts) {
      if (!domainGroups[contract.domain]) {
        domainGroups[contract.domain] = [];
      }
      domainGroups[contract.domain].push(contract);
    }

    // Generate imports and route registration
    for (const [domain, domainContracts] of Object.entries(domainGroups)) {
      for (const contract of domainContracts) {
        const routeName = this.generateRouteImportName(contract);
        const routePath = this.generateRoutePath(contract).replace('src/', './').replace('.ts', '.js');
        
        imports.push(`import ${routeName} from '${routePath}';`);
        const basePath = '/' + (contract.path.split('/').filter(Boolean)[0] || '');
        routes.push(`app.route('${basePath}', ${routeName});`);
      }
    }

    const serverContent = `import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { errorHandler } from './lib/errors.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
${imports.join('\n')}

const app = new Hono();

// Global middleware
app.use('*', cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use('*', logger());
app.use('*', rateLimitMiddleware);

// Health check
app.get('/health', (c) => c.json({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0'
}));

// API Routes
${routes.join('\n')}

// Error handling
app.onError(errorHandler);

// 404 handler
app.notFound((c) => c.json({ 
  error: { 
    code: 'NOT_FOUND', 
    message: 'The requested resource was not found' 
  } 
}, 404));

const port = parseInt(process.env.PORT || '3000');
console.log(\`🚀 Server running on port \${port}\`);
console.log(\`📚 Health check: http://localhost:\${port}/health\`);

export default { 
  port, 
  fetch: app.fetch 
};`;

    return {
      path: 'src/server.ts',
      content: serverContent,
      type: 'scaffold'
    };
  }

  private extractDomainFromName(name: string): string {
    // Extract domain from schema name (e.g., "user.schema" -> "auth")
    if (name.includes('user')) return 'auth';
    if (name.includes('order')) return 'orders';
    if (name.includes('inventory')) return 'inventory';
    
    // Default to the name before any dot
    return name.split('.')[0];
  }

  private extractRequestSchema(contractContent: string): JsonSchema | null {
    try {
      const requestMatch = contractContent.match(/## Request Schema\s*```json\s*([\s\S]*?)\s*```/);
      if (requestMatch) {
        return JSON.parse(requestMatch[1]);
      }
    } catch (error) {
      Logger.warning('Failed to extract request schema from contract');
    }
    return null;
  }

  private extractResponseSchema(contractContent: string): JsonSchema | null {
    try {
      const responseMatch = contractContent.match(/## Response Schema.*?\s*```json\s*([\s\S]*?)\s*```/);
      if (responseMatch) {
        return JSON.parse(responseMatch[1]);
      }
    } catch (error) {
      Logger.warning('Failed to extract response schema from contract');
    }
    return null;
  }

  private generateRoutePath(contract: TechnicalContract): string {
    const pathSegments = contract.path.split('/').filter(s => s && !s.startsWith(':') && !s.startsWith('{'));
    // Sanitize segments — replace special chars with hyphens for file paths
    const sanitized = pathSegments.map(s => s.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase());
    const filename = `${contract.method.toLowerCase()}-${sanitized[sanitized.length - 1] || 'root'}.ts`;
    
    if (sanitized.length <= 1) {
      return `src/routes/${filename}`;
    }
    
    return `src/routes/${sanitized.slice(0, -1).join('/')}/${filename}`;
  }

  private generateTestPath(contract: TechnicalContract): string {
    const routePath = this.generateRoutePath(contract);
    return routePath.replace('src/routes/', 'src/tests/routes/').replace('.ts', '.test.ts');
  }

  private generateRouteImportName(contract: TechnicalContract): string {
    const pathParts = contract.path.split('/').filter(s => s && !s.startsWith(':') && !s.startsWith('{'));
    const method = contract.method.toLowerCase();
    
    if (pathParts.length <= 1) {
      return `${method}Root`;
    }
    
    // Convert path parts to valid camelCase identifier (handle hyphens, special chars)
    const camelCase = pathParts.slice(1)
      .map(part => {
        // Replace hyphens and non-alphanumeric with space, then capitalize each word
        return part
          .replace(/[^a-zA-Z0-9]/g, ' ')
          .split(' ')
          .filter(Boolean)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('');
      })
      .join('');
    
    return `${method}${camelCase}`;
  }

  async writeFiles(files: GeneratedFile[]): Promise<void> {
    const outputDir = this.config.output.directory;

    for (const file of files) {
      const fullPath = join(outputDir, file.path);
      const dir = dirname(fullPath);
      
      // Ensure directory exists
      await mkdir(dir, { recursive: true });
      
      // Write file
      await writeFile(fullPath, file.content, 'utf-8');
      Logger.dim(`  ✓ ${file.path}`);
    }
  }
}