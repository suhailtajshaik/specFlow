export interface LLMProvider {
  name: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  generateJSON<T>(systemPrompt: string, userPrompt: string, schema?: object): Promise<T>;
}

export interface LLMConfig {
  provider: 'gemini' | 'claude' | 'llamacpp';
  model?: string;
  apiKey?: string;
}

export async function createProvider(config: LLMConfig): Promise<LLMProvider> {
  const { provider, model, apiKey } = config;
  
  switch (provider) {
    case 'gemini':
      const { GeminiProvider } = await import('./gemini.js');
      return new GeminiProvider(model, apiKey);
    
    case 'claude':
      const { ClaudeProvider } = await import('./claude.js');
      return new ClaudeProvider(model, apiKey);
    
    case 'llamacpp':
      const { LlamaCppProvider } = await import('./llamacpp.js');
      return new LlamaCppProvider(model, apiKey);
    
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}