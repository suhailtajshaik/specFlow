// Scanner orchestrator - detects language and delegates to language-specific parsers

export interface ScanResult {
  language: string;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
  specsGenerated: string[];
}

export class Scanner {
  constructor(private projectDir: string) {}

  async scan(language?: string): Promise<ScanResult> {
    // Placeholder implementation
    throw new Error('Scanner not yet implemented — coming in next release');
  }

  private detectLanguage(): string {
    // Auto-detect language based on project files
    return 'typescript';
  }
}