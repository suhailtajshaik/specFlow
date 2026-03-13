import type { LLMProvider } from '../llm/provider.js';
import type { TechnicalContract, SchemaFile } from './index.js';
import { Logger } from '../cli/ui/logger.js';

export class TestGenerator {
  constructor(private llmProvider: LLMProvider) {}

  async generateTests(contract: TechnicalContract, schemas: SchemaFile[]): Promise<string> {
    const context = this.buildTestContext(contract, schemas);
    
    const prompt = `You are generating comprehensive test cases for a Hono API endpoint using Bun's test runner.

Generate tests that cover:
1. Happy path scenarios (successful requests)
2. Validation error cases (invalid request data)
3. Business rule violations 
4. Authentication/authorization if applicable
5. Edge cases mentioned in the contract

Use this test structure:
- Import { test, expect, beforeAll, afterAll } from 'bun:test'
- Create a test client using the Hono app
- Use the Zod schemas for response validation
- Test all error scenarios from the contract's error table
- Use meaningful test descriptions
- Clean setup/teardown for database tests

Return ONLY the TypeScript test code, no explanations.

CONTEXT:
${context}`;

    const testCode = await this.llmProvider.generate(prompt, context);
    
    return this.wrapInTestFile(contract, testCode.trim());
  }

  private buildTestContext(contract: TechnicalContract, schemas: SchemaFile[]): string {
    let context = '';
    
    // Add contract details
    context += `API ENDPOINT: ${contract.method} ${contract.path}\n`;
    context += `TITLE: ${contract.title}\n\n`;
    
    // Add contract content
    context += 'FULL CONTRACT:\n';
    context += contract.content;
    context += '\n\n';
    
    // Add schema information
    context += 'AVAILABLE SCHEMAS:\n';
    for (const schema of schemas) {
      context += `${schema.name}:\n`;
      context += JSON.stringify(schema.content, null, 2);
      context += '\n\n';
    }
    
    return context;
  }

  private wrapInTestFile(contract: TechnicalContract, testCode: string): string {
    const domain = contract.domain;
    const method = contract.method.toLowerCase();
    const endpoint = contract.path;
    
    return `import { test, expect, beforeAll, afterAll, describe } from 'bun:test';
import { Hono } from 'hono';
import app from '../../../routes${this.getRouteImportPath(contract)}.js';
import { db } from '../../../db/client.js';
import * as schema from '../../../db/schema.js';
import { ${this.getRequestSchemaName(contract)}, ${this.getResponseSchemaName(contract)} } from '../../../schemas/${domain}.schemas.js';

describe('${contract.method} ${endpoint}', () => {
  beforeAll(async () => {
    // Setup test database
    // Clear relevant tables before tests
    await db.delete(schema.${this.getMainTableName(contract)});
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(schema.${this.getMainTableName(contract)});
  });

  ${testCode}
});

// Helper functions for testing
function createTestRequest(body?: any, headers?: Record<string, string>) {
  return new Request('http://localhost${endpoint}', {
    method: '${contract.method}',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function expectErrorResponse(
  response: Response, 
  expectedStatus: number, 
  expectedCode: string
) {
  expect(response.status).toBe(expectedStatus);
  const json = await response.json();
  expect(json.error).toBeDefined();
  expect(json.error.code).toBe(expectedCode);
  expect(json.error.message).toBeDefined();
}

async function expectSuccessResponse(
  response: Response, 
  expectedStatus: number = 200
) {
  expect(response.status).toBe(expectedStatus);
  const json = await response.json();
  
  // Validate response against schema
  const validation = ${this.getResponseSchemaName(contract)}.safeParse(json);
  if (!validation.success) {
    console.error('Response validation failed:', validation.error);
  }
  expect(validation.success).toBe(true);
  
  return json;
}`;
  }

  private getRouteImportPath(contract: TechnicalContract): string {
    const pathSegments = contract.path.split('/').filter(s => s && !s.startsWith(':') && !s.startsWith('{'));
    const filename = `${contract.method.toLowerCase()}-${pathSegments[pathSegments.length - 1] || 'root'}`;
    
    if (pathSegments.length <= 1) {
      return `/${filename}`;
    }
    
    return `/${pathSegments.slice(1).join('/')}/${filename}`;
  }

  private getRequestSchemaName(contract: TechnicalContract): string {
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
    
    return `${baseName}RequestSchema`;
  }

  private getResponseSchemaName(contract: TechnicalContract): string {
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
    
    return `${baseName}ResponseSchema`;
  }

  private getMainTableName(contract: TechnicalContract): string {
    // Determine main table based on domain
    const domain = contract.domain;
    
    if (domain === 'auth') return 'users';
    if (domain === 'orders') return 'orders';
    if (domain === 'inventory') return 'inventory';
    
    // Default to pluralized domain
    return domain.endsWith('s') ? domain : domain + 's';
  }
}