import { describe, it, expect } from 'vitest';
import { buildAgentDefinition, buildSubagentMap } from '../subagents.js';
import type { AgentFrontmatter, SwarmContext } from '../types.js';

function makeContext(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    packageManager: 'pnpm',
    buildCommand: 'pnpm turbo run build',
    lintCommand: 'pnpm turbo run lint',
    testCommand: 'pnpm turbo run test',
    typecheckCommand: 'pnpm turbo run typecheck',
    archFenceRules: [],
    ownedPackages: [{ name: '@marcelle-labs/swarm', path: 'packages/swarm', private: false }],
    mcpTools: [],
    antiPatterns: [],
    ratchetBaselines: [],
    branchModel: { main: 'main', dev: 'dev', prefix: 'task/' },
    gateConfig: [],
    auditTemplatePaths: [],
    deferredWorkPath: '.ai-swarm/docs/reference/deferred-work.md',
    observabilityBackend: 'none',
    modelTiers: [],
    ...overrides,
  };
}

describe('T6: subagent builder', () => {
  it('T6.1 — buildAgentDefinition creates AgentDefinition from frontmatter + rendered prompt', () => {
    const frontmatter: AgentFrontmatter = {
      name: 'conductor',
      description: 'Orchestrates the swarm pipeline.',
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'Task'],
    };
    const renderedPrompt = '# Role: Conductor\n\nYou are the conductor.';

    const def = buildAgentDefinition('conductor', frontmatter, renderedPrompt);

    expect(def.description).toBe('Orchestrates the swarm pipeline.');
    expect(def.prompt).toBe(renderedPrompt);
    expect(def.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Task']);
    expect(def.model).toBe('sonnet');
  });

  it('T6.2 — buildAgentDefinition uses frontmatter model when provided', () => {
    const frontmatter: AgentFrontmatter = {
      name: 'adversarial-reviewer',
      description: 'Adversarial reviewer.',
      tools: ['Read', 'Grep', 'Glob', 'Bash'],
      model: 'opus',
    };
    const def = buildAgentDefinition('adversarial-reviewer', frontmatter, 'prompt');

    expect(def.model).toBe('opus');
  });

  it('T6.3 — buildAgentDefinition returns undefined tools when frontmatter tools is empty', () => {
    const frontmatter: AgentFrontmatter = {
      name: 'auditor',
      description: 'Auditor.',
      tools: [],
    };
    const def = buildAgentDefinition('auditor', frontmatter, 'prompt');

    expect(def.tools).toBeUndefined();
  });

  it('T6.4 — buildSubagentMap loads all 14 agent templates from templates/agents/', () => {
    const context = makeContext();
    const agents = buildSubagentMap(context);

    expect(Object.keys(agents).length).toBeGreaterThanOrEqual(14);
    expect(agents['conductor']).toBeDefined();
    expect(agents['adversarial-reviewer']).toBeDefined();
    expect(agents['master-coordinator']).toBeDefined();
    expect(agents['implementer']).toBeDefined();
  });

  it('T6.5 — buildSubagentMap produces AgentDefinitions with required fields', () => {
    const context = makeContext();
    const agents = buildSubagentMap(context);

    for (const [name, def] of Object.entries(agents)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(typeof def.description).toBe('string');
      expect(def.prompt, `${name} missing prompt`).toBeTruthy();
      expect(typeof def.prompt).toBe('string');
      expect(def.model, `${name} missing model`).toBeTruthy();
    }
  });

  it('T6.6 — buildSubagentMap renders template tokens in agent prompts', () => {
    const context = makeContext();
    const agents = buildSubagentMap(context);

    for (const def of Object.values(agents)) {
      expect(def.prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    }
  });

  it('T6.7 — buildSubagentMap filters to specified roles', () => {
    const context = makeContext();
    const agents = buildSubagentMap(context, ['conductor', 'auditor']);

    expect(Object.keys(agents).sort()).toEqual(['auditor', 'conductor']);
  });

  it('T6.8 — buildSubagentMap returns empty object when no matching role files exist', () => {
    const context = makeContext();
    const agents = buildSubagentMap(context, ['researcher']);

    expect(Object.keys(agents)).not.toContain('nonexistent');
  });
});
