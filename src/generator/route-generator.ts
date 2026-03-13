import type { LLMProvider } from '../llm/provider.js';
import type { TechnicalContract, BusinessRequirement, SchemaFile } from './index.js';
import { GENERATE_ROUTE_PROMPT } from '../llm/prompts/generate-route.js';
import { Logger } from '../cli/ui/logger.js';

export class RouteGenerator {
  constructor(private llmProvider: LLMProvider) {}

  async generateRoute(
    contract: TechnicalContract,
    businessReq: BusinessRequirement | undefined,
    schemas: SchemaFile[]
  ): Promise<string> {
    // Build context for the LLM
    const context = this.buildRouteContext(contract, businessReq, schemas);
    
    // Generate the route handler using LLM
    const routeHandler = await this.llmProvider.generate(GENERATE_ROUTE_PROMPT, context);
    
    // Wrap the handler in the complete route file
    return this.wrapInRouteFile(contract, routeHandler.trim());
  }

  private buildRouteContext(
    contract: TechnicalContract,
    businessReq: BusinessRequirement | undefined,
    schemas: SchemaFile[]
  ): string {
    let context = '';
    
    // Add database schema context
    context += 'DATABASE SCHEMA:\n';
    context += this.generateDatabaseSchemaContext(schemas);
    context += '\n\n';
    
    // Add Zod validation schemas
    context += 'ZOD VALIDATION SCHEMAS:\n';
    context += this.generateZodSchemaContext(contract);
    context += '\n\n';
    
    // Add business requirements
    if (businessReq) {
      context += 'BUSINESS REQUIREMENTS:\n';
      context += businessReq.content;
      context += '\n\n';
    }
    
    // Add API contract
    context += 'API CONTRACT:\n';
    context += contract.content;
    
    return context;
  }

  private generateDatabaseSchemaContext(schemas: SchemaFile[]): string {
    // For now, generate simplified schema context
    // In production, this would import the actual generated schema
    let schemaContext = 'Available Drizzle tables:\n';
    
    for (const schema of schemas) {
      schemaContext += `// ${schema.name}\n`;
      schemaContext += `export const ${this.getTableName(schema.name)} = pgTable('${this.getTableName(schema.name)}', {\n`;
      
      if (schema.content.properties) {
        for (const [propName, propSchema] of Object.entries(schema.content.properties)) {
          const columnType = this.mapToColumnType(propName, propSchema as any);
          schemaContext += `  ${propName}: ${columnType},\n`;
        }
      }
      
      schemaContext += '});\n\n';
    }
    
    return schemaContext;
  }

  private generateZodSchemaContext(contract: TechnicalContract): string {
    const requestSchema = this.extractRequestSchema(contract.content);
    const responseSchema = this.extractResponseSchema(contract.content);
    
    let zodContext = `import { z } from 'zod';\n\n`;
    
    if (requestSchema) {
      zodContext += `// Request validation schema\n`;
      zodContext += `export const ${this.getSchemaName(contract, 'request')} = z.object({\n`;
      
      if (requestSchema.properties) {
        for (const [propName, propSchema] of Object.entries(requestSchema.properties)) {
          zodContext += `  ${propName}: ${this.mapToZodType(propSchema as any)},\n`;
        }
      }
      
      zodContext += '});\n\n';
    }
    
    if (responseSchema) {
      zodContext += `// Response schema\n`;
      zodContext += `export const ${this.getSchemaName(contract, 'response')} = z.object({\n`;
      
      if (responseSchema.properties) {
        for (const [propName, propSchema] of Object.entries(responseSchema.properties)) {
          zodContext += `  ${propName}: ${this.mapToZodType(propSchema as any)},\n`;
        }
      }
      
      zodContext += '});\n\n';
    }
    
    return zodContext;
  }

  private wrapInRouteFile(contract: TechnicalContract, handlerCode: string): string {
    const routeName = this.generateRouteName(contract);
    const requestSchemaName = this.getSchemaName(contract, 'request');
    const responseSchemaName = this.getSchemaName(contract, 'response');
    const domain = contract.domain;
    
    return `import { Hono } from 'hono';
import { db } from '../../db/client.js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { ${requestSchemaName}, ${responseSchemaName} } from '../../schemas/${domain}.schemas.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, comparePassword } from '../../lib/password.js';
import { generateJWT } from '../../lib/auth.js';
import { rateLimit } from '../../middleware/rate-limit.js';

const app = new Hono();

${this.generateRouteHandler(contract, handlerCode)}

export default app;`;
  }

