import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const scriptsDir = join(__dirname, '..', '..', 'scripts');

const EXPECTED_SCRIPTS = [
  'branch-check.sh',
  'check-definition-of-ready.sh',
  'check-mutation-rate.sh',
  'drift-detect.sh',
  'install-worktree-hooks.sh',
  'post-merge-scope-check.sh',
  'swarm-state.sh',
  'validate-agent-output.sh',
  'workspace-intel.sh',
];

const FORBIDDEN_PATTERN = new RegExp(['vre', 'ko', '|@vre', 'ko', '|snap', 'back', '|dop', 'pler', '|pion', 'eer', '|Lin', 'ear'].join(''), 'i');

function readScript(name: string): string {
  return readFileSync(join(scriptsDir, name), 'utf8');
}

describe('T10: shell-scripts', () => {
  it('T10.1 — all 9 scripts have valid bash syntax (bash -n)', () => {
    for (const script of EXPECTED_SCRIPTS) {
      const path = join(scriptsDir, script);
      expect(existsSync(path), `Missing script: ${script}`).toBe(true);
      expect(() => execSync(`bash -n ${path}`, { encoding: 'utf8' }), `Syntax error in ${script}`).not.toThrow();
    }
  });

  it('T10.2 — swarm-state.sh uses SWARM_DIR, not vendor-specific dirs', () => {
    const content = readScript('swarm-state.sh');
    expect(content).toMatch(/SWARM_DIR/);
    expect(content).not.toMatch(new RegExp('\\.' + ['vre', 'ko'].join('') + '-swarm'));
  });

  it('T10.3 — swarm-state.sh supports init, sync, status, next, gate-open, gate-close, dispatch, merge', () => {
    const content = readScript('swarm-state.sh');
    for (const cmd of ['init', 'sync', 'status', 'next', 'gate-open', 'gate-close', 'dispatch', 'merge']) {
      expect(content, `swarm-state.sh missing command: ${cmd}`).toContain(cmd);
    }
  });

  it('T10.4 — swarm-state.sh has check-gate-guard with lock mechanism', () => {
    const content = readScript('swarm-state.sh');
    expect(content).toContain('check-gate-guard');
    expect(content).toMatch(/lock/i);
  });

  it('T10.5 — drift-detect.sh uses SWARM_DIR, not vendor-specific dirs', () => {
    const content = readScript('drift-detect.sh');
    expect(content).toMatch(/SWARM_DIR/);
    expect(content).not.toMatch(new RegExp('\\.' + ['vre', 'ko'].join('') + '-swarm'));
  });

  it('T10.6 — drift-detect.sh implements all 5 checks: Exclusion Fence, Deferred Work, Anti-Pattern, Registration, Completion Count', () => {
    const content = readScript('drift-detect.sh');
    expect(content).toMatch(/Exclusion Fence/i);
    expect(content).toMatch(/Deferred Work/i);
    expect(content).toMatch(/Anti-Pattern/i);
    expect(content).toMatch(/Registration/i);
    expect(content).toMatch(/Completion Count/i);
  });

  it('T10.7 — check-definition-of-ready.sh validates Owned Files, shell-verifiable, PLACEHOLDER', () => {
    const content = readScript('check-definition-of-ready.sh');
    expect(content).toContain('Owned Files');
    expect(content).toMatch(/bash|shell-verifiable/i);
    expect(content).toMatch(/placeholder/i);
  });

  it('T10.8 — post-merge-scope-check.sh extracts Owned Files and has SCOPE_BREACH', () => {
    const content = readScript('post-merge-scope-check.sh');
    expect(content).toContain('Owned Files');
    expect(content).toContain('SCOPE_BREACH');
  });

  it('T10.9 — validate-agent-output.sh validates adversarial-reviewer, auditor, spec-writer sections', () => {
    const content = readScript('validate-agent-output.sh');
    expect(content).toContain('adversarial-reviewer');
    expect(content).toContain('auditor');
    expect(content).toContain('spec-writer');
  });

  it('T10.10 — check-mutation-rate.sh has files_changed, no vendor dirs', () => {
    const content = readScript('check-mutation-rate.sh');
    expect(content).toContain('files_changed');
    expect(content).not.toMatch(new RegExp('\\.' + ['vre', 'ko'].join('') + '-swarm'));
  });

  it('T10.11 — install-worktree-hooks.sh installs pre-commit with check-gate-guard', () => {
    const content = readScript('install-worktree-hooks.sh');
    expect(content).toContain('pre-commit');
    expect(content).toContain('check-gate-guard');
  });

  it('T10.12 — workspace-intel.sh has no forbidden references', () => {
    const content = readScript('workspace-intel.sh');
    expect(content).not.toMatch(FORBIDDEN_PATTERN);
  });

  it('T10.13 — no script in scripts/ contains forbidden references', () => {
    const files = readdirSync(scriptsDir).filter((f) => f.endsWith('.sh'));
    for (const file of files) {
      const content = readFileSync(join(scriptsDir, file), 'utf8');
      expect(content, `Script ${file} contains forbidden references`).not.toMatch(FORBIDDEN_PATTERN);
    }
  });
});
