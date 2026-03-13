import { join } from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import type { LanguageParser, ScannedEndpoint, ScannedModel } from '../index.js';

interface RouteMatch {
  method: string;
  path: string;
  handler: string;
  sourceFile: string;
  sourceCode: string;
  middleware: string[];
  lineNumber: number;
}

export class TypeScriptParser implements LanguageParser {
  async parseProject(projectDir: string): Promise<{
    framework: string;
    endpoints: ScannedEndpoint[];
    models: ScannedModel[];
  }> {
    const files = await this.getSourceFiles(projectDir);
    const framework = await this.detectFramework(projectDir, files);
    
    const endpoints: ScannedEndpoint[] = [];
    const models: ScannedModel[] = [];

    for (const file of files) {
      const content = await readFile(join(projectDir, file), 'utf8');
      
      // Parse routes for this framework
      const routes = await this.parseRoutes(content, file, framework);
      endpoints.push(...routes);
      
      // Parse models
      const fileModels = await this.parseModels(content, file);
      models.push(...fileModels);
    }

    return { framework, endpoints, models };
  }

  private async getSourceFiles(projectDir: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['node_modules', 'dist', 'build', '.next', 'coverage', '.git'];

    async function walk(dir: string, relativePath = ''): Promise<void> {
      const items = await readdir(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const itemRelativePath = join(relativePath, item);
        const stats = await stat(fullPath);
        
        if (stats.isDirectory()) {
          if (!excludeDirs.includes(item) && !item.startsWith('.')) {
            await walk(fullPath, itemRelativePath);
          }
        } else if (stats.isFile()) {
          if (item.endsWith('.ts') || item.endsWith('.js')) {
            files.push(itemRelativePath);
          }
        }
      }
    }

    await walk(projectDir);
    return files;
  }

