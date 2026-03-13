import { SpecFlow } from '@specflow/core';
import { Logger } from '../ui/logger.js';
import { loadConfig, resolveApiKey } from '../config/loader.js';

interface ListOptions {
  json?: boolean;
}

export async function listCommand(options: ListOptions = {}) {
  try {
    // Load configuration
    const config = loadConfig();
    const llmProvider = config.llm.provider;
    const apiKey = resolveApiKey(llmProvider, config.llm.apiKey);

    // Initialize SpecFlow SDK (API key not needed for list)
    const specFlow = new SpecFlow({
      provider: llmProvider,
      apiKey: apiKey || '', // Empty string for list operation
      cwd: process.cwd()
    });

    // Get endpoints from SDK
    const endpoints = await specFlow.listEndpoints();

    if (endpoints.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ endpoints: [] }, null, 2));
      } else {
        Logger.warning('No API endpoints found');
        Logger.info('Run `specflow prepare` to generate API contracts');
      }
      return;
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

function displayEndpoints(endpoints: Array<{ method: string; path: string; domain: string; title: string }>): void {
  Logger.header(`API Endpoints (${endpoints.length})`);

  // Group by domain
  const grouped: Record<string, typeof endpoints> = {};
  
  for (const endpoint of endpoints) {
    const domain = endpoint.domain || 'general';
    
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
      console.log(`  ${getMethodColor(endpoint.method)} ${endpoint.path}`);
      console.log(`    ${endpoint.title || 'Untitled endpoint'}`);
      console.log();
    }
  }

  // Summary
  Logger.divider();
  const methodCounts = endpoints.reduce((acc, e) => {
    acc[e.method] = (acc[e.method] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Logger.info(`Summary: ${endpoints.length} endpoints`);
  Logger.info(`Methods: ${Object.entries(methodCounts).map(([method, count]) => `${count} ${method}`).join(', ')}`);
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