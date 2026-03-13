import { execSync, spawn } from 'child_process';
import { platform } from 'os';
import inquirer from 'inquirer';
import { Logger } from './ui/logger.js';

export interface RuntimeInfo {
  node: {
    available: boolean;
    version?: string;
  };
  bun: {
    available: boolean;
    version?: string;
  };
  npm: {
    available: boolean;
    version?: string;
  };
}

export class RuntimeDetector {
  async detectRuntimes(): Promise<RuntimeInfo> {
    const info: RuntimeInfo = {
      node: { available: false },
      bun: { available: false },
      npm: { available: false }
    };

    // Check Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
      info.node.available = true;
      info.node.version = nodeVersion;
    } catch {
      info.node.available = false;
    }

    // Check Bun
    try {
      const bunVersion = execSync('bun --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
      info.bun.available = true;
      info.bun.version = bunVersion;
    } catch {
      info.bun.available = false;
    }

    // Check npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
      info.npm.available = true;
      info.npm.version = npmVersion;
    } catch {
      info.npm.available = false;
    }

    return info;
  }

  async showSetupChecklist(): Promise<boolean> {
    Logger.header('Setup Checklist');
    
    const runtime = await this.detectRuntimes();
    
    // Node.js check
    if (runtime.node.available) {
      Logger.success(`Node.js detected (${runtime.node.version})`);
    } else {
      Logger.error('Node.js not found — required for SpecFlow CLI');
      return false;
    }

    // Bun check
    if (runtime.bun.available) {
      Logger.success(`Bun detected (${runtime.bun.version})`);
    } else {
      Logger.warning('Bun not found — required for generated project');
      
      const shouldInstall = await this.promptBunInstall();
      if (shouldInstall) {
        const success = await this.installBun();
        if (!success) {
          Logger.error('Failed to install Bun. Please install manually.');
          this.showBunInstallInstructions();
          return false;
        }
      } else {
        this.showBunInstallInstructions();
        return false;
      }
    }

    // Config file check
    const configExists = require('fs').existsSync('./specflow.config.yaml');
    if (configExists) {
      Logger.success('specflow.config.yaml found');
    } else {
      Logger.info('specflow.config.yaml will be created during init');
    }

    return true;
  }

  private async promptBunInstall(): Promise<boolean> {
    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install Bun automatically?',
        default: true
      }
    ]);

    return install;
  }

  private async installBun(): Promise<boolean> {
    Logger.info('Installing Bun...');

    try {
      const os = platform();
      
      if (os === 'win32') {
        // Windows installation
        await this.runCommand('powershell', ['-Command', 'irm bun.sh/install.ps1 | iex']);
      } else {
        // Mac/Linux installation
        await this.runCommand('curl', ['-fsSL', 'https://bun.sh/install', '|', 'bash']);
      }

      // Verify installation
      const runtime = await this.detectRuntimes();
      if (runtime.bun.available) {
        Logger.success(`Bun installed successfully (${runtime.bun.version})`);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      Logger.error(`Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit', shell: true });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  private showBunInstallInstructions(): void {
    Logger.header('Manual Bun Installation');
    
    const os = platform();
    
    if (os === 'win32') {
      Logger.info('Windows:');
      Logger.code('powershell -c "irm bun.sh/install.ps1 | iex"');
    } else {
      Logger.info('macOS/Linux:');
      Logger.code('curl -fsSL https://bun.sh/install | bash');
    }
    
    Logger.info('\nAfter installation, restart your terminal and run specflow again.');
    Logger.info('For more info: https://bun.sh/docs/installation');
  }

  async checkLLMSetup(): Promise<boolean> {
    const envVars = {
      gemini: process.env.GEMINI_API_KEY,
      claude: process.env.ANTHROPIC_API_KEY,
      llamacpp: process.env.LLAMACPP_API_KEY
    };

    const hasAnyKey = Object.values(envVars).some(key => key && key.length > 0);
    
    if (hasAnyKey) {
      const provider = envVars.gemini ? 'Gemini' : envVars.claude ? 'Claude' : 'LlamaCpp';
      Logger.success(`LLM provider configured (${provider})`);
      return true;
    }

    Logger.warning('No LLM provider configured');
    Logger.info('SpecFlow needs an LLM provider to generate specifications.');
    
    await this.showLLMOptions();
    return false;
  }

  private async showLLMOptions(): Promise<void> {
    Logger.header('LLM Provider Options');
    
    Logger.info('1. 🌟 Google Gemini (Recommended)');
    Logger.dim('   • Free tier available');
    Logger.dim('   • Get API key: https://ai.google.dev');
    Logger.dim('   • Set: export GEMINI_API_KEY=your_key_here\n');
    
    Logger.info('2. 🧠 Anthropic Claude');
    Logger.dim('   • Paid service, high quality');
    Logger.dim('   • Get API key: https://console.anthropic.com');
    Logger.dim('   • Set: export ANTHROPIC_API_KEY=your_key_here\n');
    
    Logger.info('3. 🏠 Local LlamaCpp');
    Logger.dim('   • Run locally, no API key needed');
    Logger.dim('   • Requires setup: https://github.com/ggerganov/llama.cpp');
    Logger.dim('   • Set: export LLAMACPP_BASE_URL=http://localhost:8080/v1\n');
    
    Logger.info('After setting up your API key, run specflow prepare to continue.');
  }
}

export const runtimeDetector = new RuntimeDetector();