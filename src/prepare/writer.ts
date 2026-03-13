import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import type { RefinedSpecs } from './refiner.js';
import type { PrepareState } from '../parser/types.js';

export class SpecWriter {
  constructor(private baseDir: string = './requirements') {}

  async writeRefinedSpecs(refined: RefinedSpecs): Promise<string[]> {
    const writtenFiles: string[] = [];

    // Write business requirements
    for (const [filePath, content] of Object.entries(refined.businessRequirements)) {
      const fullPath = join(this.baseDir, filePath.replace('requirements/', ''));
      this.ensureDirectoryExists(dirname(fullPath));
      writeFileSync(fullPath, content, 'utf-8');
      writtenFiles.push(fullPath);
    }

    // Write API contracts  
    for (const [filePath, content] of Object.entries(refined.apiContracts)) {
      const fullPath = join(this.baseDir, filePath.replace('requirements/', ''));
      this.ensureDirectoryExists(dirname(fullPath));
      writeFileSync(fullPath, content, 'utf-8');
      writtenFiles.push(fullPath);
    }

    // Write shared schemas
    for (const [filePath, content] of Object.entries(refined.sharedSchemas)) {
      const fullPath = join(this.baseDir, filePath.replace('requirements/', ''));
      this.ensureDirectoryExists(dirname(fullPath));
      writeFileSync(fullPath, content, 'utf-8');
      writtenFiles.push(fullPath);
    }

    return writtenFiles;
  }

  writePrepareState(inputFiles: string[], outputFiles: string[]): void {
    const state: PrepareState = {
      isPrepared: true,
      timestamp: new Date().toISOString(),
      version: '1.0',
      inputFiles,
      outputFiles,
      checksum: this.calculateChecksum(outputFiles)
    };

    const stateFile = join(this.baseDir, '.specflow-prepared');
    this.ensureDirectoryExists(dirname(stateFile));
    writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  private calculateChecksum(files: string[]): string {
    const hash = createHash('sha256');
    
    // Sort files to ensure consistent checksum
    const sortedFiles = [...files].sort();
    
    for (const file of sortedFiles) {
      try {
        const fs = require('fs');
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf-8');
          hash.update(file + content);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    
    return hash.digest('hex');
  }

  getExistingFiles(refined: RefinedSpecs): string[] {
    const existing: string[] = [];

    const allPaths = [
      ...Object.keys(refined.businessRequirements),
      ...Object.keys(refined.apiContracts),
      ...Object.keys(refined.sharedSchemas)
    ];

    for (const filePath of allPaths) {
      const fullPath = join(this.baseDir, filePath.replace('requirements/', ''));
      if (existsSync(fullPath)) {
        existing.push(fullPath);
      }
    }

    return existing;
  }
}