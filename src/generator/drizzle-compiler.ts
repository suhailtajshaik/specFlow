import type { JsonSchema } from '../parser/types.js';

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  relationships: RelationshipDefinition[];
  indexes: IndexDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  constraints: string[];
  defaultValue?: string;
}

export interface RelationshipDefinition {
  type: 'oneToMany' | 'manyToOne' | 'manyToMany';
  targetTable: string;
  foreignKey: string;
  referenceKey?: string;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

export class DrizzleCompiler {
  compileSchemas(schemas: Record<string, JsonSchema>): string {
    const imports = this.generateImports();
    const tables = this.generateTables(schemas);
    const relationships = this.generateRelationships(schemas);

    return [imports, tables, relationships].filter(Boolean).join('\n\n') + '\n';
  }

  private generateImports(): string {
    return `import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, serial, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';`;
  }

  private generateTables(schemas: Record<string, JsonSchema>): string {
    const tables: string[] = [];

    for (const [schemaName, schema] of Object.entries(schemas)) {
      if (schema.type === 'object' && this.isEntitySchema(schema)) {
        const tableName = this.toTableName(schemaName);
        const tableDefinition = this.generateTableDefinition(tableName, schema);
        tables.push(tableDefinition);
      }
    }

    return tables.join('\n\n');
  }

  private isEntitySchema(schema: JsonSchema): boolean {
    // Consider it an entity if it has an id field and multiple properties
    const hasId = schema.properties && 'id' in schema.properties;
    const hasMultipleProps = schema.properties && Object.keys(schema.properties).length > 1;
    return !!(hasId && hasMultipleProps);
  }

  private generateTableDefinition(tableName: string, schema: JsonSchema): string {
    const columns: string[] = [];
    const indexes: string[] = [];

    if (!schema.properties) {
      throw new Error(`Schema for ${tableName} has no properties`);
    }

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const columnDef = this.generateColumn(propName, propSchema as JsonSchema, schema.required || []);
      columns.push(`  ${columnDef.code}`);
      
      // Add indexes for commonly indexed fields
      if (this.shouldIndex(propName, propSchema as JsonSchema)) {
        indexes.push(`  ${tableName}${this.toPascalCase(propName)}Idx: index('${tableName}_${propName}_idx').on(table.${this.toColumnName(propName)})`);
      }
    }

    // Add audit fields if not already present
    if (!('createdAt' in schema.properties)) {
      columns.push(`  createdAt: timestamp('created_at').defaultNow().notNull()`);
    }
    if (!('updatedAt' in schema.properties)) {
      columns.push(`  updatedAt: timestamp('updated_at').defaultNow().notNull()`);
    }

    const indexSection = indexes.length > 0 ? `, (table) => ({\n${indexes.join(',\n')}\n})` : '';

    return `export const ${tableName} = pgTable('${this.toSnakeCase(tableName)}', {
${columns.join(',\n')}
}${indexSection});`;
  }

  private generateColumn(propName: string, propSchema: JsonSchema, required: string[]): { code: string } {
    const columnName = this.toColumnName(propName);
    const isRequired = required.includes(propName);
    let drizzleType = this.mapToDrizzleType(propName, propSchema);
    const constraints: string[] = [];

    // Add constraints based on schema
    if (isRequired || propName === 'id') {
      constraints.push('.notNull()');
    }

    // Primary key
    if (propName === 'id') {
      if (propSchema.format === 'uuid') {
        drizzleType = "uuid('id')";
        constraints.push('.defaultRandom()', '.primaryKey()');
      } else {
        constraints.push('.primaryKey()');
      }
    }

    // Unique constraints
    if (propName === 'email' || (propSchema as any).unique) {
      constraints.push('.unique()');
    }

    // Default values
    if ((propSchema as any).default !== undefined) {
      const defaultVal = JSON.stringify((propSchema as any).default);
      constraints.push(`.default(${defaultVal})`);
    }

    // Special defaults for common patterns
    if (propName === 'status' && !constraints.some(c => c.includes('default'))) {
      constraints.push(".default('active')");
    }

    const constraintString = constraints.join('');
    
    return {
      code: `${columnName}: ${drizzleType}${constraintString}`
    };
  }

  private mapToDrizzleType(propName: string, schema: JsonSchema): string {
    if (schema.type === 'string') {
      if (schema.format === 'uuid') {
        return `uuid('${this.toSnakeCase(propName)}')`;
      }
      if (schema.format === 'email' || propName === 'email') {
        return `varchar('${this.toSnakeCase(propName)}', { length: 255 })`;
      }
      if (schema.format === 'date-time' || propName.includes('At') || propName.includes('Date')) {
        return `timestamp('${this.toSnakeCase(propName)}')`;
      }
      if (schema.maxLength && schema.maxLength <= 255) {
        return `varchar('${this.toSnakeCase(propName)}', { length: ${schema.maxLength} })`;
      }
      if (propName.includes('password') || propName.includes('hash')) {
        return `varchar('${this.toSnakeCase(propName)}', { length: 255 })`;
      }
      // For longer text or no maxLength specified
      return `text('${this.toSnakeCase(propName)}')`;
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      return `integer('${this.toSnakeCase(propName)}')`;
    }

    if (schema.type === 'boolean') {
      return `boolean('${this.toSnakeCase(propName)}')`;
    }

    if (schema.type === 'object' || schema.type === 'array') {
      return `jsonb('${this.toSnakeCase(propName)}')`;
    }

    // Fallback to text
    return `text('${this.toSnakeCase(propName)}')`;
  }

  private shouldIndex(propName: string, schema: JsonSchema): boolean {
    // Index commonly queried fields
    const indexableFields = ['email', 'status', 'userId', 'createdAt', 'updatedAt'];
    const isIndexableField = indexableFields.some(field => 
      propName.toLowerCase().includes(field.toLowerCase())
    );

    // Index foreign keys (fields ending with Id)
    const isForeignKey = propName.endsWith('Id') && propName !== 'id';

    // Index unique fields
    const isUnique = (schema as any).unique === true;

    return isIndexableField || isForeignKey || isUnique;
  }

  private generateRelationships(schemas: Record<string, JsonSchema>): string {
    // For now, return empty string
    // In a full implementation, this would analyze foreign key relationships
    // and generate Drizzle relations
    return '';
  }

  private toTableName(schemaName: string): string {
    // Convert to plural snake_case
    let name = this.toSnakeCase(schemaName);
    
    // Simple pluralization
    if (name.endsWith('y')) {
      name = name.slice(0, -1) + 'ies';
    } else if (!name.endsWith('s')) {
      name += 's';
    }
    
    return name;
  }

  private toColumnName(propName: string): string {
    return this.toCamelCase(propName);
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + 
           str.slice(1).replace(/[-_](.)/g, (_, char) => char.toUpperCase());
  }

  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + this.toCamelCase(str).slice(1);
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }
}