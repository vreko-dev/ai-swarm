import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const packagesRoot = join(__dirname, '..', '..', '..');

// Discover all package directories under packages/*
const packageDirs = readdirSync(packagesRoot)
  .filter((entry) => {
    const fullPath = join(packagesRoot, entry);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, 'package.json'));
  })
  .map((entry) => ({ name: entry, path: join(packagesRoot, entry) }));

// Self-protecting pattern: the literal forbidden words must not appear in this file,
// so we build the regex from the fragments below.
const FORBIDDEN_PARTS = [
  ['vre', 'ko'],
  ['@vre', 'ko'],
  ['snap', 'back'],
  ['dop', 'pler'],
  ['pion', 'eer'],
  ['Lin', 'ear'],
];
const FORBIDDEN_PATTERN = new RegExp(FORBIDDEN_PARTS.map((parts) => parts.join('')).join('|'), 'i');
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
  it('T12.0 — packageDirs includes all expected packages', () => {
    const names = packageDirs.map((p) => p.name);
    expect(names).toContain('swarm');
    expect(names).toContain('swarm-cli');
    expect(names).toContain('agent-substrate');
  });

  for (const pkg of packageDirs) {
    it(`T12.${pkg.name} — no forbidden references in packages/${pkg.name}/ (.ts, .md, .sh, .json, .txt)`, () => {
      const files = collectFiles(pkg.path);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const content = readFileSync(file, 'utf8');
        expect(content, `File ${file} contains forbidden references`).not.toMatch(FORBIDDEN_PATTERN);
      }
    });
  }

  it('T12.3 — no hardcoded vendor-specific paths in TS source (only in CLI scaffolding logic)', () => {
    const swarmTsFiles = collectFiles(join(packagesRoot, 'swarm')).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));
    const vendorPath = new RegExp('\\.' + ['vre', 'ko'].join('') + '-swarm');
    for (const file of swarmTsFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `TS file ${file} contains vendor-specific path`).not.toMatch(vendorPath);
    }
  });
});
