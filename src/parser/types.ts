export interface RoughInput {
  filePath: string;
  content: string;
  type: 'rough' | 'partial' | 'unknown';
}

export interface BusinessRequirement {
  id: string;
  type: 'business_requirement';
  domain: string;
  title: string;
  description: string;
  status: 'draft' | 'reviewed' | 'approved' | 'implemented';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  dueDate?: string;
  businessRules: BusinessRule[];
  dependencies?: string[];
  edgeCases?: string[];
  notes?: string[];
  relatedContracts?: string[];
  version: string;
  lastUpdated: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface BusinessRule {
  id: string;
  description: string;
  implementation: string;
  validation?: string;
  errorHandling?: string;
}

export interface ApiContract {
  id: string;
  type: 'api_contract';
  domain: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  title: string;
  description: string;
  status: 'draft' | 'reviewed' | 'approved' | 'implemented';
  version: string;
  lastUpdated: string;
  requiresAuth: boolean;
  rateLimit?: {
    requests: number;
    window: string;
    scope: 'ip' | 'user' | 'global';
  };
  relatedRequirement: string;
  requestSchema?: object;
  responseSchema: object;
  errorResponses: ErrorResponse[];
  examples?: ContractExample[];
  confidence?: 'high' | 'medium' | 'low';
}

export interface ErrorResponse {
  status: number;
  code: string;
  description: string;
  schema?: object;
}

export interface ContractExample {
  title: string;
  request?: object;
  response: object;
  description?: string;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  items?: any;
  enum?: any[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
  examples?: any[];
}

export interface PrepareAnalysis {
  roughInputs: RoughInput[];
  identifiedDomains: string[];
  suggestedStructure: {
    businessRequirements: BusinessRequirement[];
    apiContracts: ApiContract[];
    sharedSchemas: Record<string, JsonSchema>;
  };
  questions: PrepareQuestion[];
  warnings: string[];
}

export interface PrepareQuestion {
  id: string;
  type: 'text' | 'select' | 'multiselect' | 'confirm' | 'number';
  message: string;
  choices?: string[];
  default?: any;
  context: string;
  category: 'business' | 'technical' | 'security' | 'validation';
}

export interface PrepareAnswers {
  [questionId: string]: any;
}

export interface GenerationContext {
  businessRequirements: BusinessRequirement[];
  apiContracts: ApiContract[];
  sharedSchemas: Record<string, JsonSchema>;
  config: SpecFlowConfig;
}

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

export interface PrepareState {
  isPrepared: boolean;
  timestamp: string;
  version: string;
  inputFiles: string[];
  outputFiles: string[];
  checksum: string;
}