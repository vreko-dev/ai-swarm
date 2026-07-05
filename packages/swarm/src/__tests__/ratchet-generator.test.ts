import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { ratchetGenerator } from '../ratchet-generator.js';

const mockedExecSync = vi.mocked(execSync);

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = mkdtempSync(join(tmpdir(), 'swarm-ratchet-'));
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('T5: ratchet-generator', () => {
  it('T5.1 — generates 5 standard ratchet metrics', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    const metrics = result.ratchets.map((r) => r.metric);
    expect(metrics).toContain('console_log');
    expect(metrics).toContain('as_any');
    expect(metrics).toContain('ts_ignore');
    expect(metrics).toContain('skipped_tests');
    expect(metrics).toContain('empty_catches');
    expect(result.ratchets).toHaveLength(5);
  });

  it('T5.2 — writes ratchet.json with real baseline counts from execSync', async () => {
    mockedExecSync.mockReturnValue('7');
    const result = await ratchetGenerator(tmpDir);
    expect(existsSync(result.path)).toBe(true);
    const written = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(written.ratchets).toHaveLength(5);
    expect(written.ratchets[0].baseline).toBe(7);
  });

  it('T5.3 — output _meta has generated_at, generator, project_root', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    const written = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(written._meta).toBeDefined();
    expect(written._meta.generated_at).toBeDefined();
    expect(written._meta.generator).toBeDefined();
    expect(written._meta.project_root).toBeDefined();
  });

  it('T5.4 — output uses ci_check (snake_case) not ciCheck (camelCase)', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    const written = JSON.parse(readFileSync(result.path, 'utf8'));
    expect(written.ratchets[0].ci_check).toBeDefined();
    expect(written.ratchets[0].ciCheck).toBeUndefined();
  });

  it('T5.5 — returns { ratchets, path } object', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    expect(result).toHaveProperty('ratchets');
    expect(result).toHaveProperty('path');
    expect(Array.isArray(result.ratchets)).toBe(true);
    expect(typeof result.path).toBe('string');
  });

  it('T5.6 — writes to custom outputPath when provided', async () => {
    mockedExecSync.mockReturnValue('0');
    const customPath = join(tmpDir, 'custom-ratchet.json');
    const result = await ratchetGenerator(tmpDir, customPath);
    expect(result.path).toBe(customPath);
    expect(existsSync(customPath)).toBe(true);
  });

  it('T5.7 — defaults output path to .ai-swarm/ratchet.json', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    expect(result.path).toBe(join(tmpDir, '.ai-swarm', 'ratchet.json'));
  });

  it('T5.8 — handles execSync returning 0 (baseline = 0)', async () => {
    mockedExecSync.mockReturnValue('0');
    const result = await ratchetGenerator(tmpDir);
    expect(result.ratchets.every((r) => r.baseline === 0)).toBe(true);
  });

  it('T5.9 — handles execSync throwing (baseline = 0, no crash)', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('command failed');
    });
    const result = await ratchetGenerator(tmpDir);
    expect(result.ratchets.every((r) => r.baseline === 0)).toBe(true);
  });
});
