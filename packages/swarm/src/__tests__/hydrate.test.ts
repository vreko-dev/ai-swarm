import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hydrateContext } from '../hydrate.js';
import type { SwarmContext } from '../types.js';

let tmpDir: string;

function setupProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-hydrate-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
  return dir;
}

const ENV_BACKUP: Record<string, string | undefined> = {};

function saveEnv(keys: string[]) {
  for (const key of keys) ENV_BACKUP[key] = process.env[key];
}

function restoreEnv(keys: string[]) {
  for (const key of keys) {
    if (ENV_BACKUP[key] === undefined) delete process.env[key];
    else process.env[key] = ENV_BACKUP[key];
  }
}

const OBS_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];

beforeEach(() => {
  saveEnv(OBS_KEYS);
  for (const key of OBS_KEYS) delete process.env[key];
});

afterEach(() => {
  restoreEnv(OBS_KEYS);
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('T3: hydrateContext', () => {
  it('T3.1 — detects pnpm from pnpm-lock.yaml', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBe('pnpm');
  });

  it('T3.2 — detects npm from package-lock.json', async () => {
    tmpDir = setupProject({ 'package-lock.json': '{}' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBe('npm');
  });

  it('T3.3 — detects yarn from yarn.lock', async () => {
    tmpDir = setupProject({ 'yarn.lock': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBe('yarn');
  });

  it('T3.4 — detects bun from bun.lockb', async () => {
    tmpDir = setupProject({ 'bun.lockb': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBe('bun');
  });

  it('T3.5 — defaults to pnpm when no lockfile found', async () => {
    tmpDir = setupProject({});
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBe('pnpm');
  });

  it('T3.6 — enumerates pnpm workspaces from pnpm-workspace.yaml', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'packages/swarm/package.json': JSON.stringify({ name: '@marcellelabs/swarm', private: false }),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.ownedPackages.length).toBeGreaterThan(0);
    expect(ctx.ownedPackages.some((p) => p.name === '@marcellelabs/swarm')).toBe(true);
  });

  it('T3.7 — enumerates npm/yarn workspaces from package.json workspaces field', async () => {
    tmpDir = setupProject({
      'package-lock.json': '{}',
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/swarm/package.json': JSON.stringify({ name: '@marcellelabs/swarm', private: false }),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.ownedPackages.length).toBeGreaterThan(0);
    expect(ctx.ownedPackages.some((p) => p.name === '@marcellelabs/swarm')).toBe(true);
  });

  it('T3.8 — detects turbo build commands when turbo.json exists', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '', 'turbo.json': '{}' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.buildCommand).toContain('turbo run build');
  });

  it('T3.9 — detects nx build commands when nx.json exists', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '', 'nx.json': '{}' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.buildCommand).toContain('nx run-many');
  });

  it('T3.10 — falls back to pm run <script> when no turbo/nx', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.buildCommand).toContain('pnpm run build');
  });

  it('T3.11 — detects MCP tools from .mcp.json', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      '.mcp.json': JSON.stringify({
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        },
      }),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.mcpTools.length).toBeGreaterThan(0);
    expect(ctx.mcpTools.some((t) => t.name === 'filesystem')).toBe(true);
  });

  it('T3.12 — returns empty mcpTools when no .mcp.json', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.mcpTools).toEqual([]);
  });

  it('T3.13 — detects langfuse from LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY env', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-lf-test';
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.observabilityBackend).toBe('langfuse');
  });

  it('T3.14 — detects otel from OTEL_EXPORTER_OTLP_ENDPOINT env', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.observabilityBackend).toBe('otel');
  });

  it('T3.15 — defaults to none when no observability env vars', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.observabilityBackend).toBe('none');
  });

  it('T3.16 — reads ai-swarm.config.ts override and merges into context', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      'ai-swarm.config.ts': 'export default {\n  buildCommand: "custom-build",\n}',
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.buildCommand).toBe('custom-build');
  });

  it('T3.17 — reads ai-swarm.config.json override', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      'ai-swarm.config.json': JSON.stringify({ buildCommand: 'json-build' }),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.buildCommand).toBe('json-build');
  });

  it('T3.18 — returns object satisfies SwarmContext (all required fields populated)', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.packageManager).toBeDefined();
    expect(ctx.buildCommand).toBeDefined();
    expect(ctx.lintCommand).toBeDefined();
    expect(ctx.testCommand).toBeDefined();
    expect(ctx.typecheckCommand).toBeDefined();
    expect(ctx.archFenceRules).toBeDefined();
    expect(ctx.ownedPackages).toBeDefined();
    expect(ctx.mcpTools).toBeDefined();
    expect(ctx.antiPatterns).toBeDefined();
    expect(ctx.ratchetBaselines).toBeDefined();
    expect(ctx.branchModel).toBeDefined();
    expect(ctx.gateConfig).toBeDefined();
    expect(ctx.auditTemplatePaths).toBeDefined();
    expect(ctx.deferredWorkPath).toBeDefined();
    expect(ctx.observabilityBackend).toBeDefined();
    expect(ctx.modelTiers).toBeDefined();
  });

  it('T3.19 — loads arch fence rules from .ai-swarm/docs/reference/architecture-fence.txt', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      '.ai-swarm/docs/reference/architecture-fence.txt': [
        'PATTERN: packages/*',
        '  ALLOW: shared',
        '  FORBID: other',
        '  CANONICAL: src/index.ts',
      ].join('\n'),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.archFenceRules.length).toBeGreaterThan(0);
    expect(ctx.archFenceRules[0].pattern).toBe('packages/*');
    expect(ctx.archFenceRules[0].allowedImports).toContain('shared');
    expect(ctx.archFenceRules[0].forbiddenImports).toContain('other');
  });

  it('T3.20 — loads anti-patterns from .ai-swarm/docs/reference/anti-patterns.md', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      '.ai-swarm/docs/reference/anti-patterns.md': [
        '## AP-1: Test Pattern',
        '**Root cause:** test root cause',
        '**Rule:** test rule',
        '**Detection:** test detection',
        '**Mitigation:** test mitigation',
      ].join('\n'),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.antiPatterns.length).toBeGreaterThan(0);
    expect(ctx.antiPatterns[0].id).toBe('AP-1');
  });

  it('T3.21 — loads ratchet baselines from .ai-swarm/ratchet.json', async () => {
    tmpDir = setupProject({
      'pnpm-lock.yaml': '',
      '.ai-swarm/ratchet.json': JSON.stringify({
        ratchets: [{ metric: 'console_log', baseline: 5, ci_check: 'grep ...', description: 'test' }],
      }),
    });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.ratchetBaselines.length).toBeGreaterThan(0);
    expect(ctx.ratchetBaselines[0].metric).toBe('console_log');
    expect(ctx.ratchetBaselines[0].baseline).toBe(5);
  });

  it('T3.22 — sets default gate config with 4 gate types', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.gateConfig).toHaveLength(4);
    const types = ctx.gateConfig.map((g) => g.type);
    expect(types).toContain('human-review');
    expect(types).toContain('build');
    expect(types).toContain('test');
    expect(types).toContain('adversarial-review');
  });

  it('T3.23 — sets default audit template paths (6 templates)', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.auditTemplatePaths).toHaveLength(6);
  });

  it('T3.24 — sets default branch model (main, dev, task/)', async () => {
    tmpDir = setupProject({ 'pnpm-lock.yaml': '' });
    const ctx = await hydrateContext(tmpDir);
    expect(ctx.branchModel.main).toBe('main');
    expect(ctx.branchModel.dev).toBe('dev');
    expect(ctx.branchModel.prefix).toBe('task/');
  });
});
