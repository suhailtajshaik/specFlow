import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';
import { join } from 'path';
import matter from 'gray-matter';
import { Logger } from '../ui/logger.js';
import { loadConfig } from '../../config/loader.js';

interface ListOptions {
  json?: boolean;
}

interface EndpointInfo {
  id: string;
  method: string;
  path: string;
  title: string;
  description: string;
  requiresAuth: boolean;
  status: string;
  filePath: string;
}

export async function listCommand(options: ListOptions = {}) {
  try {
    const config = loadConfig();
    const technicalDir = join(config.requirements.directory, config.requirements.technicalDir);

    if (!existsSync(technicalDir)) {
      if (options.json) {
        console.log(JSON.stringify({ endpoints: [] }, null, 2));
      } else {
        Logger.warning('No technical directory found');
        Logger.info('Run `specflow prepare` to generate API contracts');
      }
      return;
    }

    // Find all contract files
    const contractPattern = join(technicalDir, '**/*.contract.md');
    const contractFiles = await glob(contractPattern);

    if (contractFiles.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ endpoints: [] }, null, 2));
      } else {
        Logger.warning('No API contract files found');
        Logger.info('Add .contract.md files or run `specflow prepare` to generate them');
      }
      return;
    }

    // Parse contract files
    const endpoints: EndpointInfo[] = [];

    for (const filePath of contractFiles) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const { data: frontmatter } = matter(content);

        if (frontmatter.type === 'api_contract') {
          endpoints.push({
            id: frontmatter.id || 'unknown',
            method: frontmatter.method || 'unknown',
            path: frontmatter.path || 'unknown',
            title: frontmatter.title || 'untitled',
            description: frontmatter.description || '',
            requiresAuth: frontmatter.requiresAuth || false,
            status: frontmatter.status || 'draft',
            filePath: filePath.replace(process.cwd() + '/', '')
          });
        }
      } catch (error) {
        // Skip invalid files
        continue;
      }
    }

    // Output results
    if (options.json) {
      console.log(JSON.stringify({ endpoints }, null, 2));
    } else {
      displayEndpoints(endpoints);
    }

  } catch (error) {
    Logger.error(`Failed to list endpoints: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

function displayEndpoints(endpoints: EndpointInfo[]): void {
  if (endpoints.length === 0) {
    Logger.warning('No API endpoints found');
    return;
  }

  Logger.header(`API Endpoints (${endpoints.length})`);

  // Group by domain (extracted from file path)
  const grouped: Record<string, EndpointInfo[]> = {};
  
  for (const endpoint of endpoints) {
    const pathParts = endpoint.filePath.split('/');
    const domain = pathParts[pathParts.length - 2] || 'general';
    
    if (!grouped[domain]) {
      grouped[domain] = [];
    }
    grouped[domain].push(endpoint);
  }

  // Display grouped endpoints
  for (const [domain, domainEndpoints] of Object.entries(grouped)) {
    console.log();
    Logger.bold(`📁 ${domain.charAt(0).toUpperCase() + domain.slice(1)}`);
    
    for (const endpoint of domainEndpoints) {
      const authIcon = endpoint.requiresAuth ? '🔒' : '🔓';
      const statusColor = endpoint.status === 'approved' ? '✅' : 
                         endpoint.status === 'reviewed' ? '🔍' : '📝';
      
      console.log(`  ${getMethodColor(endpoint.method)} ${endpoint.path}`);
      console.log(`    ${authIcon} ${statusColor} ${endpoint.title}`);
      
      if (endpoint.description) {
        Logger.dim(`    ${endpoint.description.substring(0, 80)}${endpoint.description.length > 80 ? '...' : ''}`);
      }
      
      Logger.dim(`    File: ${endpoint.filePath}`);
      console.log();
    }
  }

  // Summary
  Logger.divider();
  const authCount = endpoints.filter(e => e.requiresAuth).length;
  const statusCounts = endpoints.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Logger.info(`Summary: ${endpoints.length} endpoints, ${authCount} require auth`);
  Logger.info(`Status: ${Object.entries(statusCounts).map(([status, count]) => `${count} ${status}`).join(', ')}`);
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    'GET': '🟢 GET',
    'POST': '🔵 POST',
    'PUT': '🟡 PUT',
    'DELETE': '🔴 DELETE',
    'PATCH': '🟠 PATCH'
  };
  
  return colors[method] || `⚪ ${method}`;
}