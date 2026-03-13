import type { JsonSchema } from '../parser/types.js';

export class ZodCompiler {
  compile(schema: JsonSchema, name: string = 'schema'): string {
    const zodCode = this.generateZodCode(schema);
    return `export const ${name} = ${zodCode};`;
  }

  private generateZodCode(schema: JsonSchema): string {
    if (!schema.type) {
      throw new Error('Schema must have a type property');
    }

    switch (schema.type) {
      case 'string':
        return this.generateStringSchema(schema);
      case 'number':
      case 'integer':
        return this.generateNumberSchema(schema);
      case 'boolean':
        return 'z.boolean()';
      case 'array':
        return this.generateArraySchema(schema);
      case 'object':
        return this.generateObjectSchema(schema);
      case 'null':
        return 'z.null()';
      default:
        throw new Error(`Unsupported schema type: ${schema.type}`);
    }
  }

  private generateStringSchema(schema: JsonSchema): string {
    let result = 'z.string()';

    // Format validations
    if (schema.format) {
      switch (schema.format) {
        case 'email':
          result += '.email()';
          break;
        case 'uuid':
          result += '.uuid()';
          break;
        case 'url':
          result += '.url()';
          break;
        case 'date-time':
          result += '.datetime()';
          break;
        case 'date':
          result += '.date()';
          break;
        default:
          // For custom formats, we'll use regex if pattern is provided
          break;
      }
    }

    // Length constraints
    if (schema.minLength !== undefined) {
      result += `.min(${schema.minLength})`;
    }
    if (schema.maxLength !== undefined) {
      result += `.max(${schema.maxLength})`;
    }

    // Pattern validation
    if (schema.pattern) {
      const escapedPattern = schema.pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      result += `.regex(new RegExp('${escapedPattern}'))`;
    }

    // Enum values
    if (schema.enum && Array.isArray(schema.enum)) {
      const enumValues = schema.enum.map(val => `'${val}'`).join(', ');
      result = `z.enum([${enumValues}])`;
    }

    return result;
  }

  private generateNumberSchema(schema: JsonSchema): string {
    const isInteger = schema.type === 'integer';
    let result = isInteger ? 'z.number().int()' : 'z.number()';

    if (schema.minimum !== undefined) {
      result += `.min(${schema.minimum})`;
    }
    if (schema.maximum !== undefined) {
      result += `.max(${schema.maximum})`;
    }

    return result;
  }

  private generateArraySchema(schema: JsonSchema): string {
    if (!schema.items) {
      return 'z.array(z.unknown())';
    }

    const itemSchema = this.generateZodCode(schema.items);
    return `z.array(${itemSchema})`;
  }

  private generateObjectSchema(schema: JsonSchema): string {
    if (!schema.properties) {
      return 'z.object({})';
    }

    const properties: string[] = [];
    const required = schema.required || [];

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      let propZod = this.generateZodCode(propSchema as JsonSchema);
      
      // Add description as comment if available
      if ((propSchema as JsonSchema).description) {
        propZod += ` // ${(propSchema as JsonSchema).description}`;
      }

      // Make optional if not in required array
      if (!required.includes(key)) {
        propZod += '.optional()';
      }

      properties.push(`  ${this.sanitizePropertyName(key)}: ${propZod}`);
    }

    let result = `z.object({\n${properties.join(',\n')}\n})`;

    // Handle additionalProperties
    if (schema.additionalProperties === false) {
      result += '.strict()';
    }

    return result;
  }

  private sanitizePropertyName(name: string): string {
    // If property name is a valid identifier, use it as-is
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      return name;
    }
    
    // Otherwise, quote it
    return `'${name}'`;
  }

  // Utility method to generate multiple schemas
  compileSchemas(schemas: Record<string, JsonSchema>): string {
    const imports = "import { z } from 'zod';\n\n";
    
    const compiledSchemas = Object.entries(schemas).map(([name, schema]) => {
      return this.compile(schema, `${this.toPascalCase(name)}Schema`);
    });

    return imports + compiledSchemas.join('\n\n') + '\n';
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .replace(/\s+/g, '');
  }
}