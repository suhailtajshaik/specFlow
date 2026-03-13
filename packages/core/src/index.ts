export { SpecFlow } from './specflow.js';
export type { 
  SpecFlowOptions, 
  PrepareOptions, 
  GenerateOptions, 
  ScanOptions,
  PrepareResult,
  GenerateResult,
  ScanResult 
} from './specflow.js';

// Re-export useful types
export type { GeneratedFile } from './generator/index.js';
export type { SpecFlowConfig } from './config/types.js';
export type { LLMProvider } from './llm/provider.js';
export { ZodCompiler } from './generator/zod-compiler.js';
export { DrizzleCompiler } from './generator/drizzle-compiler.js';
export { createProvider } from './llm/provider.js';