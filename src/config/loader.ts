import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import type { SpecFlowConfig } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';

export function loadConfig(configPath: string = './specflow.config.yaml'): SpecFlowConfig {
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const configFile = readFileSync(configPath, 'utf-8');
    const userConfig = parse(configFile) as Partial<SpecFlowConfig>;
    
    // Deep merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      project: { ...DEFAULT_CONFIG.project, ...userConfig.project },
      llm: { ...DEFAULT_CONFIG.llm, ...userConfig.llm },
      output: { ...DEFAULT_CONFIG.output, ...userConfig.output },
      requirements: { ...DEFAULT_CONFIG.requirements, ...userConfig.requirements }
    };
  } catch (error) {
    console.warn(`Warning: Failed to load config from ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }
}

export function resolveApiKey(provider: string, apiKey?: string): string | undefined {
  if (apiKey) return apiKey;
  
  const envMap = {
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY', 
    llamacpp: 'LLAMACPP_API_KEY'
  };
  
  const envVar = envMap[provider as keyof typeof envMap];
  return envVar ? process.env[envVar] : undefined;
}