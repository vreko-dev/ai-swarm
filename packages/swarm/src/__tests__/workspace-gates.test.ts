import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

const packageDirs = readdirSync(repoRoot)
  .filter((entry) => {
    const fullPath = join(repoRoot, entry);
    return statSync(fullPath).isDirectory() && existsSync(join(fullPath, 'package.json'));
  })
  .map((entry) => ({ name: entry, path: join(repoRoot, entry) }));

describe('T13: workspace gate — no package may lack typecheck/lint', () => {
  it('T13.0 — packageDirs includes all expected packages', () => {
    const names = packageDirs.map((p) => p.name);
    expect(names).toContain('swarm');
    expect(names).toContain('swarm-cli');
    expect(names).toContain('agent-substrate');
  });

  for (const pkg of packageDirs) {
    it(`T13.${pkg.name} — has non-empty typecheck and lint scripts`, () => {
      const pkgJson = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8'));
      const scripts = pkgJson.scripts ?? {};

      expect(scripts.typecheck, `packages/${pkg.name}/package.json missing scripts.typecheck`).toBeDefined();
      expect(typeof scripts.typecheck, `packages/${pkg.name}/package.json scripts.typecheck must be a string`).toBe('string');
      expect(scripts.typecheck.length, `packages/${pkg.name}/package.json scripts.typecheck must be non-empty`).toBeGreaterThan(0);

      expect(scripts.lint, `packages/${pkg.name}/package.json missing scripts.lint`).toBeDefined();
      expect(typeof scripts.lint, `packages/${pkg.name}/package.json scripts.lint must be a string`).toBe('string');
      expect(scripts.lint.length, `packages/${pkg.name}/package.json scripts.lint must be non-empty`).toBeGreaterThan(0);

      expect(scripts.test, `packages/${pkg.name}/package.json missing scripts.test`).toBeDefined();
      expect(typeof scripts.test, `packages/${pkg.name}/package.json scripts.test must be a string`).toBe('string');
      expect(scripts.test.length, `packages/${pkg.name}/package.json scripts.test must be non-empty`).toBeGreaterThan(0);
    });
  }
});
