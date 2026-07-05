import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const templatesDir = join(__dirname, '..', '..', 'templates');
const agentsDir = join(templatesDir, 'agents');
const auditTemplatesDir = join(templatesDir, 'audit-templates');

const ALL_ROLES = [
  'conductor',
  'auditor',
  'spec-writer',
  'implementer',
  'drift-detector',
  'adversarial-reviewer',
  'reviewer',
  'gatekeeper',
  'integrator',
  'researcher',
  'devsecops',
  'technical-writer',
  'release-manager',
  'master-coordinator',
];

const FORBIDDEN_PATTERN = new RegExp(['vre', 'ko', '|@vre', 'ko', '|snap', 'back', '|dop', 'pler', '|pion', 'eer', '|Lin', 'ear'].join(''), 'i');

describe('T9: template-invariants', () => {
  it('T9.1 — all 14 agent template files exist', () => {
    for (const role of ALL_ROLES) {
      const path = join(agentsDir, `${role}.md`);
      expect(existsSync(path), `Missing agent template: ${role}.md`).toBe(true);
    }
  });

  it('T9.2 — no agent template contains forbidden references', () => {
    for (const role of ALL_ROLES) {
      const content = readFileSync(join(agentsDir, `${role}.md`), 'utf8');
      expect(content, `Agent template ${role}.md contains forbidden references`).not.toMatch(FORBIDDEN_PATTERN);
    }
  });

  it('T9.3 — no agent template has hardcoded build commands', () => {
    const hardcodedPatterns = [/pnpm turbo/, /pnpm biome/, /npm run build/];
    for (const role of ALL_ROLES) {
      const content = readFileSync(join(agentsDir, `${role}.md`), 'utf8');
      for (const pattern of hardcodedPatterns) {
        expect(content, `Agent template ${role}.md contains hardcoded build command: ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('T9.4 — meta-canon.md exists and contains "conflict rule" and "extractability"', () => {
    const path = join(templatesDir, 'meta-canon.md');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toMatch(/conflict/i);
    expect(content).toMatch(/extractab/i);
  });

  it('T9.5 — meta-canon.md has no forbidden references', () => {
    const content = readFileSync(join(templatesDir, 'meta-canon.md'), 'utf8');
    expect(content).not.toMatch(FORBIDDEN_PATTERN);
  });

  it('T9.6 — all 6 audit template files exist', () => {
    const expectedTemplates = [
      'internal-ground-truth',
      'architecture-fence-check',
      'ratchet-baseline-capture',
      'caller-callee-impact',
      'test-inventory',
      'external-dependency-enumeration',
    ];
    for (const name of expectedTemplates) {
      const path = join(auditTemplatesDir, `${name}.md`);
      expect(existsSync(path), `Missing audit template: ${name}.md`).toBe(true);
    }
  });

  it('T9.7 — ratchet.template.json has >= 4 ratchets and no forbidden references', () => {
    const path = join(templatesDir, 'ratchet.template.json');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).not.toMatch(FORBIDDEN_PATTERN);
    const data = JSON.parse(content);
    expect(data.ratchets.length).toBeGreaterThanOrEqual(4);
  });

  it('T9.8 — anti-patterns.template.md contains AP-3, AP-6, AP-7, AP-9 and no forbidden refs', () => {
    const path = join(templatesDir, 'anti-patterns.template.md');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).not.toMatch(FORBIDDEN_PATTERN);
    expect(content).toMatch(/AP-3/);
    expect(content).toMatch(/AP-6/);
    expect(content).toMatch(/AP-7/);
    expect(content).toMatch(/AP-9/);
  });

  it('T9.9 — architecture-fence.template.txt contains {{OWNED_PACKAGES}} and no forbidden refs', () => {
    const path = join(templatesDir, 'architecture-fence.template.txt');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).not.toMatch(FORBIDDEN_PATTERN);
    expect(content).toContain('{{OWNED_PACKAGES}}');
  });
});
