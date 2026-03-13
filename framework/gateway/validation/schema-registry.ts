import { z } from 'zod'

export interface JsonSchema {
  type?: string
  properties?: Record<string, any>
  required?: string[]
  items?: JsonSchema
  enum?: any[]
  format?: string
  pattern?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  additionalProperties?: boolean | JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
}

class SchemaRegistry {
  private cache = new Map<string, z.ZodSchema>()

  public compile(jsonSchema: JsonSchema): z.ZodSchema {
    const key = JSON.stringify(jsonSchema)
    
    const cached = this.cache.get(key)
    if (cached) return cached

    const zodSchema = this.convertJsonSchemaToZod(jsonSchema)
    this.cache.set(key, zodSchema)
    
    return zodSchema
  }

  private convertJsonSchemaToZod(schema: JsonSchema): z.ZodSchema {
    if (schema.$ref) {
      throw new Error(`$ref not supported: ${schema.$ref}`)
    }

    if (schema.anyOf) {
      const schemas = schema.anyOf.map(s => this.convertJsonSchemaToZod(s))
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]])
    }

    if (schema.oneOf) {
      const schemas = schema.oneOf.map(s => this.convertJsonSchemaToZod(s))
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]])
    }

    if (schema.allOf) {
      // Merge all schemas - simplified approach
      return schema.allOf.reduce(
        (acc, subSchema) => acc.and(this.convertJsonSchemaToZod(subSchema)),
        z.object({}) as z.ZodSchema
      )
    }

    if (schema.enum) {
      const [first, ...rest] = schema.enum
      return z.enum([first, ...rest])
    }

    switch (schema.type) {
      case 'string':
        return this.createStringSchema(schema)
      case 'number':
        return this.createNumberSchema(schema)
      case 'integer':
        return this.createIntegerSchema(schema)
      case 'boolean':
        return z.boolean()
      case 'array':
        return this.createArraySchema(schema)
      case 'object':
        return this.createObjectSchema(schema)
      case 'null':
        return z.null()
      default:
        return z.unknown()
    }
  }

  private createStringSchema(schema: JsonSchema): z.ZodString {
    let zodString = z.string()

    if (schema.minLength !== undefined) {
      zodString = zodString.min(schema.minLength)
    }
    if (schema.maxLength !== undefined) {
      zodString = zodString.max(schema.maxLength)
    }
    if (schema.pattern) {
      zodString = zodString.regex(new RegExp(schema.pattern))
    }
    if (schema.format) {
      switch (schema.format) {
        case 'email':
          zodString = zodString.email()
          break
        case 'uri':
        case 'url':
          zodString = zodString.url()
          break
        case 'uuid':
          zodString = zodString.uuid()
          break
        case 'date-time':
          zodString = zodString.datetime()
          break
      }
    }

    return zodString
  }

  private createNumberSchema(schema: JsonSchema): z.ZodNumber {
    let zodNumber = z.number()

    if (schema.minimum !== undefined) {
      zodNumber = zodNumber.min(schema.minimum)
    }
    if (schema.maximum !== undefined) {
      zodNumber = zodNumber.max(schema.maximum)
    }

    return zodNumber
  }

  private createIntegerSchema(schema: JsonSchema): z.ZodNumber {
    let zodNumber = z.number().int()

    if (schema.minimum !== undefined) {
      zodNumber = zodNumber.min(schema.minimum)
    }
    if (schema.maximum !== undefined) {
      zodNumber = zodNumber.max(schema.maximum)
    }

    return zodNumber
  }

  private createArraySchema(schema: JsonSchema): z.ZodArray<any> {
    if (!schema.items) {
      return z.array(z.unknown())
    }

    const itemSchema = this.convertJsonSchemaToZod(schema.items)
    return z.array(itemSchema)
  }

  private createObjectSchema(schema: JsonSchema): z.ZodObject<any> {
    const shape: Record<string, z.ZodSchema> = {}

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        let zodProp = this.convertJsonSchemaToZod(propSchema as JsonSchema)
        
        // Make optional if not in required array
        if (!schema.required?.includes(key)) {
          zodProp = zodProp.optional()
        }
        
        shape[key] = zodProp
      }
    }

    let zodObject = z.object(shape)

    // Handle additionalProperties
    if (schema.additionalProperties === false) {
      zodObject = zodObject.strict()
    }

    return zodObject
  }

  public clearCache(): void {
    this.cache.clear()
  }
}

export const schemaRegistry = new SchemaRegistry()