  private async detectFramework(projectDir: string, files: string[]): Promise<string> {
    try {
      const packageJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check in order of likelihood
      if (deps['@nestjs/core'] || deps['@nestjs/common']) return 'nestjs';
      if (deps['express']) return 'express';
      if (deps['fastify']) return 'fastify';
      if (deps['hono']) return 'hono';
      if (deps['koa']) return 'koa';
    } catch (error) {
      // Fallback to content analysis
      console.warn('Could not read package.json, analyzing source code...');
    }

    // Analyze source files for framework patterns
    for (const file of files.slice(0, 20)) { // Sample first 20 files
      try {
        const content = await readFile(join(projectDir, file), 'utf8');
        
        if (/@Controller|@Get|@Post|@Put|@Delete|@Patch/.test(content)) return 'nestjs';
        if (/from ['"]fastify['"]|import.*fastify/.test(content)) return 'fastify';
        if (/from ['"]hono['"]|import.*hono/.test(content)) return 'hono';
        if (/from ['"]express['"]|import.*express/.test(content)) return 'express';
        if (/from ['"]koa['"]|import.*koa/.test(content)) return 'koa';
      } catch (error) {
        continue;
      }
    }

    return 'unknown';
  }

  private async parseRoutes(content: string, file: string, framework: string): Promise<ScannedEndpoint[]> {
    const routes: ScannedEndpoint[] = [];

    switch (framework) {
      case 'express':
      case 'koa':
        routes.push(...this.parseExpressRoutes(content, file));
        break;
      case 'fastify':
        routes.push(...this.parseFastifyRoutes(content, file));
        break;
      case 'hono':
        routes.push(...this.parseHonoRoutes(content, file));
        break;
      case 'nestjs':
        routes.push(...this.parseNestJSRoutes(content, file));
        break;
    }

    return routes;
  }

  private parseExpressRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Express/Router patterns: app.get('/path', handler) or router.post('/path', middleware, handler)
    const expressPattern = /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.*?)\)/gs;
    
    let match;
    while ((match = expressPattern.exec(content)) !== null) {
      const [fullMatch, appOrRouter, method, path, handlerPart] = match;
      
      // Extract handler and middleware
      const { handler, middleware, sourceCode } = this.parseHandlerAndMiddleware(handlerPart, content, match.index);
      
      routes.push({
        method: method.toUpperCase(),
        path,
        handler,
        sourceFile: file,
        sourceCode,
        middleware,
        description: this.extractDescription(content, match.index)
      });
    }

    return routes;
  }

  private parseFastifyRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Fastify patterns: fastify.get('/path', options?, handler)
    const fastifyPattern = /(fastify|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.*?)\)/gs;
    
    let match;
    while ((match = fastifyPattern.exec(content)) !== null) {
      const [fullMatch, serverVar, method, path, handlerPart] = match;
      
      const { handler, middleware, sourceCode } = this.parseHandlerAndMiddleware(handlerPart, content, match.index);
      
      routes.push({
        method: method.toUpperCase(),
        path,
        handler,
        sourceFile: file,
        sourceCode,
        middleware,
        description: this.extractDescription(content, match.index)
      });
    }

    return routes;
  }

  private parseHonoRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Hono patterns: app.get('/path', handler)
    const honoPattern = /(app)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(.*?)\)/gs;
    
    let match;
    while ((match = honoPattern.exec(content)) !== null) {
      const [fullMatch, app, method, path, handlerPart] = match;
      
      const { handler, middleware, sourceCode } = this.parseHandlerAndMiddleware(handlerPart, content, match.index);
      
      routes.push({
        method: method.toUpperCase(),
        path,
        handler,
        sourceFile: file,
        sourceCode,
        middleware,
        description: this.extractDescription(content, match.index)
      });
    }

    return routes;
  }

  private parseNestJSRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // NestJS patterns: @Get(':id'), @Post(), etc.
    const decoratorPattern = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]?([^'"`\)]*?)['"`]?\s*\)\s*([^{]*?)\s*(\w+)\s*\(/gs;
    
    let match;
    while ((match = decoratorPattern.exec(content)) !== null) {
      const [fullMatch, method, path, beforeMethod, methodName] = match;
      
      // Extract controller base path
      const controllerMatch = content.match(/@RequestMapping\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
      const basePath = controllerMatch ? controllerMatch[1] : '';
      
      const fullPath = basePath + (path || '');
      const sourceCode = this.extractMethodBody(content, match.index, methodName);
      
      routes.push({
        method: method.toUpperCase(),
        path: fullPath || '/',
        handler: methodName,
        sourceFile: file,
        sourceCode,
        middleware: this.extractNestJSMiddleware(beforeMethod),
        description: this.extractDescription(content, match.index)
      });
    }

    return routes;
  }

  private parseHandlerAndMiddleware(handlerPart: string, content: string, matchIndex: number): {
    handler: string;
    middleware: string[];
    sourceCode: string;
  } {
    // Split by commas, last item is usually the handler
    const parts = handlerPart.split(',').map(p => p.trim());
    const handler = parts[parts.length - 1];
    const middleware = parts.slice(0, -1);
    
    // Extract source code around the handler
    const sourceCode = this.extractHandlerCode(content, matchIndex, handler);
    
    return {
      handler: handler.replace(/\s*(async\s*)?.*?=>.*$/, '').trim(),
      middleware: middleware.map(m => m.trim()),
      sourceCode
    };
  }

  private extractHandlerCode(content: string, matchIndex: number, handler: string): string {
    // Try to extract the handler function body
    const lines = content.split('\n');
    const matchLine = content.substring(0, matchIndex).split('\n').length - 1;
    
    // Look for function body starting from match
    let startLine = matchLine;
    let endLine = Math.min(startLine + 20, lines.length - 1); // Get reasonable chunk
    
    // If it's an inline arrow function, try to get the full expression
    if (handler.includes('=>')) {
      let braceCount = 0;
      let inFunction = false;
      
      for (let i = startLine; i < lines.length && i < startLine + 50; i++) {
        const line = lines[i];
        
        if (line.includes('=>')) inFunction = true;
        if (!inFunction) continue;
        
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        if (braceCount <= 0 && inFunction) {
          endLine = i;
          break;
        }
      }
    }
    
    return lines.slice(startLine, endLine + 1).join('\n').trim();
  }

  private extractMethodBody(content: string, decoratorIndex: number, methodName: string): string {
    const lines = content.split('\n');
    const decoratorLine = content.substring(0, decoratorIndex).split('\n').length - 1;
    
    // Find the method definition
    let methodStartLine = -1;
    for (let i = decoratorLine; i < Math.min(decoratorLine + 10, lines.length); i++) {
      if (lines[i].includes(methodName + '(')) {
        methodStartLine = i;
        break;
      }
    }
    
    if (methodStartLine === -1) return '';
    
    // Find method end by tracking braces
    let braceCount = 0;
    let foundStart = false;
    let endLine = methodStartLine;
    
    for (let i = methodStartLine; i < lines.length; i++) {
      const line = lines[i];
      
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundStart = true;
        }
        if (char === '}') braceCount--;
      }
      
      if (foundStart && braceCount <= 0) {
        endLine = i;
        break;
      }
    }
    
    return lines.slice(methodStartLine, endLine + 1).join('\n').trim();
  }

