import inquirer from 'inquirer';
// Types for questions and answers
interface PrepareQuestion {
  id: string;
  type: string;
  message: string;
  category: string;
  context: string;
  choices?: string[];
  default?: string;
}

type PrepareAnswers = Record<string, any>;
import { Logger } from './logger.js';

export async function askQuestions(questions: PrepareQuestion[]): Promise<PrepareAnswers> {
  if (questions.length === 0) {
    return {};
  }

  Logger.header('Clarifying Questions');
  Logger.dim('Please answer these questions to generate complete specifications:\n');

  const answers: PrepareAnswers = {};

  for (const question of questions) {
    console.log();
    Logger.dim(`Category: ${question.category}`);
    Logger.dim(`Context: ${question.context}\n`);

    const inquirerQuestion = {
      type: question.type,
      name: question.id,
      message: question.message,
      choices: question.choices,
      default: question.default
    };

    const answer = await inquirer.prompt([inquirerQuestion]);
    answers[question.id] = answer[question.id];
  }

  return answers;
}

export async function confirmGeneration(
  businessFiles: string[],
  contractFiles: string[],
  schemaFiles: string[]
): Promise<boolean> {
  Logger.header('Files to Generate');
  
  if (businessFiles.length > 0) {
    Logger.bold('\nBusiness Requirements:');
    Logger.list(businessFiles);
  }

  if (contractFiles.length > 0) {
    Logger.bold('\nAPI Contracts:');
    Logger.list(contractFiles);
  }

  if (schemaFiles.length > 0) {
    Logger.bold('\nShared Schemas:');
    Logger.list(schemaFiles);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Generate these specification files?',
      default: true
    }
  ]);

  return confirm;
}

export async function confirmOverwrite(existingFiles: string[]): Promise<boolean> {
  if (existingFiles.length === 0) {
    return true;
  }

  Logger.warning('The following files already exist:');
  Logger.list(existingFiles);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Overwrite existing files?',
      default: false
    }
  ]);

  return confirm;
}

export async function selectProvider(): Promise<'gemini' | 'claude' | 'llamacpp'> {
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select LLM provider:',
      choices: [
        { name: 'Google Gemini (free tier available)', value: 'gemini' },
        { name: 'Anthropic Claude (requires API key)', value: 'claude' },
        { name: 'Local LlamaCpp (requires local setup)', value: 'llamacpp' }
      ],
      default: 'gemini'
    }
  ]);

  return provider;
}

export async function promptForApiKey(provider: string): Promise<string> {
  const envVars = {
    gemini: 'GEMINI_API_KEY',
    claude: 'ANTHROPIC_API_KEY', 
    llamacpp: 'LLAMACPP_API_KEY'
  };

  const envVar = envVars[provider as keyof typeof envVars];

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: `Enter ${provider} API key (or set ${envVar} environment variable):`,
      mask: '*'
    }
  ]);

  return apiKey;
}