  private generateRouteHandler(contract: TechnicalContract, handlerCode: string): string {
    const method = contract.method.toLowerCase();
    const path = this.extractPathFromContract(contract.path);
    const requestSchemaName = this.getSchemaName(contract, 'request');
    
    return `app.${method}('${path}', async (c) => {
  try {
    ${this.generateValidationCode(contract)}
    
    ${handlerCode}
    
  } catch (error) {
    if (error instanceof AppError) {
      return c.json({ 
        error: { 
          code: error.code, 
          message: error.message, 
          details: error.details 
        } 
      }, error.status);
    }
    
    console.error('Unexpected error:', error);
    return c.json({ 
      error: { 
        code: 'INTERNAL_ERROR', 
        message: 'An unexpected error occurred' 
      } 
    }, 500);
  }
});`;
  }

  private generateValidationCode(contract: TechnicalContract): string {
    if (contract.method === 'GET' || contract.method === 'DELETE') {
      return '// No request body validation needed for GET/DELETE';
    }
    
    const requestSchemaName = this.getSchemaName(contract, 'request');
    
    return `// Validate request body
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body is required');
    }
    
    const validation = ${requestSchemaName}.safeParse(rawBody);
    if (!validation.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request data', {
        errors: validation.error.errors
      });
    }
    
    const body = validation.data;`;
  }

  private extractRequestSchema(contractContent: string): any | null {
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

  private extractResponseSchema(contractContent: string): any | null {
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

  private extractPathFromContract(contractPath: string): string {
    // Convert API path to Hono path format
    return contractPath.replace(/\{([^}]+)\}/g, ':$1');
  }

  private generateRouteName(contract: TechnicalContract): string {
    const pathParts = contract.path.split('/').filter(s => s && !s.startsWith(':') && !s.startsWith('{'));
    const method = contract.method.toLowerCase();
    
    if (pathParts.length <= 1) {
      return `${method}Root`;
    }
    
    const camelCase = pathParts.slice(1)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    
    return `${method}${camelCase}`;
  }

  private getSchemaName(contract: TechnicalContract, type: 'request' | 'response'): string {
    const pathParts = contract.path.split('/').filter(s => s && !s.startsWith(':') && !s.startsWith('{'));
    const method = contract.method.toLowerCase();
    
    let baseName = '';
    if (pathParts.length <= 1) {
      baseName = `${method}Root`;
    } else {
      const camelCase = pathParts.slice(1)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      baseName = `${method}${camelCase}`;
    }
    
    return `${baseName}${type.charAt(0).toUpperCase() + type.slice(1)}Schema`;
  }

  private getTableName(schemaName: string): string {
    // Convert schema name to table name
    if (schemaName.includes('user')) return 'users';
    if (schemaName.includes('order')) return 'orders';
    if (schemaName.includes('inventory')) return 'inventory';
    
    // Default pluralization
    const base = schemaName.split('.')[0];
    return base.endsWith('s') ? base : base + 's';
  }

  private mapToColumnType(propName: string, propSchema: any): string {
    if (propSchema.format === 'uuid') {
      return `uuid('${propName}')`;
    }
    
    if (propSchema.type === 'string') {
      if (propSchema.format === 'email' || propName === 'email') {
        return `varchar('${propName}', { length: 255 })`;
      }
      if (propSchema.format === 'date-time') {
        return `timestamp('${propName}')`;
      }
      if (propSchema.maxLength && propSchema.maxLength <= 255) {
        return `varchar('${propName}', { length: ${propSchema.maxLength} })`;
      }
      return `text('${propName}')`;
    }
    
    if (propSchema.type === 'number' || propSchema.type === 'integer') {
      return `integer('${propName}')`;
    }
    
    if (propSchema.type === 'boolean') {
      return `boolean('${propName}')`;
    }
    
    return `text('${propName}')`;
  }

  private mapToZodType(propSchema: any): string {
    if (propSchema.type === 'string') {
      let zodType = 'z.string()';
      
      if (propSchema.format === 'email') {
        zodType += '.email()';
      } else if (propSchema.format === 'uuid') {
        zodType += '.uuid()';
      }
      
      if (propSchema.minLength) {
        zodType += `.min(${propSchema.minLength})`;
      }
      
      if (propSchema.maxLength) {
        zodType += `.max(${propSchema.maxLength})`;
      }
      
      return zodType;
    }
    
    if (propSchema.type === 'number' || propSchema.type === 'integer') {
      let zodType = propSchema.type === 'integer' ? 'z.number().int()' : 'z.number()';
      
      if (propSchema.minimum) {
        zodType += `.min(${propSchema.minimum})`;
      }
      
      if (propSchema.maximum) {
        zodType += `.max(${propSchema.maximum})`;
      }
      
      return zodType;
    }
    
    if (propSchema.type === 'boolean') {
      return 'z.boolean()';
    }
    
    if (propSchema.type === 'array') {
      const itemType = propSchema.items ? this.mapToZodType(propSchema.items) : 'z.unknown()';
      return `z.array(${itemType})`;
    }
    
    if (propSchema.type === 'object') {
      return 'z.object({})'; // Simplified for now
    }
    
    return 'z.unknown()';
  }
}