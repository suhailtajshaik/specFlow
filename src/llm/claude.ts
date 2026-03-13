import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './provider.js';

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private client: Anthropic;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or provide in config.');
    }
    
    this.client = new Anthropic({ apiKey: key });
    this.model = model || 'claude-3-5-sonnet-20241022';
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return content.text.trim();
    } catch (error) {
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      throw new Error(`Failed to parse JSON response from Claude: ${cleanResponse}`);
    }
  }
}