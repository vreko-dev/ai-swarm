import { describe, it, expect } from 'vitest';
import { MODEL_TIERS, getModelForRole, getTierForRole } from '../model-tiers.js';
import type { Role } from '../types.js';

const ALL_ROLES: Role[] = [
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

describe('T2: model-tiers', () => {
  it('T2.1 — MODEL_TIERS has exactly 14 entries (one per Role)', () => {
    expect(MODEL_TIERS).toHaveLength(14);
  });

  it('T2.2 — every Role union member has a matching MODEL_TIERS entry', () => {
    const configuredRoles = MODEL_TIERS.map((m) => m.role);
    for (const role of ALL_ROLES) {
      expect(configuredRoles).toContain(role);
    }
  });

  it('T2.3 — getModelForRole("adversarial-reviewer") returns opus tier', () => {
    expect(getModelForRole('adversarial-reviewer').tier).toBe('opus');
  });

  it('T2.4 — getModelForRole("master-coordinator") returns opus tier', () => {
    expect(getModelForRole('master-coordinator').tier).toBe('opus');
  });

  it('T2.5 — getModelForRole("auditor") returns haiku tier', () => {
    expect(getModelForRole('auditor').tier).toBe('haiku');
  });

  it('T2.6 — getModelForRole("conductor") returns sonnet tier', () => {
    expect(getModelForRole('conductor').tier).toBe('sonnet');
  });

  it('T2.7 — getModelForRole() throws on unknown role', () => {
    expect(() => getModelForRole('nonexistent' as Role)).toThrow(/No model tier configured/);
  });

  it('T2.8 — getTierForRole() returns haiku|sonnet|opus for all 14 roles', () => {
    for (const role of ALL_ROLES) {
      const tier = getTierForRole(role);
      expect(['haiku', 'sonnet', 'opus']).toContain(tier);
    }
  });
});
