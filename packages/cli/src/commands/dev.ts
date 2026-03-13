import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '../ui/logger.js';
import { loadConfig } from '../config/loader.js';
import { generateCommand } from './generate.js';

interface DevOptions {
  port?: string;
  provider?: 'gemini' | 'claude' | 'llamacpp';
}

export async function devCommand(options: DevOptions = {}) {
  try {
    Logger.header('Development Server');

    const config = loadConfig();
    const port = options.port || '3000';
    const generatedDir = config.output.directory;

    // Step 1: Generate code if needed
    if (!existsSync(join(generatedDir, 'package.json'))) {
      Logger.info('Generated code not found. Running generation first...');
      await generateCommand({ provider: options.provider });
      Logger.divider();
    }

    // Step 2: Check if dependencies are installed
    const nodeModulesExists = existsSync(join(generatedDir, 'node_modules'));
    if (!nodeModulesExists) {
      Logger.info('Installing dependencies...');
      await runCommand('bun', ['install'], generatedDir);
    }

    // Step 3: Start development server
    Logger.info(`Starting development server on port ${port}...`);
    Logger.dim('Press Ctrl+C to stop the server');
    Logger.divider();

    await runCommand('bun', ['run', 'dev', '--port', port], generatedDir, true);

  } catch (error) {
    Logger.error(`Failed to start development server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function runCommand(
  command: string, 
  args: string[], 
  cwd: string, 
  inherit: boolean = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: inherit ? 'inherit' : 'pipe',
      shell: true
    });

    if (!inherit) {
      child.stdout?.on('data', (data) => {
        process.stdout.write(data);
      });

      child.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    child.on('error', reject);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      child.kill('SIGINT');
    });
  });
}