import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const swarmRoot = join(__dirname, '..', '..');
const cliRoot = join(__dirname, '..', '..', '..', 'swarm-cli');

const FORBIDDEN_PATTERN = new RegExp(['vre', 'ko', '|@vre', 'ko', '|snap', 'back', '|dop', 'pler', '|pion', 'eer', '|Lin', 'ear'].join(''), 'i');
const ALLOWED_EXTENSIONS = new Set(['.ts', '.md', '.sh', '.json', '.txt']);

function collectFiles(root: string, dir: string = '', results: string[] = []): string[] {
  const fullDir = join(root, dir);
  const entries = readdirSync(fullDir);
  for (const entry of entries) {
    const relativePath = dir ? join(dir, entry) : entry;
    const fullPath = join(fullDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      collectFiles(root, relativePath, results);
    } else if (ALLOWED_EXTENSIONS.has(extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('T12: clean-room', () => {
  it('T12.1 — no forbidden references in packages/swarm/ (.ts, .md, .sh, .json, .txt)', () => {
    const files = collectFiles(swarmRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, `File ${file} contains forbidden references`).not.toMatch(FORBIDDEN_PATTERN);
    }
  });

  it('T12.2 — no forbidden references in packages/swarm-cli/ (.ts, .md, .sh, .json, .txt)', () => {
    const files = collectFiles(cliRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, `File ${file} contains forbidden references`).not.toMatch(FORBIDDEN_PATTERN);
    }
  });

  it('T12.3 — no hardcoded vendor-specific paths in TS source (only in CLI scaffolding logic)', () => {
    const swarmTsFiles = collectFiles(swarmRoot).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));
    const vendorPath = new RegExp('\\.' + ['vre', 'ko'].join('') + '-swarm');
    for (const file of swarmTsFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `TS file ${file} contains vendor-specific path`).not.toMatch(vendorPath);
    }
  });
});
