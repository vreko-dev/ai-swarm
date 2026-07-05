import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SwarmContext, Role } from '../types.js';

const { mockQuery, throwFlag } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  throwFlag: { value: false },
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  if (throwFlag.value) {
    throw new Error('Module not found: @anthropic-ai/claude-agent-sdk');
  }
  return { query: mockQuery };
});

import { dispatchRole, ROLE_TOOLS } from '../dispatch.js';

function makeContext(overrides: Partial<SwarmContext> = {}): SwarmContext {
  return {
    packageManager: 'pnpm',
    buildCommand: 'pnpm turbo run build',
    lintCommand: 'pnpm turbo run lint',
    testCommand: 'pnpm turbo run test',
    typecheckCommand: 'pnpm turbo run typecheck',
    archFenceRules: [],
    ownedPackages: [{ name: '@marcellelabs/swarm', path: 'packages/swarm', private: false }],
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

beforeEach(() => {
  mockQuery.mockReset();
  throwFlag.value = false;
});

afterEach(() => {
  throwFlag.value = false;
});

describe('T4: dispatch', () => {
  it('T4.1 — throws clear error with install instructions when SDK not installed', async () => {
    throwFlag.value = true;
    vi.resetModules();
    const { dispatchRole: dynamicDispatch } = await import('../dispatch.js');
    await expect(
      dynamicDispatch({
        role: 'conductor',
        taskPrompt: 'test',
        context: makeContext(),
      }),
    ).rejects.toThrow(/not installed/);
    throwFlag.value = false;
    vi.resetModules();
    await import('../dispatch.js');
  });

  it('T4.2 — calls renderTemplate() on agent template before dispatch', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test task',
      context: makeContext(),
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const config = mockQuery.mock.calls[0][0];
    expect(config.systemPrompt.append).toBeDefined();
    expect(config.systemPrompt.append).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('T4.3 — passes systemPrompt.append with rendered prompt', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'auditor',
      taskPrompt: 'audit task',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.systemPrompt.append).toBeDefined();
    expect(typeof config.systemPrompt.append).toBe('string');
    expect(config.systemPrompt.append.length).toBeGreaterThan(0);
  });

  it('T4.4 — sets systemPrompt.preset to "claude_code"', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.systemPrompt.preset).toBe('claude_code');
  });

  it('T4.5 — sets excludeDynamicSections to true by default', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.excludeDynamicSections).toBe(true);
  });

  it('T4.6 — sets settingSources to ["project"]', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.settingSources).toEqual(['project']);
  });

  it('T4.7 — routes to correct model per role via getModelForRole()', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'adversarial-reviewer',
      taskPrompt: 'review',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.model).toContain('opus');
  });

  it('T4.8 — restricts tools per role via ROLE_TOOLS map', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'auditor',
      taskPrompt: 'audit',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.allowedTools).toEqual(ROLE_TOOLS['auditor']);
  });

  it('T4.9 — allows custom tools override via DispatchOptions.tools', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    const customTools = ['Read', 'Write', 'CustomTool'];
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
      tools: customTools,
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.allowedTools).toEqual(customTools);
  });

  it('T4.10 — uses workingDirectory when provided, falls back to process.cwd()', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    const customDir = '/tmp/test-workdir';
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
      workingDirectory: customDir,
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.cwd).toBe(customDir);
  });

  it('T4.11 — ROLE_TOOLS has entries for all 14 roles', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_TOOLS[role], `Missing ROLE_TOOLS entry for ${role}`).toBeDefined();
      expect(Array.isArray(ROLE_TOOLS[role])).toBe(true);
      expect(ROLE_TOOLS[role].length).toBeGreaterThan(0);
    }
  });

  it('T4.12 — returns result.text when available', async () => {
    mockQuery.mockResolvedValue({ text: 'expected output' });
    const result = await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    expect(result).toBe('expected output');
  });

  it('T4.13 — returns String(result) when text property is absent', async () => {
    mockQuery.mockResolvedValue({ custom: 'data' });
    const result = await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    expect(result).toBe(String({ custom: 'data' }));
  });

  it('T4.14 — passes agents to SDK query when provided', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    const agents = {
      'code-reviewer': {
        description: 'Code reviewer',
        prompt: 'You are a code reviewer.',
        tools: ['Read', 'Grep', 'Glob'],
        model: 'sonnet',
      },
    };
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'review the code',
      context: makeContext(),
      agents,
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.agents).toEqual(agents);
  });

  it('T4.15 — adds Agent tool to allowedTools when agents are provided', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
      agents: {
        'reviewer': {
          description: 'Reviewer',
          prompt: 'You are a reviewer.',
        },
      },
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.allowedTools).toContain('Agent');
  });

  it('T4.16 — does not add Agent tool when no agents provided', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.allowedTools).not.toContain('Agent');
  });

  it('T4.17 — passes hooks to SDK query when provided', async () => {
    mockQuery.mockResolvedValue({ text: 'done' });
    const hooks = {
      PreToolUse: [{
        matcher: 'Write|Edit',
        hooks: [async () => ({ continue: true })],
      }],
    };
    await dispatchRole({
      role: 'conductor',
      taskPrompt: 'test',
      context: makeContext(),
      hooks,
    });
    const config = mockQuery.mock.calls[0][0];
    expect(config.hooks).toEqual(hooks);
  });
});
