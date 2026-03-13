import { OpenAI } from 'openai';
import type { LLMProvider } from './provider.js';

export class LlamaCppProvider implements LLMProvider {
  name = 'llamacpp';
  private client: OpenAI;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    // LlamaCpp typically runs locally with OpenAI-compatible API
    const baseURL = process.env.LLAMACPP_BASE_URL || 'http://localhost:8080/v1';
    const key = apiKey || process.env.LLAMACPP_API_KEY || 'sk-no-key-required';
    
    this.client = new OpenAI({
      baseURL,
      apiKey: key
    });
    
    this.model = model || 'gpt-3.5-turbo'; // Default model name for llamacpp
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: 8192,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LlamaCpp');
      }

      return content.trim();
    } catch (error) {
      throw new Error(`LlamaCpp API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateJSON<T>(systemPrompt: string, userPrompt: string, schema?: object): Promise<T> {
    const jsonPrompt = `${systemPrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanation, just the JSON object.`;
    
    const response = await this.generate(jsonPrompt, userPrompt);
    
    // Clean up response - remove markdown code blocks if present
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    try {
      return JSON.parse(cleanResponse) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response from LlamaCpp: ${cleanResponse}`);
    }
  }
}