import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { MemoryServerConfig, McpServerConfigForProcessTransport } from './types.js';

const DEFAULT_DB_PATH = '.ai-swarm/state/memory.db';
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_DIMENSIONS = 384;

export function createMemoryServerConfig(
  projectRoot: string,
  overrides?: Partial<MemoryServerConfig>,
): MemoryServerConfig {
  const dbPath = overrides?.dbPath
    ? join(projectRoot, overrides.dbPath)
    : join(projectRoot, DEFAULT_DB_PATH);

  return {
    dbPath,
    namespace: overrides?.namespace,
    model: overrides?.model || DEFAULT_MODEL,
    modelCache: overrides?.modelCache || join(projectRoot, '.ai-swarm', 'state', 'models'),
    dimensions: overrides?.dimensions || DEFAULT_DIMENSIONS,
  };
}

export function memoryConfigToMcpServer(
  config: MemoryServerConfig,
  serverPath: string,
): McpServerConfigForProcessTransport {
  const env: Record<string, string> = {
    MEMORY_DB_PATH: config.dbPath,
  };

  if (config.namespace) {
    env.MEMORY_NAMESPACE = config.namespace;
  }
  if (config.model) {
    env.MEMORY_MODEL = config.model;
  }
  if (config.modelCache) {
    env.MEMORY_MODEL_CACHE = config.modelCache;
  }
  if (config.dimensions) {
    env.MEMORY_DIMENSIONS = String(config.dimensions);
  }

  return {
    command: 'node',
    args: [serverPath],
    env,
  };
}

export function generateMcpConfig(
  config: MemoryServerConfig,
  serverPath: string,
): Record<string, McpServerConfigForProcessTransport> {
  return {
    'claude-memory': memoryConfigToMcpServer(config, serverPath),
  };
}

export function ensureMemoryDbDir(dbPath: string): void {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function generateMcpJson(
  config: MemoryServerConfig,
  serverPath: string,
): string {
  const mcpConfig = generateMcpConfig(config, serverPath);
  const mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};

  for (const [name, server] of Object.entries(mcpConfig)) {
    mcpServers[name] = {
      command: server.command,
      args: server.args,
      env: server.env,
    };
  }

  return JSON.stringify({ mcpServers }, null, 2);
}