  private extractNestJSMiddleware(beforeMethod: string): string[] {
    const middleware: string[] = [];
    
    // Look for common NestJS decorators
    const decoratorPatterns = [
      /@UseGuards?\s*\(\s*([^)]+)\)/g,
      /@UsePipes?\s*\(\s*([^)]+)\)/g,
      /@UseInterceptors?\s*\(\s*([^)]+)\)/g,
      /@Auth\s*\(\s*([^)]*)\)/g
    ];
    
    for (const pattern of decoratorPatterns) {
      let match;
      while ((match = pattern.exec(beforeMethod)) !== null) {
        middleware.push(match[1].trim());
      }
    }
    
    return middleware;
  }

  private extractDescription(content: string, matchIndex: number): string | undefined {
    const lines = content.split('\n');
    const matchLine = content.substring(0, matchIndex).split('\n').length - 1;
    
    // Look for comments above the route
    for (let i = matchLine - 1; i >= Math.max(0, matchLine - 5); i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        return line.replace('//', '').trim();
      }
      if (line.startsWith('/*') || line.startsWith('*')) {
        return line.replace(/^\/?\*+\s*/, '').replace(/\*+\/$/, '').trim();
      }
      if (line === '') continue; // Skip empty lines
      break; // Stop if we hit non-comment code
    }
    
    return undefined;
  }

  private async parseModels(content: string, file: string): Promise<ScannedModel[]> {
    const models: ScannedModel[] = [];
    
    // Prisma models
    const prismaPattern = /model\s+(\w+)\s*\{([^}]+)\}/gs;
    let match;
    while ((match = prismaPattern.exec(content)) !== null) {
      const [fullMatch, modelName, fieldsBlock] = match;
      const fields = this.parsePrismaFields(fieldsBlock);
      models.push({ name: modelName, fields, sourceFile: file });
    }
    
    // TypeORM entities
    const typeormPattern = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)[\s\S]*?\{([\s\S]*?)(?=class|\n\n|$)/gs;
    while ((match = typeormPattern.exec(content)) !== null) {
      const [fullMatch, className, classBody] = match;
      const fields = this.parseTypeORMFields(classBody);
      models.push({ name: className, fields, sourceFile: file });
    }
    
    // Mongoose schemas
    const mongoosePattern = /new\s+Schema\s*\(\s*\{([^}]+)\}/gs;
    while ((match = mongoosePattern.exec(content)) !== null) {
      const [fullMatch, schemaBody] = match;
      const fields = this.parseMongooseFields(schemaBody);
      // Try to find the model name
      const nameMatch = content.substring(0, match.index).match(/(\w+)Schema\s*=/);
      const modelName = nameMatch ? nameMatch[1] : 'UnknownModel';
      models.push({ name: modelName, fields, sourceFile: file });
    }
    
    // Drizzle tables
    const drizzlePattern = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{([^}]+)\}/gs;
    while ((match = drizzlePattern.exec(content)) !== null) {
      const [fullMatch, tableName, tableNameStr, fieldsBlock] = match;
      const fields = this.parseDrizzleFields(fieldsBlock);
      models.push({ name: tableName, fields, sourceFile: file });
    }
    
    return models;
  }

  private parsePrismaFields(fieldsBlock: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    for (const line of fieldsBlock.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      const match = trimmed.match(/^(\w+)\s+(\w+)(\??)(\s|$)/);
      if (match) {
        const [, fieldName, fieldType, optional] = match;
        fields.push({
          name: fieldName,
          type: fieldType,
          required: !optional
        });
      }
    }
    
    return fields;
  }

  private parseTypeORMFields(classBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const columnPattern = /@Column\s*\([^)]*\)\s*(\w+)(\??):\s*(\w+)/gs;
    let match;
    while ((match = columnPattern.exec(classBody)) !== null) {
      const [, fieldName, optional, fieldType] = match;
      fields.push({
        name: fieldName,
        type: fieldType,
        required: !optional
      });
    }
    
    return fields;
  }

  private parseMongooseFields(schemaBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const lines = schemaBody.split('\n');
    for (const line of lines) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      const match = trimmed.match(/^(\w+):\s*(\{[^}]+\}|\w+)/);
      if (match) {
        const [, fieldName, fieldDef] = match;
        let type = 'String';
        let required = false;
        
        if (fieldDef.includes('type:')) {
          const typeMatch = fieldDef.match(/type:\s*(\w+)/);
          if (typeMatch) type = typeMatch[1];
        } else {
          type = fieldDef;
        }
        
        if (fieldDef.includes('required: true')) {
          required = true;
        }
        
        fields.push({ name: fieldName, type, required });
      }
    }
    
    return fields;
  }

  private parseDrizzleFields(fieldsBlock: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const lines = fieldsBlock.split('\n');
    for (const line of lines) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed.startsWith('//')) continue;
      
      const match = trimmed.match(/^(\w+):\s*(\w+)\([^)]*\)(\.notNull\(\))?/);
      if (match) {
        const [, fieldName, fieldType, notNull] = match;
        fields.push({
          name: fieldName,
          type: fieldType,
          required: !!notNull
        });
      }
    }
    
    return fields;
  }
}