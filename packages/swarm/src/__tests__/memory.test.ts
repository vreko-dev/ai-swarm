import { describe, it, expect, vi } from 'vitest';
import {
  createMemoryServerConfig,
  memoryConfigToMcpServer,
  generateMcpConfig,
  generateMcpJson,
  ensureMemoryDbDir,
} from '../memory.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

const mockedMkdirSync = vi.mocked(await import('node:fs')).mkdirSync;

describe('T8: memory server config', () => {
  it('T8.1 — createMemoryServerConfig returns config with defaults', () => {
    const config = createMemoryServerConfig('/fake/project');

    expect(config.dbPath).toBe('/fake/project/.ai-swarm/state/memory.db');
    expect(config.model).toBe('Xenova/all-MiniLM-L6-v2');
    expect(config.dimensions).toBe(384);
    expect(config.modelCache).toBe('/fake/project/.ai-swarm/state/models');
  });

  it('T8.2 — createMemoryServerConfig applies overrides', () => {
    const config = createMemoryServerConfig('/fake/project', {
      dbPath: 'custom/memory.db',
      namespace: 'my-project',
      model: 'custom-model',
      dimensions: 768,
    });

    expect(config.dbPath).toBe('/fake/project/custom/memory.db');
    expect(config.namespace).toBe('my-project');
    expect(config.model).toBe('custom-model');
    expect(config.dimensions).toBe(768);
  });

  it('T8.3 — memoryConfigToMcpServer produces correct MCP server config', () => {
    const config = createMemoryServerConfig('/fake/project', {
      namespace: 'test-ns',
    });
    const server = memoryConfigToMcpServer(config, '/path/to/server.js');

    expect(server.command).toBe('node');
    expect(server.args).toEqual(['/path/to/server.js']);
    expect(server.env?.MEMORY_DB_PATH).toBe('/fake/project/.ai-swarm/state/memory.db');
    expect(server.env?.MEMORY_NAMESPACE).toBe('test-ns');
    expect(server.env?.MEMORY_MODEL).toBe('Xenova/all-MiniLM-L6-v2');
    expect(server.env?.MEMORY_DIMENSIONS).toBe('384');
  });

  it('T8.4 — memoryConfigToMcpServer omits namespace env when not set', () => {
    const config = createMemoryServerConfig('/fake/project');
    const server = memoryConfigToMcpServer(config, '/path/to/server.js');

    expect(server.env?.MEMORY_NAMESPACE).toBeUndefined();
  });

  it('T8.5 — generateMcpConfig returns claude-memory key', () => {
    const config = createMemoryServerConfig('/fake/project');
    const mcpConfig = generateMcpConfig(config, '/path/to/server.js');

    expect(mcpConfig['claude-memory']).toBeDefined();
    expect(mcpConfig['claude-memory'].command).toBe('node');
  });

  it('T8.6 — generateMcpJson produces valid JSON string', () => {
    const config = createMemoryServerConfig('/fake/project', {
      namespace: 'test-ns',
    });
    const json = generateMcpJson(config, '/path/to/server.js');
    const parsed = JSON.parse(json);

    expect(parsed.mcpServers).toBeDefined();
    expect(parsed.mcpServers['claude-memory']).toBeDefined();
    expect(parsed.mcpServers['claude-memory'].command).toBe('node');
    expect(parsed.mcpServers['claude-memory'].args).toEqual(['/path/to/server.js']);
    expect(parsed.mcpServers['claude-memory'].env.MEMORY_DB_PATH).toBe('/fake/project/.ai-swarm/state/memory.db');
    expect(parsed.mcpServers['claude-memory'].env.MEMORY_NAMESPACE).toBe('test-ns');
  });

  it('T8.7 — ensureMemoryDbDir creates directory recursively', () => {
    ensureMemoryDbDir('/fake/project/.ai-swarm/state/memory.db');

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      '/fake/project/.ai-swarm/state',
      { recursive: true },
    );
  });

  it('T8.8 — createMemoryServerConfig joins projectRoot with dbPath', () => {
    const config = createMemoryServerConfig('/fake/project', {
      dbPath: 'custom/path/memory.db',
    });

    expect(config.dbPath).toBe('/fake/project/custom/path/memory.db');
  });
});
