import { join } from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { LanguageParser, ScannedEndpoint, ScannedModel } from '../index.js';

export class PythonParser implements LanguageParser {
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
      const fileModels = await this.parseModels(content, file, framework);
      models.push(...fileModels);
    }

    return { framework, endpoints, models };
  }

  private async getSourceFiles(projectDir: string): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = ['__pycache__', '.git', 'venv', 'env', '.venv', 'node_modules', 'dist'];

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
          if (item.endsWith('.py')) {
            files.push(itemRelativePath);
          }
        }
      }
    }

    await walk(projectDir);
    return files;
  }

  private async detectFramework(projectDir: string, files: string[]): Promise<string> {
    // Check requirements.txt
    try {
      if (existsSync(join(projectDir, 'requirements.txt'))) {
        const requirements = await readFile(join(projectDir, 'requirements.txt'), 'utf8');
        if (requirements.includes('fastapi')) return 'fastapi';
        if (requirements.includes('django')) return 'django';
        if (requirements.includes('flask')) return 'flask';
      }
    } catch (error) {
      // Continue with source analysis
    }

    // Check pyproject.toml
    try {
      if (existsSync(join(projectDir, 'pyproject.toml'))) {
        const pyproject = await readFile(join(projectDir, 'pyproject.toml'), 'utf8');
        if (pyproject.includes('fastapi')) return 'fastapi';
        if (pyproject.includes('django')) return 'django';
        if (pyproject.includes('flask')) return 'flask';
      }
    } catch (error) {
      // Continue with source analysis
    }

    // Analyze source files for framework patterns
    for (const file of files.slice(0, 20)) { // Sample first 20 files
      try {
        const content = await readFile(join(projectDir, file), 'utf8');
        
        if (/from fastapi import|import fastapi/m.test(content)) return 'fastapi';
        if (/from django|import django|from django\.urls/m.test(content)) return 'django';
        if (/from flask import|import flask/m.test(content)) return 'flask';
      } catch (error) {
        continue;
      }
    }

    return 'unknown';
  }

  private async parseRoutes(content: string, file: string, framework: string): Promise<ScannedEndpoint[]> {
    const routes: ScannedEndpoint[] = [];

    switch (framework) {
      case 'fastapi':
        routes.push(...this.parseFastAPIRoutes(content, file));
        break;
      case 'django':
        routes.push(...this.parseDjangoRoutes(content, file));
        break;
      case 'flask':
        routes.push(...this.parseFlaskRoutes(content, file));
        break;
    }

    return routes;
  }

  private parseFastAPIRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // FastAPI patterns: @app.get("/path") or @router.post("/path")
    const fastApiPattern = /@(app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']\s*(?:,\s*([^)]*))?\s*\)\s*(?:async\s+)?def\s+(\w+)\s*\([^)]*\):/gm;
    
    let match;
    while ((match = fastApiPattern.exec(content)) !== null) {
      const [fullMatch, appOrRouter, method, path, options, functionName] = match;
      
      const sourceCode = this.extractFunctionBody(content, match.index, functionName);
      const description = this.extractDescription(content, match.index);
      
      routes.push({
        method: method.toUpperCase(),
        path,
        handler: functionName,
        sourceFile: file,
        sourceCode,
        middleware: this.parseFastAPIMiddleware(options || ''),
        description
      });
    }

    return routes;
  }

  private parseFlaskRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Flask patterns: @app.route("/path", methods=["GET"]) or @blueprint.route
    const flaskRoutePattern = /@(app|blueprint|[\w_]+)\.route\s*\(\s*["']([^"']+)["']\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)\s*(?:def\s+(\w+)|$)/gm;
    
    let match;
    while ((match = flaskRoutePattern.exec(content)) !== null) {
      const [fullMatch, appOrBlueprint, path, methodsStr, functionName] = match;
      
      if (!functionName) {
        // Look for function definition on next non-empty line
        const lines = content.substring(match.index).split('\n');
        for (const line of lines.slice(1, 5)) {
          const funcMatch = line.match(/def\s+(\w+)\s*\(/);
          if (funcMatch) {
            const actualFunctionName = funcMatch[1];
            const sourceCode = this.extractFunctionBody(content, match.index, actualFunctionName);
            const description = this.extractDescription(content, match.index);
            
            const methods = methodsStr ? this.parseFlaskMethods(methodsStr) : ['GET'];
            for (const method of methods) {
              routes.push({
                method: method.toUpperCase(),
                path,
                handler: actualFunctionName,
                sourceFile: file,
                sourceCode,
                middleware: [],
                description
              });
            }
            break;
          }
        }
      } else {
        const sourceCode = this.extractFunctionBody(content, match.index, functionName);
        const description = this.extractDescription(content, match.index);
        
        const methods = methodsStr ? this.parseFlaskMethods(methodsStr) : ['GET'];
        for (const method of methods) {
          routes.push({
            method: method.toUpperCase(),
            path,
            handler: functionName,
            sourceFile: file,
            sourceCode,
            middleware: [],
            description
          });
        }
      }
    }

    return routes;
  }

  private parseDjangoRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Django URL patterns in urls.py files
    if (file.endsWith('urls.py')) {
      // path('users/', views.UserListView.as_view())
      const pathPattern = /path\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^,)]+)(?:\s*,\s*([^)]*))?\s*\)/gm;
      
      let match;
      while ((match = pathPattern.exec(content)) !== null) {
        const [fullMatch, urlPath, viewRef, options] = match;
        
        const description = this.extractDescription(content, match.index);
        
        // Extract view name from reference (e.g., views.UserListView.as_view() -> UserListView)
        const viewName = this.extractDjangoViewName(viewRef);
        
        // Django doesn't specify HTTP methods in URL patterns, so we'll assume common ones
        // Real Django apps would need view class analysis
        routes.push({
          method: 'GET',
          path: urlPath.startsWith('/') ? urlPath : '/' + urlPath,
          handler: viewName,
          sourceFile: file,
          sourceCode: fullMatch,
          middleware: [],
          description
        });
      }
    }
    
    // Django class-based views with explicit method handlers
    const viewClassPattern = /class\s+(\w+)\s*\([^)]*View[^)]*\)\s*:[\s\S]*?(?=class|$)/gm;
    
    let match;
    while ((match = viewClassPattern.exec(content)) !== null) {
      const [fullMatch, className] = match;
      
      // Look for HTTP method handlers in the class
      const methodPattern = /def\s+(get|post|put|patch|delete)\s*\([^)]*\):/gm;
      let methodMatch;
      
      while ((methodMatch = methodPattern.exec(fullMatch)) !== null) {
        const [methodFullMatch, method] = methodMatch;
        const sourceCode = this.extractFunctionBody(fullMatch, methodMatch.index, method);
        
        routes.push({
          method: method.toUpperCase(),
          path: '/', // Path determined by URL routing
          handler: `${className}.${method}`,
          sourceFile: file,
          sourceCode,
          middleware: [],
          description: this.extractDescription(fullMatch, methodMatch.index)
        });
      }
    }

    return routes;
  }

  private parseFlaskMethods(methodsStr: string): string[] {
    // Parse methods=["GET", "POST"] or methods=['GET', 'POST']
    const methodMatches = methodsStr.match(/["'](\w+)["']/g);
    return methodMatches ? methodMatches.map(m => m.replace(/["']/g, '')) : ['GET'];
  }

  private parseFastAPIMiddleware(options: string): string[] {
    const middleware: string[] = [];
    
    // Look for dependencies, status_code, etc.
    if (options.includes('dependencies=')) {
      const depMatch = options.match(/dependencies\s*=\s*\[([^\]]+)\]/);
      if (depMatch) {
        middleware.push(`dependencies: ${depMatch[1].trim()}`);
      }
    }
    
    if (options.includes('status_code=')) {
      const statusMatch = options.match(/status_code\s*=\s*(\d+)/);
      if (statusMatch) {
        middleware.push(`status_code: ${statusMatch[1]}`);
      }
    }
    
    return middleware;
  }

  private extractDjangoViewName(viewRef: string): string {
    // views.UserListView.as_view() -> UserListView
    // views.user_list -> user_list
    const classMatch = viewRef.match(/(\w+)\.as_view\(\)/);
    if (classMatch) return classMatch[1];
    
    const functionMatch = viewRef.match(/views\.(\w+)/);
    if (functionMatch) return functionMatch[1];
    
    return viewRef.trim();
  }

  private extractFunctionBody(content: string, startIndex: number, functionName: string): string {
    const lines = content.split('\n');
    const startLine = content.substring(0, startIndex).split('\n').length - 1;
    
    // Find the function definition line
    let functionStartLine = -1;
    for (let i = startLine; i < Math.min(startLine + 10, lines.length); i++) {
      if (lines[i].includes(`def ${functionName}`)) {
        functionStartLine = i;
        break;
      }
    }
    
    if (functionStartLine === -1) return '';
    
    // Find the end of the function by tracking indentation
    const functionIndent = lines[functionStartLine].match(/^(\s*)/)?.[1] || '';
    let endLine = functionStartLine;
    
    for (let i = functionStartLine + 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Empty line or comment, continue
      if (line.trim() === '' || line.trim().startsWith('#')) {
        continue;
      }
      
      // If line is less indented than function (or same), we've reached the end
      const lineIndent = line.match(/^(\s*)/)?.[1] || '';
      if (lineIndent.length <= functionIndent.length && line.trim() !== '') {
        endLine = i - 1;
        break;
      }
      
      endLine = i;
    }
    
    return lines.slice(functionStartLine, endLine + 1).join('\n').trim();
  }

  private extractDescription(content: string, matchIndex: number): string | undefined {
    const lines = content.split('\n');
    const matchLine = content.substring(0, matchIndex).split('\n').length - 1;
    
    // Look for comments above the decorator/route
    for (let i = matchLine - 1; i >= Math.max(0, matchLine - 5); i--) {
      const line = lines[i].trim();
      if (line.startsWith('#')) {
        return line.replace('#', '').trim();
      }
      if (line.startsWith('"""') || line.startsWith("'''")) {
        // Multi-line docstring
        const docstring = this.extractDocstring(lines, i);
        if (docstring) return docstring;
      }
      if (line === '') continue; // Skip empty lines
      break; // Stop if we hit non-comment code
    }
    
    return undefined;
  }

  private extractDocstring(lines: string[], startLine: number): string | undefined {
    const quote = lines[startLine].includes('"""') ? '"""' : "'''";
    let docstring = '';
    
    // Single line docstring
    if (lines[startLine].trim().endsWith(quote)) {
      return lines[startLine].replace(new RegExp(quote, 'g'), '').trim();
    }
    
    // Multi-line docstring
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      docstring += line + '\n';
      
      if (i > startLine && line.includes(quote)) {
        return docstring.replace(new RegExp(quote, 'g'), '').trim();
      }
    }
    
    return undefined;
  }

  private async parseModels(content: string, file: string, framework: string): Promise<ScannedModel[]> {
    const models: ScannedModel[] = [];
    
    switch (framework) {
      case 'django':
        models.push(...this.parseDjangoModels(content, file));
        break;
      case 'fastapi':
        models.push(...this.parsePydanticModels(content, file));
        break;
      case 'flask':
        models.push(...this.parseSQLAlchemyModels(content, file));
        break;
    }
    
    return models;
  }

  private parseDjangoModels(content: string, file: string): ScannedModel[] {
    const models: ScannedModel[] = [];
    
    // Django model classes: class User(models.Model):
    const modelPattern = /class\s+(\w+)\s*\(\s*models\.Model\s*\)\s*:([\s\S]*?)(?=class\s+\w+|$)/gm;
    
    let match;
    while ((match = modelPattern.exec(content)) !== null) {
      const [fullMatch, modelName, modelBody] = match;
      const fields = this.parseDjangoModelFields(modelBody);
      models.push({ name: modelName, fields, sourceFile: file });
    }
    
    return models;
  }

  private parsePydanticModels(content: string, file: string): ScannedModel[] {
    const models: ScannedModel[] = [];
    
    // Pydantic models: class User(BaseModel):
    const modelPattern = /class\s+(\w+)\s*\(\s*BaseModel\s*\)\s*:([\s\S]*?)(?=class\s+\w+|$)/gm;
    
    let match;
    while ((match = modelPattern.exec(content)) !== null) {
      const [fullMatch, modelName, modelBody] = match;
      const fields = this.parsePydanticModelFields(modelBody);
      models.push({ name: modelName, fields, sourceFile: file });
    }
    
    return models;
  }

  private parseSQLAlchemyModels(content: string, file: string): ScannedModel[] {
    const models: ScannedModel[] = [];
    
    // SQLAlchemy models: class User(db.Model):
    const modelPattern = /class\s+(\w+)\s*\(\s*db\.Model\s*\)\s*:([\s\S]*?)(?=class\s+\w+|$)/gm;
    
    let match;
    while ((match = modelPattern.exec(content)) !== null) {
      const [fullMatch, modelName, modelBody] = match;
      const fields = this.parseSQLAlchemyModelFields(modelBody);
      models.push({ name: modelName, fields, sourceFile: file });
    }
    
    return models;
  }

  private parseDjangoModelFields(modelBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const fieldPattern = /(\w+)\s*=\s*models\.(\w+Field)\s*\(([^)]*)\)/gm;
    
    let match;
    while ((match = fieldPattern.exec(modelBody)) !== null) {
      const [fullMatch, fieldName, fieldType, options] = match;
      const required = !options.includes('null=True') && !options.includes('blank=True');
      
      fields.push({
        name: fieldName,
        type: fieldType,
        required
      });
    }
    
    return fields;
  }

  private parsePydanticModelFields(modelBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const lines = modelBody.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // field_name: str = Field(...)
      // field_name: Optional[str] = None
      const fieldMatch = trimmed.match(/^(\w+)\s*:\s*(Optional\[)?([^\]=\s]+)[\]]*\s*(?:=\s*(.+))?$/);
      if (fieldMatch) {
        const [, fieldName, optional, fieldType, defaultValue] = fieldMatch;
        const required = !optional && !defaultValue;
        
        fields.push({
          name: fieldName,
          type: fieldType,
          required
        });
      }
    }
    
    return fields;
  }

  private parseSQLAlchemyModelFields(modelBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    const fieldPattern = /(\w+)\s*=\s*db\.Column\s*\(\s*db\.(\w+)(?:\([^)]*\))?\s*(?:,\s*([^)]*))?\s*\)/gm;
    
    let match;
    while ((match = fieldPattern.exec(modelBody)) !== null) {
      const [fullMatch, fieldName, fieldType, options] = match;
      const required = !(options && options.includes('nullable=True'));
      
      fields.push({
        name: fieldName,
        type: fieldType,
        required
      });
    }
    
    return fields;
  }
}