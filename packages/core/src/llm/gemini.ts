import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMProvider } from './provider.js';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Gemini API key not found. Set GEMINI_API_KEY environment variable or provide in config.');
    }
    
    this.client = new GoogleGenerativeAI(key);
    this.model = model || 'gemini-1.5-pro';
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model });
      
      const prompt = `${systemPrompt}\n\nUser Request:\n${userPrompt}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      
      return text.trim();
    } catch (error) {
      throw new Error(`Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      throw new Error(`Failed to parse JSON response from Gemini: ${cleanResponse}`);
    }
  }
}