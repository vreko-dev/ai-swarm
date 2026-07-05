import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const swarmPkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
);
const cliPkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'swarm-cli', 'package.json'), 'utf8'),
);

describe('T8: package-structure', () => {
  it('T8.1 — @marcellelabs/swarm name is correct', () => {
    expect(swarmPkg.name).toBe('@marcellelabs/swarm');
  });

  it('T8.2 — type is module', () => {
    expect(swarmPkg.type).toBe('module');
  });

  it('T8.3 — exports map has "." entry', () => {
    expect(swarmPkg.exports).toBeDefined();
    expect(swarmPkg.exports['.']).toBeDefined();
  });

  it('T8.4 — exports map has ./observability and ./types subpath entries', () => {
    expect(swarmPkg.exports['./observability']).toBeDefined();
    expect(swarmPkg.exports['./types']).toBeDefined();
  });

  it('T8.5 — no forbidden references in package.json', () => {
    const raw = JSON.stringify(swarmPkg);
    const forbidden = new RegExp(['vre', 'ko', '|@vre', 'ko', '|snap', 'back', '|dop', 'pler', '|pion', 'eer', '|Lin', 'ear'].join(''), 'i');
    expect(raw).not.toMatch(forbidden);
  });

  it('T8.6 — @anthropic-ai/claude-agent-sdk is optional peer dependency', () => {
    expect(swarmPkg.peerDependencies).toBeDefined();
    expect(swarmPkg.peerDependencies['@anthropic-ai/claude-agent-sdk']).toBeDefined();
    expect(swarmPkg.peerDependenciesMeta).toBeDefined();
    expect(swarmPkg.peerDependenciesMeta['@anthropic-ai/claude-agent-sdk']).toBeDefined();
    expect(swarmPkg.peerDependenciesMeta['@anthropic-ai/claude-agent-sdk'].optional).toBe(true);
  });

  it('T8.7 — CLI bin has create-swarm entry', () => {
    expect(cliPkg.bin).toBeDefined();
    expect(cliPkg.bin['create-swarm']).toBeDefined();
  });

  it('T8.8 — CLI depends on @marcellelabs/swarm via workspace:*', () => {
    expect(cliPkg.dependencies).toBeDefined();
    expect(cliPkg.dependencies['@marcellelabs/swarm']).toBe('workspace:*');
  });

  it('T8.9 — files array includes dist, templates, scripts', () => {
    expect(swarmPkg.files).toBeDefined();
    expect(swarmPkg.files).toContain('dist');
    expect(swarmPkg.files).toContain('templates');
    expect(swarmPkg.files).toContain('scripts');
  });
});
