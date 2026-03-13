export interface SpecFlowConfig {
  version: string;
  project: {
    name: string;
    description: string;
    version: string;
  };
  llm: {
    provider: 'gemini' | 'claude' | 'llamacpp';
    model?: string;
    apiKey?: string;
  };
  output: {
    directory: string;
    runtime: 'bun';
    framework: 'hono';
    orm: 'drizzle';
    database: 'postgresql';
    includeDocker: boolean;
    includeTests: boolean;
  };
  requirements: {
    directory: string;
    businessDir: string;
    technicalDir: string;
    schemasDir: string;
  };
}