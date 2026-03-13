import { join } from 'path';
import { readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { LanguageParser, ScannedEndpoint, ScannedModel } from '../index.js';

export class JavaParser implements LanguageParser {
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
    const excludeDirs = ['target', 'build', '.git', 'node_modules', '.gradle'];

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
          if (item.endsWith('.java')) {
            files.push(itemRelativePath);
          }
        }
      }
    }

    await walk(projectDir);
    return files;
  }

  private async detectFramework(projectDir: string, files: string[]): Promise<string> {
    // Check for Spring Boot in pom.xml
    try {
      if (existsSync(join(projectDir, 'pom.xml'))) {
        const pom = await readFile(join(projectDir, 'pom.xml'), 'utf8');
        if (pom.includes('spring-boot-starter')) return 'spring-boot';
        if (pom.includes('spring-web')) return 'spring';
      }
    } catch (error) {
      // Continue with other checks
    }

    // Check for Spring Boot in build.gradle
    try {
      const gradleFiles = ['build.gradle', 'build.gradle.kts'];
      for (const gradleFile of gradleFiles) {
        if (existsSync(join(projectDir, gradleFile))) {
          const gradle = await readFile(join(projectDir, gradleFile), 'utf8');
          if (gradle.includes('spring-boot-starter')) return 'spring-boot';
          if (gradle.includes('spring-web')) return 'spring';
        }
      }
    } catch (error) {
      // Continue with source analysis
    }

    // Analyze source files for Spring annotations
    for (const file of files.slice(0, 20)) { // Sample first 20 files
      try {
        const content = await readFile(join(projectDir, file), 'utf8');
        
        if (/@RestController|@Controller|@GetMapping|@PostMapping/.test(content)) {
          return 'spring-boot';
        }
      } catch (error) {
        continue;
      }
    }

    return 'unknown';
  }

  private async parseRoutes(content: string, file: string, framework: string): Promise<ScannedEndpoint[]> {
    const routes: ScannedEndpoint[] = [];

    switch (framework) {
      case 'spring-boot':
      case 'spring':
        routes.push(...this.parseSpringRoutes(content, file));
        break;
    }

    return routes;
  }

  private parseSpringRoutes(content: string, file: string): ScannedEndpoint[] {
    const routes: ScannedEndpoint[] = [];
    
    // Extract class-level @RequestMapping first
    const classRequestMappingMatch = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']\s*\)/);
    const basePath = classRequestMappingMatch ? classRequestMappingMatch[1] : '';

    // Spring Boot HTTP method annotations
    const methodPatterns = [
      { annotation: 'GetMapping', method: 'GET' },
      { annotation: 'PostMapping', method: 'POST' },
      { annotation: 'PutMapping', method: 'PUT' },
      { annotation: 'DeleteMapping', method: 'DELETE' },
      { annotation: 'PatchMapping', method: 'PATCH' },
      { annotation: 'RequestMapping', method: 'REQUEST' } // Will need to parse method from annotation
    ];

    for (const { annotation, method } of methodPatterns) {
      // Pattern: @GetMapping("/users/{id}")
      //          public ResponseEntity<User> getUser(@PathVariable Long id) {
      const annotationPattern = new RegExp(
        `@${annotation}\\s*\\(\\s*(?:value\\s*=\\s*)?["']?([^"'\\)]*?)["']?\\s*\\)\\s*` +
        `(?:[^{]*?\\n)?\\s*(?:public|private|protected)?\\s*` +
        `(?:[^\\s]+\\s+)?([\\w<>\\[\\]\\s,]+)\\s+(\\w+)\\s*\\([^{]*?\\)\\s*\\{`,
        'gm'
      );

      let match;
      while ((match = annotationPattern.exec(content)) !== null) {
        const [fullMatch, path, returnType, methodName] = match;
        
        // Handle @RequestMapping which might specify method
        let actualMethod = method;
        if (annotation === 'RequestMapping') {
          const methodMatch = fullMatch.match(/method\s*=\s*RequestMethod\.(\w+)/);
          actualMethod = methodMatch ? methodMatch[1] : 'GET';
        }
        
        const fullPath = basePath + (path || '');
        const sourceCode = this.extractMethodBody(content, match.index, methodName);
        const description = this.extractDescription(content, match.index);
        const middleware = this.extractSpringMiddleware(fullMatch);

        routes.push({
          method: actualMethod.toUpperCase(),
          path: fullPath || '/',
          handler: methodName,
          sourceFile: file,
          sourceCode,
          middleware,
          description
        });
      }
    }

    return routes;
  }

  private extractMethodBody(content: string, startIndex: number, methodName: string): string {
    const lines = content.split('\n');
    const startLine = content.substring(0, startIndex).split('\n').length - 1;
    
    // Find the method definition line
    let methodStartLine = -1;
    for (let i = startLine; i < Math.min(startLine + 20, lines.length); i++) {
      if (lines[i].includes(methodName + '(')) {
        methodStartLine = i;
        break;
      }
    }
    
    if (methodStartLine === -1) return '';
    
    // Find the end of the method by tracking braces
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

  private extractSpringMiddleware(annotationBlock: string): string[] {
    const middleware: string[] = [];
    
    // Common Spring Security annotations
    const securityAnnotations = [
      /@PreAuthorize\s*\(\s*["']([^"']+)["']\s*\)/g,
      /@PostAuthorize\s*\(\s*["']([^"']+)["']\s*\)/g,
      /@Secured\s*\(\s*["']([^"']+)["']\s*\)/g,
      /@RolesAllowed\s*\(\s*["']([^"']+)["']\s*\)/g
    ];
    
    for (const pattern of securityAnnotations) {
      let match;
      while ((match = pattern.exec(annotationBlock)) !== null) {
        middleware.push(match[1].trim());
      }
    }
    
    // Validation annotations
    if (/@Valid/.test(annotationBlock)) {
      middleware.push('validation');
    }
    
    // Custom interceptors or filters would be harder to detect statically
    
    return middleware;
  }

  private extractDescription(content: string, matchIndex: number): string | undefined {
    const lines = content.split('\n');
    const matchLine = content.substring(0, matchIndex).split('\n').length - 1;
    
    // Look for Javadoc comments above the annotation
    for (let i = matchLine - 1; i >= Math.max(0, matchLine - 10); i--) {
      const line = lines[i].trim();
      
      // Single line comment
      if (line.startsWith('//')) {
        return line.replace('//', '').trim();
      }
      
      // End of Javadoc
      if (line === '*/') {
        // Find the start and extract content
        let javadocLines: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          const javadocLine = lines[j].trim();
          if (javadocLine.startsWith('/**')) {
            // Found the start, reverse and clean up
            javadocLines.reverse();
            return javadocLines
              .map(l => l.replace(/^\*\s?/, '').trim())
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
          }
          if (javadocLine.startsWith('*')) {
            javadocLines.push(javadocLine);
          }
        }
      }
      
      // Multi-line comment
      if (line.startsWith('/*') && line.endsWith('*/')) {
        return line.replace(/\/\*|\*\//g, '').trim();
      }
      
      if (line === '') continue; // Skip empty lines
      if (line.startsWith('@')) continue; // Skip other annotations
      break; // Stop if we hit non-comment code
    }
    
    return undefined;
  }

  private async parseModels(content: string, file: string): Promise<ScannedModel[]> {
    const models: ScannedModel[] = [];
    
    // JPA Entity classes
    models.push(...this.parseJPAEntities(content, file));
    
    // Data classes / POJOs that might be DTOs
    models.push(...this.parseDataClasses(content, file));
    
    return models;
  }

  private parseJPAEntities(content: string, file: string): ScannedModel[] {
    const models: ScannedModel[] = [];
    
    // JPA Entity pattern: @Entity class User { ... }
    const entityPattern = /@Entity\s*(?:\([^)]*\))?\s*(?:public\s+)?class\s+(\w+)[\s\S]*?\{([\s\S]*?)(?=class\s+\w+|$)/gm;
    
    let match;
    while ((match = entityPattern.exec(content)) !== null) {
      const [fullMatch, className, classBody] = match;
      const fields = this.parseJPAFields(classBody);
      models.push({ name: className, fields, sourceFile: file });
    }
    
    return models;
  }

  private parseDataClasses(content: string, file: string): ScannedModel[] {
    const models: ScannedModel[] = [];
    
    // Look for classes that might be DTOs/data classes
    // Classes with public fields or getters/setters
    const classPattern = /(?:public\s+)?class\s+(\w+)[\s\S]*?\{([\s\S]*?)(?=class\s+\w+|$)/gm;
    
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const [fullMatch, className, classBody] = match;
      
      // Skip if it's already an entity
      if (fullMatch.includes('@Entity')) continue;
      
      const fields = this.parseJavaFields(classBody);
      
      // Only consider it a model if it has fields
      if (fields.length > 0) {
        models.push({ name: className, fields, sourceFile: file });
      }
    }
    
    return models;
  }

  private parseJPAFields(classBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    // JPA field patterns: @Column private String name;
    const jpaFieldPattern = /@Column\s*(?:\([^)]*\))?\s*(?:@\w+\s*(?:\([^)]*\))?\s*)*(?:private|protected|public)?\s+([A-Za-z<>\[\]]+)\s+(\w+)\s*;/gm;
    
    let match;
    while ((match = jpaFieldPattern.exec(classBody)) !== null) {
      const [fullMatch, fieldType, fieldName] = match;
      
      // Check if field is nullable
      const required = !fullMatch.includes('nullable = true') && 
                     !fullMatch.includes('@Nullable') &&
                     !fieldType.includes('Optional');
      
      fields.push({
        name: fieldName,
        type: fieldType,
        required
      });
    }
    
    // Also look for @Id fields
    const idFieldPattern = /@Id\s*(?:@\w+\s*(?:\([^)]*\))?\s*)*(?:private|protected|public)?\s+([A-Za-z<>\[\]]+)\s+(\w+)\s*;/gm;
    
    while ((match = idFieldPattern.exec(classBody)) !== null) {
      const [fullMatch, fieldType, fieldName] = match;
      
      // ID fields are typically required
      fields.push({
        name: fieldName,
        type: fieldType,
        required: true
      });
    }
    
    return fields;
  }

  private parseJavaFields(classBody: string): Array<{ name: string; type: string; required: boolean }> {
    const fields: Array<{ name: string; type: string; required: boolean }> = [];
    
    // Regular field declarations
    const fieldPattern = /(?:private|protected|public)\s+([A-Za-z<>\[\]]+)\s+(\w+)\s*(?:=\s*[^;]+)?;/gm;
    
    let match;
    while ((match = fieldPattern.exec(classBody)) !== null) {
      const [fullMatch, fieldType, fieldName] = match;
      
      // Skip static and final fields (constants)
      if (fullMatch.includes('static') || fullMatch.includes('final')) continue;
      
      // Assume required unless it's explicitly Optional or has a default value
      const required = !fieldType.includes('Optional') && !fullMatch.includes(' = ');
      
      fields.push({
        name: fieldName,
        type: fieldType,
        required
      });
    }
    
    // Also look for getter/setter patterns to infer fields
    const getterPattern = /public\s+([A-Za-z<>\[\]]+)\s+get([A-Z]\w*)\s*\(\s*\)/gm;
    const foundGetters = new Set<string>();
    
    while ((match = getterPattern.exec(classBody)) !== null) {
      const [fullMatch, returnType, propertyName] = match;
      const fieldName = propertyName.charAt(0).toLowerCase() + propertyName.slice(1);
      
      if (!foundGetters.has(fieldName)) {
        foundGetters.add(fieldName);
        
        // Check if there's a corresponding setter
        const setterPattern = new RegExp(`public\\s+void\\s+set${propertyName}\\s*\\(`);
        const hasSetter = setterPattern.test(classBody);
        
        // If no explicit field declaration was found, add from getter/setter
        const hasExplicitField = fields.some(f => f.name === fieldName);
        if (!hasExplicitField) {
          fields.push({
            name: fieldName,
            type: returnType,
            required: !returnType.includes('Optional')
          });
        }
      }
    }
    
    return fields;
  }
}