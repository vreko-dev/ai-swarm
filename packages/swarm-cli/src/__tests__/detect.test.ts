import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { detectProject } from '../detect.js';

let tmpDir: string;

const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ENV_BACKUP[key] = process.env[key];
    delete process.env[key];
  }
  tmpDir = mkdtempSync(join(tmpdir(), 'swarm-detect-'));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ENV_BACKUP[key] === undefined) delete process.env[key];
    else process.env[key] = ENV_BACKUP[key];
  }
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

function setupProject(files: Record<string, string>): string {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(tmpDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
  return tmpDir;
}

describe('T13: detect (swarm-cli)', () => {
  it('T13.1 — detects pnpm from pnpm-lock.yaml', async () => {
    setupProject({ 'pnpm-lock.yaml': '' });
    const result = await detectProject(tmpDir);
    expect(result.packageManager).toBe('pnpm');
  });

  it('T13.2 — detects npm from package-lock.json', async () => {
    setupProject({ 'package-lock.json': '{}' });
    const result = await detectProject(tmpDir);
    expect(result.packageManager).toBe('npm');
  });

  it('T13.3 — detects monorepo from pnpm-workspace.yaml', async () => {
    setupProject({ 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n' });
    const result = await detectProject(tmpDir);
    expect(result.isMonorepo).toBe(true);
  });

  it('T13.4 — detects monorepo from package.json workspaces field', async () => {
    setupProject({ 'package.json': JSON.stringify({ workspaces: ['packages/*'] }) });
    const result = await detectProject(tmpDir);
    expect(result.isMonorepo).toBe(true);
  });

  it('T13.5 — enumerates workspace package globs from pnpm-workspace.yaml', async () => {
    setupProject({ 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - apps/*\n' });
    const result = await detectProject(tmpDir);
    expect(result.workspacePackages.length).toBeGreaterThan(0);
    expect(result.workspacePackages.some((p) => p.includes('packages/*'))).toBe(true);
  });

  it('T13.6 — detects turbo.json presence', async () => {
    setupProject({ 'turbo.json': '{}' });
    const result = await detectProject(tmpDir);
    expect(result.hasTurbo).toBe(true);
  });

  it('T13.7 — detects nx.json presence', async () => {
    setupProject({ 'nx.json': '{}' });
    const result = await detectProject(tmpDir);
    expect(result.hasNx).toBe(true);
  });

  it('T13.8 — detects .mcp.json presence', async () => {
    setupProject({ '.mcp.json': '{}' });
    const result = await detectProject(tmpDir);
    expect(result.hasMcpJson).toBe(true);
  });

  it('T13.9 — detects Langfuse from env vars', async () => {
    setupProject({});
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    const result = await detectProject(tmpDir);
    expect(result.hasLangfuse).toBe(true);
  });

  it('T13.10 — detects OTEL from env vars', async () => {
    setupProject({});
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
    const result = await detectProject(tmpDir);
    expect(result.hasOtel).toBe(true);
  });

  it('T13.11 — detects .ai-swarm directory presence', async () => {
    setupProject({ '.ai-swarm/.gitkeep': '' });
    const result = await detectProject(tmpDir);
    expect(result.hasAiSwarmDir).toBe(true);
  });

  it('T13.12 — detects git root via git rev-parse', async () => {
    setupProject({});
    execSync('git init', { cwd: tmpDir, encoding: 'utf8' });
    const result = await detectProject(tmpDir);
    expect(result.gitRoot).not.toBeNull();
    expect(result.gitRoot).toContain(tmpdir());
  });

  it('T13.13 — returns null packageManager when no lockfile', async () => {
    setupProject({});
    const result = await detectProject(tmpDir);
    expect(result.packageManager).toBeNull();
  });

  it('T13.14 — returns null gitRoot when not in a git repo', async () => {
    setupProject({});
    const result = await detectProject(tmpDir);
    expect(result.gitRoot).toBeNull();
  });
});
