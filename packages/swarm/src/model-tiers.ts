import type { ModelTierConfig, Role } from './types.js';

export const MODEL_TIERS: ModelTierConfig[] = [
  { role: 'conductor', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'auditor', tier: 'haiku', model: 'claude-haiku-4-20250506' },
  { role: 'spec-writer', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'implementer', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'drift-detector', tier: 'haiku', model: 'claude-haiku-4-20250506' },
  { role: 'adversarial-reviewer', tier: 'opus', model: 'claude-opus-4-20250514' },
  { role: 'reviewer', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'gatekeeper', tier: 'haiku', model: 'claude-haiku-4-20250506' },
  { role: 'integrator', tier: 'haiku', model: 'claude-haiku-4-20250506' },
  { role: 'researcher', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'devsecops', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'technical-writer', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'release-manager', tier: 'sonnet', model: 'claude-sonnet-4-20250514' },
  { role: 'master-coordinator', tier: 'opus', model: 'claude-opus-4-20250514' },
];

export function getModelForRole(role: Role): ModelTierConfig {
  const config = MODEL_TIERS.find((m) => m.role === role);
  if (!config) {
    throw new Error(`No model tier configured for role: ${role}`);
  }
  return config;
}

export function getTierForRole(role: Role): 'haiku' | 'sonnet' | 'opus' {
  return getModelForRole(role).tier;
}
